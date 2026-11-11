-- ============================================================================
-- Migration: rider profile photo (selfie) as a fifth rider document
-- ============================================================================
-- The photo is uploaded like the other documents (private rider-documents bucket, own folder),
-- reviewed by admins against the Ghana Card, and required before a rider is approved.
--
-- Customers may see a rider's photo only once an admin has APPROVED it, and only during a
-- delivery with that rider that is in progress (ASSIGNED / PICKED_UP). Storage enforces this with
-- the SECURITY DEFINER check below, called from the bucket's SELECT policy; the API also checks.
-- Safe to run more than once.

-- 1. Allow the new document type.
ALTER TABLE public.rider_documents DROP CONSTRAINT IF EXISTS rider_documents_doc_type_check;
ALTER TABLE public.rider_documents ADD CONSTRAINT rider_documents_doc_type_check
    CHECK (doc_type IN ('GHANA_CARD', 'DRIVERS_LICENSE', 'ROADWORTHY', 'INSURANCE', 'PROFILE_PHOTO'));

-- 2. May the signed-in customer read this storage object as their rider's approved photo?
CREATE OR REPLACE FUNCTION public.can_read_rider_photo(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.rider_documents d
        JOIN public.delivery_orders o ON o.rider_id = d.rider_id
        WHERE d.storage_path = p_name
          AND d.doc_type = 'PROFILE_PHOTO'
          AND d.status = 'APPROVED'
          AND o.customer_id = (SELECT auth.uid())
          AND o.status IN ('ASSIGNED', 'PICKED_UP')
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_rider_photo(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_rider_photo(TEXT) TO authenticated;

-- 3. Rider documents bucket: own folder, admins, or (new) a customer's current rider's photo.
DROP POLICY IF EXISTS "rider_documents_select_own_or_admin" ON storage.objects;
CREATE POLICY "rider_documents_select_own_or_admin"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'rider-documents'
        AND (
            (storage.foldername(name))[1] = (SELECT auth.uid())::text
            OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
            OR public.can_read_rider_photo(name)
        )
    );
