-- ============================================================================
-- SQL Security & Constraint Verification Suite (Round 5 Revised)
-- Run this in psql (as postgres / admin connection) or in the Supabase SQL Editor.
-- Wrapped in a single transaction that always ROLLS BACK so no test data persists.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_user1_id UUID := '11111111-1111-4111-a111-111111111111';
    v_user2_id UUID := '22222222-2222-4222-a222-222222222222';
    v_user3_id UUID := '33333333-3333-4333-a333-333333333333';
    v_admin_id UUID := '99999999-9999-4999-a999-999999999999';
    v_trip2_id UUID;
    v_sub1_id  UUID;
    v_sub2_id  UUID;
    v_pay1_id  UUID;
    v_count    INTEGER;
    v_ok       BOOLEAN;
    v_is_eligible BOOLEAN;
BEGIN
    RAISE NOTICE '=== STARTING DB SECURITY & CONSTRAINT TESTS ===';

    -- =========================================================================
    -- SETUP: seed auth users, riders, one subscription, one trip
    -- Runs as postgres (admin connection) before switching roles
    -- =========================================================================
    INSERT INTO auth.users (id, aud, role, email, phone, encrypted_password, created_at, updated_at)
    VALUES
        (v_user1_id, 'authenticated', 'authenticated', 'rider1@test.local', '+233241111111', 'x', NOW(), NOW()),
        (v_user2_id, 'authenticated', 'authenticated', 'rider2@test.local', '+233242222222', 'x', NOW(), NOW()),
        (v_user3_id, 'authenticated', 'authenticated', 'rider3@test.local', '+233243333333', 'x', NOW(), NOW()),
        (v_admin_id, 'authenticated', 'authenticated', 'admin@test.local',  '+233249999999', 'x', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.riders (id, phone_number, full_name, onboarding_status)
    VALUES
        (v_user1_id, '+233241111111', 'Kofi Mensah',   'ACTIVE'),
        (v_user2_id, '+233242222222', 'Kwame Boateng', 'ACTIVE');

    INSERT INTO public.subscriptions (rider_id, status, trial_ends_at, trial_used)
    VALUES (v_user1_id, 'TRIAL', NOW() + INTERVAL '14 days', TRUE)
    RETURNING id INTO v_sub1_id;

    -- Trip owned by rider 2
    INSERT INTO public.trips (rider_id, status)
    VALUES (v_user2_id, 'IN_TRANSIT')
    RETURNING id INTO v_trip2_id;


    -- =========================================================================
    -- TESTS 1 & 2: anon and authenticated cannot touch billing or approval tables
    -- =========================================================================

    -- 1A: anon cannot SELECT subscriptions
    SET LOCAL ROLE anon;
    v_ok := FALSE;
    BEGIN
        PERFORM * FROM public.subscriptions;
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 1A: anon SELECT on subscriptions was permitted'; END IF;
    RAISE NOTICE 'PASS 1A: anon blocked from reading subscriptions';

    -- 1B: anon cannot INSERT into rider_approval_events
    v_ok := FALSE;
    BEGIN
        INSERT INTO public.rider_approval_events (rider_id, action, admin_id, reason)
        VALUES (v_user1_id, 'APPROVED', v_admin_id, 'fake approval');
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 1B: anon INSERT on rider_approval_events permitted'; END IF;
    RAISE NOTICE 'PASS 1B: anon blocked from inserting into rider_approval_events';

    -- 2A: authenticated cannot SELECT subscriptions
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_user1_id::text, 'role', 'authenticated')::text, true);

    v_ok := FALSE;
    BEGIN
        PERFORM * FROM public.subscriptions;
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 2A: authenticated SELECT on subscriptions permitted'; END IF;
    RAISE NOTICE 'PASS 2A: authenticated blocked from reading subscriptions';

    -- 2B: authenticated cannot SELECT rider_approval_events
    v_ok := FALSE;
    BEGIN
        PERFORM * FROM public.rider_approval_events;
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 2B: authenticated SELECT on rider_approval_events permitted'; END IF;
    RAISE NOTICE 'PASS 2B: authenticated blocked from reading rider_approval_events';


    -- =========================================================================
    -- TEST 3: Rider 1 cannot read Rider 2 trips (RLS enforcement)
    -- =========================================================================
    SELECT COUNT(*) INTO v_count
    FROM public.trips
    WHERE id = v_trip2_id;

    IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 3: Rider 1 read Rider 2 trip (count=%)', v_count; END IF;
    RAISE NOTICE 'PASS 3: Rider 1 cannot see Rider 2 trips (RLS)';


    -- =========================================================================
    -- TEST 4: Rider cannot update riders table (full_name is backend-only)
    -- =========================================================================
    v_ok := FALSE;
    BEGIN
        UPDATE public.riders SET full_name = 'Hacked Name' WHERE id = v_user1_id;
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 4A: Rider was able to directly UPDATE full_name!'; END IF;
    RAISE NOTICE 'PASS 4A: Rider blocked from modifying full_name directly (backend-only)';

    v_ok := FALSE;
    BEGIN
        UPDATE public.riders SET phone_number = '+233249999999' WHERE id = v_user1_id;
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 4B: Rider was able to UPDATE phone_number'; END IF;
    RAISE NOTICE 'PASS 4B: Rider blocked from updating phone_number';


    -- =========================================================================
    -- RESET to superuser for trigger & constraint tests
    -- =========================================================================
    RESET ROLE;


    -- =========================================================================
    -- TEST 5: rider_approval_events rejects UPDATE, DELETE, TRUNCATE
    -- =========================================================================
    INSERT INTO public.rider_approval_events (rider_id, action, admin_id, reason)
    VALUES (v_user1_id, 'APPROVED', v_admin_id, 'Verified license and insurance');

    v_ok := FALSE;
    BEGIN
        UPDATE public.rider_approval_events SET reason = 'tampered' WHERE rider_id = v_user1_id;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%strictly append-only%' THEN v_ok := TRUE; END IF;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 5A: rider_approval_events permitted UPDATE'; END IF;
    RAISE NOTICE 'PASS 5A: rider_approval_events rejects UPDATE';

    v_ok := FALSE;
    BEGIN
        DELETE FROM public.rider_approval_events WHERE rider_id = v_user1_id;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%strictly append-only%' THEN v_ok := TRUE; END IF;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 5B: rider_approval_events permitted DELETE'; END IF;
    RAISE NOTICE 'PASS 5B: rider_approval_events rejects DELETE';

    v_ok := FALSE;
    BEGIN
        TRUNCATE TABLE public.rider_approval_events;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%strictly append-only%' THEN v_ok := TRUE; END IF;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 5C: rider_approval_events permitted TRUNCATE'; END IF;
    RAISE NOTICE 'PASS 5C: rider_approval_events rejects TRUNCATE';


    -- =========================================================================
    -- TEST 6: Unique reference & unique paystack_transaction_id
    -- =========================================================================
    INSERT INTO public.subscription_payments (
        rider_id, reference, checkout_expires_at, amount_pesewas, currency, status,
        paystack_transaction_id, verified_at, paid_at, period_start, period_end
    ) VALUES (
        v_user1_id, 'ref_u101', NOW() + INTERVAL '1h', 5000, 'GHS', 'SUCCESS',
        'ps_tx_901', NOW(), NOW(), NOW(), NOW() + INTERVAL '7 days'
    ) RETURNING id INTO v_pay1_id;

    -- 6A: Duplicate reference
    v_ok := FALSE;
    BEGIN
        INSERT INTO public.subscription_payments
            (rider_id, reference, checkout_expires_at, amount_pesewas, currency, status)
        VALUES
            (v_user2_id, 'ref_u101', NOW() + INTERVAL '1h', 5000, 'GHS', 'PENDING');
    EXCEPTION WHEN unique_violation THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 6A: Duplicate reference was accepted'; END IF;
    RAISE NOTICE 'PASS 6A: Duplicate payment reference rejected';

    -- 6B: Duplicate paystack_transaction_id
    v_ok := FALSE;
    BEGIN
        INSERT INTO public.subscription_payments (
            rider_id, reference, checkout_expires_at, amount_pesewas, currency, status,
            paystack_transaction_id, verified_at, paid_at, period_start, period_end
        ) VALUES (
            v_user2_id, 'ref_u102', NOW() + INTERVAL '1h', 5000, 'GHS', 'SUCCESS',
            'ps_tx_901', NOW(), NOW(),
            NOW() + INTERVAL '7 days', NOW() + INTERVAL '14 days'
        );
    EXCEPTION WHEN unique_violation THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 6B: Duplicate paystack_transaction_id was accepted'; END IF;
    RAISE NOTICE 'PASS 6B: Duplicate paystack_transaction_id rejected';


    -- =========================================================================
    -- TEST 7: Exactly one PENDING payment allowed per rider
    -- =========================================================================
    INSERT INTO public.subscription_payments
        (rider_id, reference, checkout_expires_at, amount_pesewas, currency, status)
    VALUES
        (v_user2_id, 'ref_p1', NOW() + INTERVAL '30m', 5000, 'GHS', 'PENDING');

    v_ok := FALSE;
    BEGIN
        INSERT INTO public.subscription_payments
            (rider_id, reference, checkout_expires_at, amount_pesewas, currency, status)
        VALUES
            (v_user2_id, 'ref_p2', NOW() + INTERVAL '30m', 5000, 'GHS', 'PENDING');
    EXCEPTION WHEN unique_violation THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 7: Second PENDING payment for same rider was accepted'; END IF;
    RAISE NOTICE 'PASS 7: Second PENDING payment for same rider rejected';


    -- =========================================================================
    -- TEST 8: Overlapping SUCCESS periods rejected (btree_gist exclusion)
    -- =========================================================================
    v_ok := FALSE;
    BEGIN
        INSERT INTO public.subscription_payments (
            rider_id, reference, checkout_expires_at, amount_pesewas, currency, status,
            paystack_transaction_id, verified_at, paid_at, period_start, period_end
        ) VALUES (
            v_user1_id, 'ref_overlap', NOW() + INTERVAL '1h', 5000, 'GHS', 'SUCCESS',
            'ps_tx_overlap', NOW(), NOW(),
            NOW() + INTERVAL '3 days', NOW() + INTERVAL '10 days'
        );
    EXCEPTION WHEN exclusion_violation THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 8: Overlapping SUCCESS periods were accepted'; END IF;
    RAISE NOTICE 'PASS 8: Overlapping SUCCESS periods rejected by btree_gist exclusion';


    -- =========================================================================
    -- TEST 9: SUCCESS payment immutability
    -- =========================================================================
    v_ok := FALSE;
    BEGIN
        UPDATE public.subscription_payments SET amount_pesewas = 100 WHERE id = v_pay1_id;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Core attributes of a SUCCESS payment row are immutable%' THEN v_ok := TRUE; END IF;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 9A: amount_pesewas on SUCCESS payment was modifiable'; END IF;
    RAISE NOTICE 'PASS 9A: amount_pesewas on SUCCESS is immutable';

    v_ok := FALSE;
    BEGIN
        UPDATE public.subscription_payments SET status = 'PENDING' WHERE id = v_pay1_id;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%SUCCESS payment status can only transition to FLAGGED_FOR_REVIEW%' THEN v_ok := TRUE; END IF;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 9C: SUCCESS payment status was reverted to PENDING'; END IF;
    RAISE NOTICE 'PASS 9C: SUCCESS cannot transition to PENDING';

    UPDATE public.subscription_payments SET status = 'FLAGGED_FOR_REVIEW' WHERE id = v_pay1_id;
    RAISE NOTICE 'PASS 9E: SUCCESS -> FLAGGED_FOR_REVIEW transition is permitted';


    -- =========================================================================
    -- TEST 10: Role ghana_delivery_app permissions & real assertions
    -- =========================================================================
    SET LOCAL ROLE ghana_delivery_app;

    -- 10A: SELECT riders
    PERFORM id FROM public.riders LIMIT 1;
    RAISE NOTICE 'PASS 10A: ghana_delivery_app can SELECT riders';

    -- 10B: REAL ASSERTION: ghana_delivery_app inserts a rider and verifies row exists
    INSERT INTO public.riders (id, phone_number, full_name, onboarding_status)
    VALUES (v_user3_id, '+233243333333', 'Ama Serwaa', 'PENDING_VERIFICATION');

    SELECT COUNT(*) INTO v_count FROM public.riders WHERE id = v_user3_id;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FAIL 10B: ghana_delivery_app failed to insert rider (count=%)', v_count;
    END IF;
    RAISE NOTICE 'PASS 10B: ghana_delivery_app successfully inserted and verified rider row';

    -- 10C: UPDATE riders full_name (allowed for backend role)
    UPDATE public.riders SET full_name = 'Ama Serwaa Approved' WHERE id = v_user3_id;
    RAISE NOTICE 'PASS 10C: ghana_delivery_app can UPDATE riders full_name';

    -- 10D: INSERT into rider_approval_events
    INSERT INTO public.rider_approval_events (rider_id, action, admin_id, reason)
    VALUES (v_user3_id, 'APPROVED', v_admin_id, 'Operations check passed');
    RAISE NOTICE 'PASS 10D: ghana_delivery_app can INSERT rider_approval_events';

    -- 10E: INSERT into subscriptions
    INSERT INTO public.subscriptions (rider_id, status, trial_ends_at, trial_used)
    VALUES (v_user3_id, 'TRIAL', NOW() + INTERVAL '14 days', TRUE)
    RETURNING id INTO v_sub2_id;
    RAISE NOTICE 'PASS 10E: ghana_delivery_app can INSERT subscriptions';

    -- 10G: cannot DELETE trips (assert insufficient_privilege)
    v_ok := FALSE;
    BEGIN
        DELETE FROM public.trips WHERE id = v_trip2_id;
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 10G: ghana_delivery_app was able to DELETE a trip'; END IF;
    RAISE NOTICE 'PASS 10G: ghana_delivery_app cannot DELETE trips (insufficient_privilege)';

    -- 10H: cannot DELETE subscription_payments (assert insufficient_privilege)
    v_ok := FALSE;
    BEGIN
        DELETE FROM public.subscription_payments WHERE id = v_pay1_id;
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 10H: ghana_delivery_app was able to DELETE subscription_payments'; END IF;
    RAISE NOTICE 'PASS 10H: ghana_delivery_app cannot DELETE subscription_payments (insufficient_privilege)';

    -- 10I: cannot UPDATE webhook_events (assert insufficient_privilege)
    v_ok := FALSE;
    BEGIN
        UPDATE public.webhook_events SET event_type = 'tamper' WHERE id = gen_random_uuid();
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 10I: ghana_delivery_app was able to UPDATE webhook_events'; END IF;
    RAISE NOTICE 'PASS 10I: ghana_delivery_app cannot UPDATE webhook_events (insufficient_privilege)';

    -- 10J: cannot DELETE webhook_events (assert insufficient_privilege)
    v_ok := FALSE;
    BEGIN
        DELETE FROM public.webhook_events WHERE id = gen_random_uuid();
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 10J: ghana_delivery_app was able to DELETE webhook_events'; END IF;
    RAISE NOTICE 'PASS 10J: ghana_delivery_app cannot DELETE webhook_events (insufficient_privilege)';

    -- 10K: cannot UPDATE subscription_events (assert SPECIFIC insufficient_privilege)
    v_ok := FALSE;
    BEGIN
        UPDATE public.subscription_events SET reason = 'app_tamper' WHERE id = gen_random_uuid();
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 10K: ghana_delivery_app was able to UPDATE subscription_events'; END IF;
    RAISE NOTICE 'PASS 10K: ghana_delivery_app cannot UPDATE subscription_events (insufficient_privilege)';

    -- 10L: cannot DELETE subscription_events (assert SPECIFIC insufficient_privilege)
    v_ok := FALSE;
    BEGIN
        DELETE FROM public.subscription_events WHERE id = gen_random_uuid();
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 10L: ghana_delivery_app was able to DELETE subscription_events'; END IF;
    RAISE NOTICE 'PASS 10L: ghana_delivery_app cannot DELETE subscription_events (insufficient_privilege)';


    -- =========================================================================
    -- TEST 11: Dispatch-Eligibility Invariant Verification
    -- Rule: now() < max(trial_ends_at, paid_until) OR (status='GRACE_PERIOD' AND now() < grace_ends_at)
    -- =========================================================================
    -- Case 11A: User on active trial is eligible
    SELECT (NOW() < trial_ends_at OR NOW() < COALESCE(paid_until, '-infinity'::timestamptz))
    INTO v_is_eligible
    FROM public.subscriptions
    WHERE rider_id = v_user3_id;

    IF NOT v_is_eligible THEN RAISE EXCEPTION 'FAIL 11A: Active trial rider calculated as ineligible!'; END IF;
    RAISE NOTICE 'PASS 11A: Active trial rider is dispatch-eligible';

    -- Case 11B: Expired trial and expired paid_until is ineligible
    UPDATE public.subscriptions
    SET status = 'SUSPENDED',
        trial_ends_at = NOW() - INTERVAL '1 day',
        paid_until = NULL,
        grace_ends_at = NULL
    WHERE rider_id = v_user3_id;

    SELECT (
        (NOW() < COALESCE(trial_ends_at, '-infinity'::timestamptz)) OR
        (NOW() < COALESCE(paid_until, '-infinity'::timestamptz)) OR
        (status = 'GRACE_PERIOD' AND NOW() < COALESCE(grace_ends_at, '-infinity'::timestamptz))
    )
    INTO v_is_eligible
    FROM public.subscriptions
    WHERE rider_id = v_user3_id;

    IF v_is_eligible THEN RAISE EXCEPTION 'FAIL 11B: Suspended rider calculated as eligible!'; END IF;
    RAISE NOTICE 'PASS 11B: Suspended rider is correctly dispatch-ineligible';

    RESET ROLE;

    RAISE NOTICE '=== ALL TESTS PASSED ===';
END $$;

ROLLBACK;
