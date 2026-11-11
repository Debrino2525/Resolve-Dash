-- ============================================================================
-- Migration: Customers, delivery orders, rider dispatch offers, rider presence
--
-- First customer release (cash on delivery):
--   customer requests a delivery -> server prices it -> dispatch offers it to the
--   nearest available online rider -> rider accepts -> picks up -> delivers by
--   entering the customer's 4-digit PIN -> customer rates the delivery.
-- All writes go through the backend (ghana_delivery_app role); clients never
-- touch these tables directly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Customers (1:1 with auth.users), SMS-verified phone
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
    full_name VARCHAR(100) NOT NULL CHECK (length(trim(full_name)) >= 2),
    phone_number VARCHAR(20) NOT NULL UNIQUE CHECK (phone_number ~ '^\+[1-9]\d{1,14}$'),
    email VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ----------------------------------------------------------------------------
-- 2. Rider presence (latest position while on duty; overwritten, not a history)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_presence (
    rider_id UUID PRIMARY KEY REFERENCES riders(id) ON DELETE RESTRICT,
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    latitude DOUBLE PRECISION NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NULL CHECK (longitude BETWEEN -180 AND 180),
    heading DOUBLE PRECISION NULL,
    accuracy_m DOUBLE PRECISION NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_presence_online
    ON rider_presence (updated_at) WHERE is_online;


-- ----------------------------------------------------------------------------
-- 3. Delivery orders
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(12) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    rider_id UUID NULL REFERENCES riders(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'SEARCHING'
        CHECK (status IN ('SEARCHING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED', 'NO_RIDER')),

    pickup_lat DOUBLE PRECISION NOT NULL CHECK (pickup_lat BETWEEN -90 AND 90),
    pickup_lng DOUBLE PRECISION NOT NULL CHECK (pickup_lng BETWEEN -180 AND 180),
    pickup_address VARCHAR(255) NOT NULL,
    pickup_landmark VARCHAR(255) NULL,
    pickup_gps_code VARCHAR(20) NULL,
    pickup_contact_name VARCHAR(100) NOT NULL,
    pickup_contact_phone VARCHAR(20) NOT NULL,

    dropoff_lat DOUBLE PRECISION NOT NULL CHECK (dropoff_lat BETWEEN -90 AND 90),
    dropoff_lng DOUBLE PRECISION NOT NULL CHECK (dropoff_lng BETWEEN -180 AND 180),
    dropoff_address VARCHAR(255) NOT NULL,
    dropoff_landmark VARCHAR(255) NULL,
    dropoff_gps_code VARCHAR(20) NULL,
    receiver_name VARCHAR(100) NOT NULL,
    receiver_phone VARCHAR(20) NOT NULL,

    package_type VARCHAR(20) NOT NULL
        CHECK (package_type IN ('DOCUMENT', 'SMALL_PARCEL', 'FOOD', 'LARGE_ITEM')),
    fragile BOOLEAN NOT NULL DEFAULT FALSE,
    notes VARCHAR(500) NULL,

    distance_m INTEGER NOT NULL CHECK (distance_m >= 0),
    duration_s INTEGER NOT NULL CHECK (duration_s >= 0),
    base_fare_pesewas INTEGER NOT NULL CHECK (base_fare_pesewas >= 0),
    distance_fare_pesewas INTEGER NOT NULL CHECK (distance_fare_pesewas >= 0),
    fare_pesewas INTEGER NOT NULL CHECK (fare_pesewas > 0),
    payment_method VARCHAR(20) NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH')),

    -- Handover PIN the customer gives the receiver; the rider enters it to complete.
    delivery_pin CHAR(4) NOT NULL CHECK (delivery_pin ~ '^\d{4}$'),
    pin_attempts SMALLINT NOT NULL DEFAULT 0,

    rating SMALLINT NULL CHECK (rating BETWEEN 1 AND 5),
    rating_tags TEXT[] NULL,
    rating_comment VARCHAR(500) NULL,
    rated_at TIMESTAMPTZ NULL,

    cancel_reason VARCHAR(255) NULL,
    cancelled_by VARCHAR(20) NULL CHECK (cancelled_by IN ('CUSTOMER', 'RIDER', 'ADMIN', 'SYSTEM')),

    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_at TIMESTAMPTZ NULL,
    picked_up_at TIMESTAMPTZ NULL,
    delivered_at TIMESTAMPTZ NULL,
    cancelled_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_fare_adds_up CHECK (fare_pesewas = base_fare_pesewas + distance_fare_pesewas),
    CONSTRAINT chk_rider_when_assigned CHECK (
        status IN ('SEARCHING', 'NO_RIDER') OR rider_id IS NOT NULL OR status = 'CANCELLED'
    ),
    CONSTRAINT chk_rated_only_delivered CHECK (rating IS NULL OR status = 'DELIVERED')
);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_customer ON delivery_orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON delivery_orders (status, requested_at);
-- A rider can only be on one active job at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_job_per_rider
    ON delivery_orders (rider_id) WHERE status IN ('ASSIGNED', 'PICKED_UP');

CREATE TRIGGER trg_delivery_orders_updated_at
BEFORE UPDATE ON delivery_orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ----------------------------------------------------------------------------
-- 4. Dispatch offers (one order offered to one rider at a time, short expiry)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE RESTRICT,
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'OFFERED'
        CHECK (status IN ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN')),
    distance_to_pickup_m INTEGER NOT NULL CHECK (distance_to_pickup_m >= 0),
    offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_order_offers_order ON order_offers (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_offer_per_order
    ON order_offers (order_id) WHERE status = 'OFFERED';
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_offer_per_rider
    ON order_offers (rider_id) WHERE status = 'OFFERED';


-- ----------------------------------------------------------------------------
-- 5. Access: backend role only
-- ----------------------------------------------------------------------------
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_offers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON customers, rider_presence, delivery_orders, order_offers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE customers, rider_presence, delivery_orders, order_offers
    TO ghana_delivery_app;

CREATE POLICY "app_customers_all" ON customers FOR ALL TO ghana_delivery_app USING (true) WITH CHECK (true);
CREATE POLICY "app_rider_presence_all" ON rider_presence FOR ALL TO ghana_delivery_app USING (true) WITH CHECK (true);
CREATE POLICY "app_delivery_orders_all" ON delivery_orders FOR ALL TO ghana_delivery_app USING (true) WITH CHECK (true);
CREATE POLICY "app_order_offers_all" ON order_offers FOR ALL TO ghana_delivery_app USING (true) WITH CHECK (true);
