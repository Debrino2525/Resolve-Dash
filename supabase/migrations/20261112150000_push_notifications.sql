-- Push notifications (Expo push service) and the "you've gone quiet" rider alert.
--
-- push_tokens: one row per device install. user_id is the Supabase auth user id (the same id
-- as customers.id / riders.id); app says which GhanaDash app registered it, so a person who
-- uses both apps gets rider pushes only on the rider app. Only the backend reads or writes it.

-- The backend's role (created by the first migration; some databases were set up without it).
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ghana_delivery_app') THEN
        CREATE ROLE ghana_delivery_app NOLOGIN;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS push_tokens (
    token VARCHAR(255) PRIMARY KEY CHECK (token ~ '^Expo(nent)?PushToken\[.+\]$'),
    user_id UUID NOT NULL,
    app VARCHAR(10) NOT NULL CHECK (app IN ('customer', 'rider')),
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens (user_id, app);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON push_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE push_tokens TO ghana_delivery_app;

DROP POLICY IF EXISTS "app_push_tokens_all" ON push_tokens;
CREATE POLICY "app_push_tokens_all"
    ON push_tokens FOR ALL
    TO ghana_delivery_app
    USING (true)
    WITH CHECK (true);

-- Set when a rider who is online (or on a job) stops sending locations and has been warned;
-- cleared by their next heartbeat, so each silence is warned about once.
ALTER TABLE rider_presence ADD COLUMN IF NOT EXISTS stale_alerted_at TIMESTAMPTZ NULL;
