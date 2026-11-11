export type RiderDocumentType = 'GHANA_CARD' | 'DRIVERS_LICENSE' | 'ROADWORTHY' | 'INSURANCE';

export type DocumentChecklistStatus = 'MISSING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

/** One row of GET /riders/me/documents (the backend is the source of truth for labels/rules). */
export interface DocumentChecklistItem {
  docType: RiderDocumentType;
  label: string;
  numberHint: string;
  expiryRequired: boolean;
  status: DocumentChecklistStatus;
  id: string | null;
  documentNumber: string | null;
  /** YYYY-MM-DD */
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

/** A photo picked from the camera or gallery, ready to upload. */
export interface PickedFile {
  uri: string;
  mimeType: string;
  fileName: string;
}
