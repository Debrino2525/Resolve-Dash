-- ============================================================================
-- Migration: Create Core Rider and Subscription Schema (Round 5 Revised)
-- Forward-only migration managed via Supabase CLI
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Required Extensions
-- btree_gist is placed in the extensions schema per Supabase convention.
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;


-- ----------------------------------------------------------------------------
-- 1. Helper Functions & Triggers
-- SET search_path = '' protects against search-path hijacking attacks.
-- EXECUTE privilege is revoked from PUBLIC, anon, and authenticated.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_subscription_events_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'This table is strictly append-only: UPDATE, DELETE, and TRUNCATE operations are prohibited';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_successful_payment_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.status = 'SUCCESS' THEN
        -- Only permitted status transition from SUCCESS is FLAGGED_FOR_REVIEW
        IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'FLAGGED_FOR_REVIEW' THEN
            RAISE EXCEPTION 'SUCCESS payment status can only transition to FLAGGED_FOR_REVIEW, not to %', NEW.status;
        END IF;

        -- Core financial, identity, and period fields are permanently immutable
        IF (NEW.amount_pesewas        IS DISTINCT FROM OLD.amount_pesewas)        OR
           (NEW.reference             IS DISTINCT FROM OLD.reference)             OR
           (NEW.rider_id              IS DISTINCT FROM OLD.rider_id)              OR
           (NEW.period_start          IS DISTINCT FROM OLD.period_start)          OR
           (NEW.period_end            IS DISTINCT FROM OLD.period_end)            OR
           (NEW.paystack_transaction_id IS DISTINCT FROM OLD.paystack_transaction_id) OR
           (NEW.verified_at           IS DISTINCT FROM OLD.verified_at)           OR
           (NEW.paid_at               IS DISTINCT FROM OLD.paid_at)               OR
           (NEW.channel               IS DISTINCT FROM OLD.channel)
        THEN
            RAISE EXCEPTION 'Core attributes of a SUCCESS payment row are immutable (amount, reference, rider_id, period, paystack_transaction_id, verified_at, paid_at, channel)';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION prevent_subscription_events_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION prevent_successful_payment_mutation() FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. Dedicated Application Role (ghana_delivery_app)
-- Created NOLOGIN with no password; set manually by admin in SQL Editor.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ghana_delivery_app') THEN
        CREATE ROLE ghana_delivery_app NOLOGIN;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO ghana_delivery_app;


