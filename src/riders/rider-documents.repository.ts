import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RiderDocument, RiderDocumentStatus, RiderDocumentType } from '../domain/types/document';

interface RawDocumentRow {
  id: string;
  rider_id: string;
  doc_type: RiderDocumentType;
  document_number: string;
  expiry_date: string | Date | null;
  storage_path: string;
  content_type: string;
  status: RiderDocumentStatus;
  review_note: string | null;
  reviewed_at: string | Date | null;
  submitted_at: string | Date;
}

const COLUMNS = `id, rider_id, doc_type, document_number, expiry_date, storage_path, content_type,
  status, review_note, reviewed_at, submitted_at`;

function toIsoDate(value: string | Date | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  // pg returns DATE as a local-midnight Date; format without timezone shifting
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mapRow(row: RawDocumentRow): RiderDocument {
  return {
    id: row.id,
    riderId: row.rider_id,
    docType: row.doc_type,
    documentNumber: row.document_number,
    expiryDate: toIsoDate(row.expiry_date),
    storagePath: row.storage_path,
    contentType: row.content_type,
    status: row.status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
    submittedAt: new Date(row.submitted_at),
  };
}

export interface UpsertDocumentParams {
  riderId: string;
  docType: RiderDocumentType;
  documentNumber: string;
  expiryDate: string | null;
  storagePath: string;
  contentType: string;
}

@Injectable()
export class RiderDocumentsRepository {
  constructor(private readonly db: DatabaseService) {}

  async listForRider(riderId: string): Promise<RiderDocument[]> {
    const res = await this.db.query<RawDocumentRow>(
      `SELECT ${COLUMNS} FROM rider_documents WHERE rider_id = $1 ORDER BY doc_type`,
      [riderId],
    );
    return res.rows.map(mapRow);
  }

  async findById(riderId: string, documentId: string): Promise<RiderDocument | null> {
    const res = await this.db.query<RawDocumentRow>(
      `SELECT ${COLUMNS} FROM rider_documents WHERE rider_id = $1 AND id = $2`,
      [riderId, documentId],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  /**
   * Inserts the rider's document of this type, or replaces it on resubmission. Replacing always
   * resets the review: a new file must be looked at again.
   */
  async upsert(params: UpsertDocumentParams): Promise<RiderDocument> {
    const res = await this.db.query<RawDocumentRow>(
      `INSERT INTO rider_documents (
         rider_id, doc_type, document_number, expiry_date, storage_path, content_type, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'SUBMITTED')
       ON CONFLICT (rider_id, doc_type) DO UPDATE
       SET document_number = EXCLUDED.document_number,
           expiry_date = EXCLUDED.expiry_date,
           storage_path = EXCLUDED.storage_path,
           content_type = EXCLUDED.content_type,
           status = 'SUBMITTED',
           review_note = NULL,
           reviewed_by = NULL,
           reviewed_at = NULL,
           submitted_at = NOW()
       RETURNING ${COLUMNS}`,
      [
        params.riderId,
        params.docType,
        params.documentNumber,
        params.expiryDate,
        params.storagePath,
        params.contentType,
      ],
    );
    return mapRow(res.rows[0]);
  }

  async review(
    riderId: string,
    documentId: string,
    status: 'APPROVED' | 'REJECTED',
    note: string | null,
    adminId: string,
  ): Promise<RiderDocument | null> {
    const res = await this.db.query<RawDocumentRow>(
      `UPDATE rider_documents
       SET status = $3, review_note = $4, reviewed_by = $5, reviewed_at = NOW()
       WHERE rider_id = $1 AND id = $2
       RETURNING ${COLUMNS}`,
      [riderId, documentId, status, note, adminId],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }
}
