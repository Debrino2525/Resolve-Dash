-- ============================================================================
-- Migration: package photo on orders + customer/rider chat with photos
--
-- * delivery_orders.package_photo_path: optional photo of the item, added at booking.
-- * order_messages: chat between the order's customer and its assigned rider.
-- * Private `order-photos` bucket: each user uploads into their own folder
--   (<auth uid>/...). Reading is allowed only to people on that order (customer,
--   assigned rider, or a rider currently being offered it), and to admins.
-- Apps never touch these tables directly; the backend role does (RLS as before).
-- ============================================================================

-- 1. Package photo on the order ------------------------------------------------
ALTER TABLE delivery_orders
    ADD COLUMN IF NOT EXISTS package_photo_path TEXT
        CHECK (package_photo_path IS NULL OR length(package_photo_path) <= 300);

-- 2. Chat messages --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES delivery_orders (id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL,
    sender_role VARCHAR(10) NOT NULL CHECK (sender_role IN ('CUSTOMER', 'RIDER')),
    body        TEXT CHECK (body IS NULL OR length(body) BETWEEN 1 AND 1000),
    photo_path  TEXT CHECK (photo_path IS NULL OR length(photo_path) <= 300),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT order_messages_has_content CHECK (body IS NOT NULL OR photo_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_order_messages_order_time
    ON order_messages (order_id, created_at);

ALTER TABLE order_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON order_messages FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE order_messages TO ghana_delivery_app;

DROP POLICY IF EXISTS "app_order_messages_all" ON order_messages;
CREATE POLICY "app_order_messages_all"
    ON order_messages FOR ALL
    TO ghana_delivery_app
    USING (true)
    WITH CHECK (true);

-- 3. Private bucket for package and chat photos (5 MB, images only) ---------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('order-photos', 'order-photos', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4. Who may read an order photo ---------------------------------------------------
-- SECURITY DEFINER so the storage policy can consult order tables that the
-- `authenticated` role cannot read itself. Returns only true/false.
CREATE OR REPLACE FUNCTION public.can_read_order_photo(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.delivery_orders o
        WHERE (
                o.package_photo_path = p_name
                OR EXISTS (SELECT 1 FROM public.order_messages m
                           WHERE m.order_id = o.id AND m.photo_path = p_name)
              )
          AND (
                o.customer_id = (SELECT auth.uid())
                OR o.rider_id = (SELECT auth.uid())
                OR EXISTS (SELECT 1 FROM public.order_offers f
                           WHERE f.order_id = o.id
                             AND f.rider_id = (SELECT auth.uid())
                             AND f.status = 'OFFERED')
              )
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_order_photo(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_order_photo(TEXT) TO authenticated;

-- 5. Storage policies (this bucket only). New object per upload: no UPDATE/DELETE.
DROP POLICY IF EXISTS "order_photos_insert_own" ON storage.objects;
CREATE POLICY "order_photos_insert_own"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'order-photos'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

DROP POLICY IF EXISTS "order_photos_select_participants" ON storage.objects;
CREATE POLICY "order_photos_select_participants"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'order-photos'
        AND (
            (storage.foldername(name))[1] = (SELECT auth.uid())::text
            OR public.can_read_order_photo(name)
            OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
        )
    );