-- ----------------------------------------------------------------------------
-- 3. Table: riders
-- Profile record linked 1:1 with Supabase Auth (auth.users).
-- Profile modification (names, phone, status) is strictly BACKEND-ONLY.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS riders (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
    phone_number VARCHAR(20) NOT NULL UNIQUE CHECK (phone_number ~ '^\+[1-9]\d{1,14}$'),
    email VARCHAR(255) NULL,
    full_name VARCHAR(100) NOT NULL,
    onboarding_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_VERIFICATION'
        CHECK (onboarding_status IN ('PENDING_VERIFICATION', 'ACTIVE', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_riders_updated_at
BEFORE UPDATE ON riders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE ON TABLE riders TO ghana_delivery_app;


-- ----------------------------------------------------------------------------
-- 4. Table: rider_approval_events
-- Append-only audit trail recording admin approval/rejection decisions.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_approval_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
    action VARCHAR(20) NOT NULL CHECK (action IN ('APPROVED', 'REJECTED')),
    admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_approval_events_rider_id 
    ON rider_approval_events (rider_id, created_at);

CREATE TRIGGER trg_rider_approval_events_immutable
BEFORE UPDATE OR DELETE ON rider_approval_events
FOR EACH ROW EXECUTE FUNCTION prevent_subscription_events_mutation();

CREATE TRIGGER trg_rider_approval_events_no_truncate
BEFORE TRUNCATE ON rider_approval_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_subscription_events_mutation();

GRANT SELECT, INSERT ON TABLE rider_approval_events TO ghana_delivery_app;


-- ----------------------------------------------------------------------------
-- 5. Table: trips
-- Minimal trip record for dispatch gating and active-trip derivation.
-- rider_id is NULLABLE (trips start in 'REQUESTED' state before dispatch assignment).
-- Trips are NEVER deleted; terminal state is CANCELLED.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NULL REFERENCES riders(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL CHECK (
        status IN ('REQUESTED', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_rider_status ON trips (rider_id, status);

CREATE TRIGGER trg_trips_updated_at
BEFORE UPDATE ON trips
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE ON TABLE trips TO ghana_delivery_app;


-- ----------------------------------------------------------------------------
-- 6. Table: subscriptions
-- Stores the rider subscription lifecycle state.
--
-- DISPATCH ELIGIBILITY & PERIOD DEFINITION:
-- A rider is dispatch-eligible if and only if:
--   now() < max(trial_ends_at, paid_until)
--   OR (status = 'GRACE_PERIOD' AND now() < grace_ends_at)
--
-- STORED STATUS CONSISTENCY:
-- - 'TRIAL': now() < trial_ends_at (promotional trial; started at admin approval).
-- - 'ACTIVE': now() < paid_until (prepaid weekly subscription).
-- - 'GRACE_PERIOD': now() >= paid_until AND now() < grace_ends_at (24h renewal grace).
-- - 'SUSPENDED': now() >= max(trial_ends_at, paid_until, grace_ends_at).
--
-- PERIOD-START COMPUTATION:
-- When a payment succeeds, the credit transaction acquires a row lock:
--   SELECT * FROM subscriptions WHERE rider_id = :id FOR UPDATE;
--   period_start = max(NOW(), COALESCE(paid_until, NOW()));
--   period_end = period_start + INTERVAL '7 days';
--   UPDATE subscriptions SET paid_until = period_end, status = 'ACTIVE', grace_ends_at = NULL;
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL UNIQUE REFERENCES riders(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL CHECK (
        status IN ('TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'SUSPENDED')
    ),
    trial_ends_at TIMESTAMPTZ NULL,
    paid_until TIMESTAMPTZ NULL,
    grace_ends_at TIMESTAMPTZ NULL,
    trial_used BOOLEAN NOT NULL DEFAULT FALSE,
    reminders_sent JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_subscription_status_dates CHECK (
        (status = 'TRIAL'        AND trial_ends_at IS NOT NULL) OR
        (status = 'ACTIVE'       AND paid_until IS NOT NULL)    OR
        (status = 'GRACE_PERIOD' AND grace_ends_at IS NOT NULL) OR
        (status = 'SUSPENDED')
    ),
    CONSTRAINT chk_grace_after_paid_until CHECK (
        paid_until IS NULL OR grace_ends_at IS NULL OR grace_ends_at >= paid_until
    ),
    CONSTRAINT chk_active_clears_grace CHECK (
        status <> 'ACTIVE' OR grace_ends_at IS NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_paid_until ON subscriptions (paid_until);

CREATE TRIGGER trg_subscriptions_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE ON TABLE subscriptions TO ghana_delivery_app;


-- ----------------------------------------------------------------------------
-- 7. Table: subscription_payments
-- Individual checkout attempts and verified payments.
-- period_start and period_end are computed inside the locked credit transaction.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
    reference VARCHAR(100) NOT NULL UNIQUE,
    paystack_access_code VARCHAR(100) NULL,
    checkout_expires_at TIMESTAMPTZ NOT NULL,
    period_start TIMESTAMPTZ NULL,
    period_end TIMESTAMPTZ NULL,
    amount_pesewas INTEGER NOT NULL CHECK (amount_pesewas > 0),
    currency VARCHAR(3) NOT NULL CHECK (currency = 'GHS'),
    status VARCHAR(30) NOT NULL CHECK (
        status IN ('PENDING', 'SUCCESS', 'FAILED', 'FLAGGED_FOR_REVIEW')
    ),
    paystack_transaction_id VARCHAR(100) NULL,
    channel VARCHAR(50) NULL,
    verified_at TIMESTAMPTZ NULL,
    paid_at TIMESTAMPTZ NULL,
    failure_reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_successful_payment_fields CHECK (
        status <> 'SUCCESS' OR (
            verified_at             IS NOT NULL AND
            paid_at                 IS NOT NULL AND
            paystack_transaction_id IS NOT NULL AND
            period_start            IS NOT NULL AND
            period_end              IS NOT NULL AND
            period_end > period_start
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_payment_per_rider 
    ON subscription_payments (rider_id) 
    WHERE status = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_paystack_transaction_id 
    ON subscription_payments (paystack_transaction_id) 
    WHERE paystack_transaction_id IS NOT NULL;

-- Exclusion constraint: no two SUCCESS rows for the same rider may overlap
ALTER TABLE subscription_payments
ADD CONSTRAINT no_overlapping_successful_periods
EXCLUDE USING gist (
    rider_id WITH =,
    tstzrange(period_start, period_end, '[)') WITH &&
)
WHERE (status = 'SUCCESS');

CREATE INDEX IF NOT EXISTS idx_subscription_payments_rider_status ON subscription_payments (rider_id, status);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_stale_pending ON subscription_payments (checkout_expires_at) 
    WHERE status = 'PENDING';

CREATE TRIGGER trg_subscription_payments_updated_at
BEFORE UPDATE ON subscription_payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_subscription_payments_protect_success
BEFORE UPDATE ON subscription_payments
FOR EACH ROW EXECUTE FUNCTION prevent_successful_payment_mutation();

GRANT SELECT, INSERT, UPDATE ON TABLE subscription_payments TO ghana_delivery_app;


-- ----------------------------------------------------------------------------
-- 8. Table: webhook_events
-- Deduplication ledger for incoming webhook events.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dedupe_key TEXT NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT ON TABLE webhook_events TO ghana_delivery_app;


-- ----------------------------------------------------------------------------
-- 9. Table: subscription_events
-- Strictly append-only audit trail.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
    event_type VARCHAR(50) NOT NULL,
    from_status VARCHAR(30) NULL,
    to_status VARCHAR(30) NOT NULL,
    reason TEXT NOT NULL,
    actor_id VARCHAR(100) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_sub_id ON subscription_events (subscription_id, created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_events_rider_id ON subscription_events (rider_id, created_at);

CREATE TRIGGER trg_subscription_events_immutable
BEFORE UPDATE OR DELETE ON subscription_events
FOR EACH ROW EXECUTE FUNCTION prevent_subscription_events_mutation();

CREATE TRIGGER trg_subscription_events_no_truncate
BEFORE TRUNCATE ON subscription_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_subscription_events_mutation();

GRANT SELECT, INSERT ON TABLE subscription_events TO ghana_delivery_app;


-- ----------------------------------------------------------------------------
-- 10. Row Level Security (RLS) & Role Policies
-- ----------------------------------------------------------------------------

ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_approval_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- 10A. riders policies (SELECT only for authenticated rider; all writes backend-only)
REVOKE ALL ON riders FROM anon, authenticated;
GRANT SELECT ON riders TO authenticated;

CREATE POLICY "riders_select_own"
    ON riders FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = id);

CREATE POLICY "app_riders_all"
    ON riders FOR ALL
    TO ghana_delivery_app
    USING (true)
    WITH CHECK (true);

-- 10B. rider_approval_events (no client access; app role only)
REVOKE ALL ON rider_approval_events FROM anon, authenticated;

CREATE POLICY "app_rider_approval_events_all"
    ON rider_approval_events FOR ALL
    TO ghana_delivery_app
    USING (true)
    WITH CHECK (true);

-- 10C. trips policies (SELECT only for assigned rider; writes via backend state machine)
REVOKE ALL ON trips FROM anon, authenticated;
GRANT SELECT ON trips TO authenticated;

CREATE POLICY "trips_select_own"
    ON trips FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = rider_id);

CREATE POLICY "app_trips_all"
    ON trips FOR ALL
    TO ghana_delivery_app
    USING (true)
    WITH CHECK (true);

-- 10D. Billing & System tables (subscriptions, payments, webhook events, audit trail)
-- Completely revoked from anon and authenticated client roles.
REVOKE ALL ON subscriptions FROM anon, authenticated;
REVOKE ALL ON subscription_payments FROM anon, authenticated;
REVOKE ALL ON webhook_events FROM anon, authenticated;
REVOKE ALL ON subscription_events FROM anon, authenticated;

CREATE POLICY "app_subscriptions_all"
    ON subscriptions FOR ALL
    TO ghana_delivery_app
    USING (true)
    WITH CHECK (true);

CREATE POLICY "app_subscription_payments_all"
    ON subscription_payments FOR ALL
    TO ghana_delivery_app
    USING (true)
    WITH CHECK (true);

CREATE POLICY "app_webhook_events_all"
    ON webhook_events FOR ALL
    TO ghana_delivery_app
    USING (true)
    WITH CHECK (true);

CREATE POLICY "app_subscription_events_all"
    ON subscription_events FOR ALL
    TO ghana_delivery_app
    USING (true)
    WITH CHECK (true);
