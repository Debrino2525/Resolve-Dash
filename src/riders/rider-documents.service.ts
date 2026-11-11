import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DOCUMENT_RULES,
  isRiderDocumentType,
  RIDER_DOCUMENT_TYPES,
  RiderDocument,
  RiderDocumentType,
} from '../domain/types/document';
import {
  RIDER_DOCUMENTS_BUCKET,
  StoredFile,
  SupabaseStorageClient,
} from '../storage/supabase-storage.client';
import { RiderDocumentsRepository } from './rider-documents.repository';
import { RiderRepository } from './rider.repository';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/** The parts of a multer file we use (avoids depending on @types/multer). */
export interface UploadedDocumentFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface DocumentInput {
  documentNumber?: string;
  expiryDate?: string;
}

export type DocumentChecklistStatus = 'MISSING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface DocumentChecklistItem {
  docType: RiderDocumentType;
  label: string;
  numberHint: string;
  expiryRequired: boolean;
  status: DocumentChecklistStatus;
  id: string | null;
  documentNumber: string | null;
  expiryDate: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  contentType: string | null;
}

export interface DocumentChecklist {
  items: DocumentChecklistItem[];
  submittedCount: number;
  approvedCount: number;
  requiredCount: number;
}

const FILE_KINDS: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': {
    ext: 'png',
    magic: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    ext: 'webp',
    magic: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  'application/pdf': { ext: 'pdf', magic: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
};

/**
 * Rider compliance documents (Ghana Card, licence, roadworthy, insurance).
 * Files go to private Supabase Storage using the caller's own JWT; metadata lives in
 * rider_documents. Admin approval of the rider requires every document (four papers and the
 * profile photo) APPROVED.
 */
@Injectable()
export class RiderDocumentsService {
  constructor(
    private readonly documents: RiderDocumentsRepository,
    private readonly riders: RiderRepository,
    private readonly storage: SupabaseStorageClient,
  ) {}

  async getChecklist(riderId: string): Promise<DocumentChecklist> {
    return buildChecklist(await this.documents.listForRider(riderId));
  }

  async submit(
    riderId: string,
    accessToken: string,
    rawType: string,
    input: DocumentInput,
    file: UploadedDocumentFile | undefined,
    today: Date = new Date(),
  ): Promise<DocumentChecklist> {
    if (!isRiderDocumentType(rawType)) {
      throw new NotFoundException(`Unknown document type: ${rawType}`);
    }
    const docType = rawType;
    const rules = DOCUMENT_RULES[docType];

    const rider = await this.riders.findRiderById(riderId);
    if (!rider) {
      throw new NotFoundException('Complete your rider profile before uploading documents.');
    }
    if (rider.onboardingStatus === 'REJECTED') {
      throw new ForbiddenException('This rider application was not approved.');
    }

    // The profile photo has no number to type; store a fixed marker (the column is NOT NULL).
    const documentNumber =
      rules.numberRequired === false ? 'SELFIE' : (input.documentNumber ?? '').trim().toUpperCase();
    if (documentNumber.length < 3 || documentNumber.length > 60) {
      throw new BadRequestException(`Enter the ${rules.label} number. ${rules.numberHint}.`);
    }
    if (rules.numberPattern && !rules.numberPattern.test(documentNumber)) {
      throw new BadRequestException(`${rules.label} number looks wrong. ${rules.numberHint}.`);
    }

    const expiryDate = parseExpiry(input.expiryDate, rules.expiryRequired, rules.label, today);

    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('Attach a photo or PDF of the document.');
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('The file is larger than 5 MB. Take a smaller photo.');
    }
    const kind = FILE_KINDS[file.mimetype];
    if (!kind || !kind.magic(file.buffer)) {
      throw new BadRequestException('Upload a JPG, PNG or WebP photo, or a PDF.');
    }
    if (rules.imageOnly && file.mimetype === 'application/pdf') {
      throw new BadRequestException(`The ${rules.label} must be a photo, not a PDF.`);
    }

