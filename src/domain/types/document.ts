export const RIDER_DOCUMENT_TYPES = [
  'GHANA_CARD',
  'DRIVERS_LICENSE',
  'ROADWORTHY',
  'INSURANCE',
  'PROFILE_PHOTO',
] as const;

export type RiderDocumentType = (typeof RIDER_DOCUMENT_TYPES)[number];

export type RiderDocumentStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface RiderDocument {
  id: string;
  riderId: string;
  docType: RiderDocumentType;
  documentNumber: string;
  /** ISO date (YYYY-MM-DD) or null when the document has no expiry. */
  expiryDate: string | null;
  storagePath: string;
  contentType: string;
  status: RiderDocumentStatus;
  reviewNote: string | null;
  reviewedAt: Date | null;
  submittedAt: Date;
}

/** Rules per document type, shared by validation and the API response. */
export const DOCUMENT_RULES: Record<
  RiderDocumentType,
  {
    label: string;
    expiryRequired: boolean;
    numberPattern?: RegExp;
    numberHint: string;
    /** false for the profile photo: there is no number to type. */
    numberRequired?: boolean;
    /** Photos only (no PDF). */
    imageOnly?: boolean;
  }
> = {
  GHANA_CARD: {
    label: 'Ghana Card',
    expiryRequired: true,
    numberPattern: /^GHA-\d{9}-\d$/,
    numberHint: 'Format GHA-123456789-0',
  },
  DRIVERS_LICENSE: {
    label: "Driver's licence (motorcycle)",
    expiryRequired: true,
    numberHint: 'Licence number as printed on the card',
  },
  ROADWORTHY: {
    label: 'Roadworthy certificate',
    expiryRequired: true,
    numberHint: 'Motorbike registration number, e.g. M-24-GR 1234',
  },
  INSURANCE: {
    label: 'Motorbike insurance',
    expiryRequired: true,
    numberHint: 'Policy or certificate number',
  },
  PROFILE_PHOTO: {
    label: 'Profile photo (selfie)',
    expiryRequired: false,
    numberRequired: false,
    imageOnly: true,
    numberHint: 'A clear photo of your face: no helmet, hat or sunglasses',
  },
};

export function isRiderDocumentType(value: string): value is RiderDocumentType {
  return (RIDER_DOCUMENT_TYPES as readonly string[]).includes(value);
}
