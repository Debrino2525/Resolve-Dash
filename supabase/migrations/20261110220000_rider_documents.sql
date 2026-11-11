-- ============================================================================
-- Migration: Rider compliance documents + private storage bucket
--
-- Riders submit four documents before an admin can approve them:
--   GHANA_CARD, DRIVERS_LICENSE, ROADWORTHY, INSURANCE
-- Each has a number, an optional expiry date and one photo/PDF kept in the
-- private `rider-documents` Storage bucket under <rider uuid>/<type>/<file>.
--
-- File access never uses the service-role key: the backend forwards the
-- caller's own Supabase JWT to Storage, and the storage policies below allow
--   * a rider to upload/read only inside their own folder
--   * an admin (app_metadata.role = 'admin') to read any rider's files.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: rider_documents (one current row per rider per document type)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
    doc_type VARCHAR(30) NOT NULL
        CHECK (doc_type IN ('GHANA_CARD', 'DRIVERS_LICENSE', 'ROADWORTHY', 'INSURANCE')),
    document_number VARCHAR(60) NOT NULL CHECK (length(trim(document_number)) >= 3),
    expiry_date DATE NULL,
    storage_path TEXT NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED'
        CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
    review_note TEXT NULL,
    reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rider_documents_rider_type UNIQUE (rider_id, doc_type),
    -- A rejection must tell the rider what to fix.
    CONSTRAINT chk_rejection_has_note CHECK (status <> 'REJECTED' OR review_note IS NOT NULL),
    -- Files must live in the rider's own folder.
    CONSTRAINT chk_storage_path_owned CHECK (storage_path LIKE rider_id::text || '/%')
);

CREATE INDEX IF NOT EXISTS idx_rider_documents_status ON rider_documents (status);

CREATE TRIGGER trg_rider_documents_updated_at
BEFORE UPDATE ON rider_documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE rider_documents ENABLE ROW LEVEL SECURITY;

-- Clients never touch this table directly; the backend role does.
REVOKE ALL ON rider_documents FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE rider_documents TO ghana_delivery_app;

CREATE POLICY "app_rider_documents_all"
    ON rider_documents FOR ALL
    TO ghana_delivery_app
    USING (true)
    WITH CHECK (true);


-- ----------------------------------------------------------------------------
-- 2. Private Storage bucket (5 MB per file, images and PDF only)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'rider-documents',
    'rider-documents',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ----------------------------------------------------------------------------
-- 3. Storage policies on storage.objects for this bucket only
-- Each upload is a new object (<uuid>/<TYPE>/<timestamp>.<ext>), so riders need
-- INSERT and SELECT only: no UPDATE or DELETE, keeping a history of submissions.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "rider_documents_insert_own" ON storage.objects;
CREATE POLICY "rider_documents_insert_own"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'rider-documents'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

DROP POLICY IF EXISTS "rider_documents_select_own_or_admin" ON storage.objects;
CREATE POLICY "rider_documents_select_own_or_admin"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'rider-documents'
        AND (
            (storage.foldername(name))[1] = (SELECT auth.uid())::text
            OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
        )
    );