    const storagePath = `${riderId}/${docType}/${Date.now()}.${kind.ext}`;
    await this.storage.upload(
      RIDER_DOCUMENTS_BUCKET,
      storagePath,
      file.buffer,
      file.mimetype,
      accessToken,
    );

    await this.documents.upsert({
      riderId,
      docType,
      documentNumber,
      expiryDate,
      storagePath,
      contentType: file.mimetype,
    });

    return this.getChecklist(riderId);
  }

  /** Admin: the rider's checklist (no file contents). */
  async getChecklistForAdmin(riderId: string): Promise<DocumentChecklist> {
    const rider = await this.riders.findRiderById(riderId);
    if (!rider) throw new NotFoundException(`Rider with id ${riderId} not found`);
    return this.getChecklist(riderId);
  }

  /** Admin: stream one document's file, fetched from Storage with the admin's own JWT. */
  async readFileForAdmin(
    riderId: string,
    documentId: string,
    adminAccessToken: string,
  ): Promise<StoredFile> {
    const doc = await this.requireDocument(riderId, documentId);
    return this.storage.download(RIDER_DOCUMENTS_BUCKET, doc.storagePath, adminAccessToken);
  }

  async review(
    riderId: string,
    documentId: string,
    decision: 'APPROVED' | 'REJECTED',
    note: string | undefined,
    adminId: string,
  ): Promise<DocumentChecklist> {
    await this.requireDocument(riderId, documentId);
    const trimmed = note?.trim() || null;
    if (decision === 'REJECTED' && !trimmed) {
      throw new BadRequestException('Tell the rider what to fix when sending a document back.');
    }
    await this.documents.review(riderId, documentId, decision, trimmed, adminId);
    return this.getChecklist(riderId);
  }

  /** The rider's own profile photo (whatever its review status), for their avatar in the app. */
  async readOwnProfilePhoto(riderId: string, accessToken: string): Promise<StoredFile> {
    const doc = (await this.documents.listForRider(riderId)).find(
      (d) => d.docType === 'PROFILE_PHOTO',
    );
    if (!doc) throw new NotFoundException('No profile photo yet');
    return this.storage.download(RIDER_DOCUMENTS_BUCKET, doc.storagePath, accessToken);
  }

  private async requireDocument(riderId: string, documentId: string): Promise<RiderDocument> {
    const doc = await this.documents.findById(riderId, documentId);
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }
}

export function buildChecklist(docs: RiderDocument[]): DocumentChecklist {
  const byType = new Map(docs.map((d) => [d.docType, d]));
  const items = RIDER_DOCUMENT_TYPES.map((docType): DocumentChecklistItem => {
    const rules = DOCUMENT_RULES[docType];
    const doc = byType.get(docType);
    return {
      docType,
      label: rules.label,
      numberHint: rules.numberHint,
      expiryRequired: rules.expiryRequired,
      status: doc?.status ?? 'MISSING',
      id: doc?.id ?? null,
      documentNumber: doc?.documentNumber ?? null,
      expiryDate: doc?.expiryDate ?? null,
      reviewNote: doc?.reviewNote ?? null,
      submittedAt: doc?.submittedAt.toISOString() ?? null,
      reviewedAt: doc?.reviewedAt?.toISOString() ?? null,
      contentType: doc?.contentType ?? null,
    };
  });
  return {
    items,
    submittedCount: items.filter((i) => i.status !== 'MISSING').length,
    approvedCount: items.filter((i) => i.status === 'APPROVED').length,
    requiredCount: items.length,
  };
}

/** Accepts YYYY-MM-DD; must be a real calendar date and not already past. */
function parseExpiry(
  raw: string | undefined,
  required: boolean,
  label: string,
  today: Date,
): string | null {
  const value = raw?.trim();
  if (!value) {
    if (required) throw new BadRequestException(`Enter the ${label} expiry date.`);
    return null;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!m || !date || date.getUTCMonth() !== +m[2] - 1 || date.getUTCDate() !== +m[3]) {
    throw new BadRequestException('Enter the expiry date as DD/MM/YYYY.');
  }
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (date.getTime() < todayUtc) {
    throw new BadRequestException(`This ${label} has expired. Upload a current one.`);
  }
  return value;
}
