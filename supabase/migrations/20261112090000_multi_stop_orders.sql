-- ============================================================================
-- Multi-stop deliveries: one rider, one pickup, up to 4 drop-offs.
--
-- The final drop-off stays in the dropoff_* / receiver_* columns (and keeps the
-- order's delivery_pin), so single-drop orders are unchanged. Drop-offs the
-- rider visits before the final one live in extra_stops, in visiting order:
--
--   [{ "lat", "lng", "address", "landmark", "gpsCode", "contactName", "contactPhone",
--      "pin": "1234", "pinAttempts": 0,
--      "status": "PENDING" | "DELIVERED" | "FAILED",
--      "doneAt": ISO timestamp | null, "failReason": text | null }]
--
-- The API reads and updates extra_stops only while holding the order row lock.
-- stops_fare_pesewas is the per-extra-stop charge (FARE_PER_STOP_PESEWAS × stops).
-- ============================================================================

ALTER TABLE delivery_orders
    ADD COLUMN IF NOT EXISTS extra_stops JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS stops_fare_pesewas INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_extra_stops_shape') THEN
        ALTER TABLE delivery_orders
            ADD CONSTRAINT chk_extra_stops_shape CHECK (
                jsonb_typeof(extra_stops) = 'array' AND jsonb_array_length(extra_stops) <= 3
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stops_fare_non_negative') THEN
        ALTER TABLE delivery_orders
            ADD CONSTRAINT chk_stops_fare_non_negative CHECK (stops_fare_pesewas >= 0);
    END IF;
END $$;

-- The total now includes the extra-stop charge (0 for single-drop orders, so old rows still pass).
ALTER TABLE delivery_orders DROP CONSTRAINT IF EXISTS chk_fare_adds_up;
ALTER TABLE delivery_orders
    ADD CONSTRAINT chk_fare_adds_up
    CHECK (fare_pesewas = base_fare_pesewas + distance_fare_pesewas + stops_fare_pesewas);
