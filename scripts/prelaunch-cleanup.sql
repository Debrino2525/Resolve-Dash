-- GhanaDash pre-launch cleanup (run ONCE, just before going live).
--
-- We test on the same Supabase project that production uses, so test deliveries, test riders'
-- presence and practice data must be removed before real customers arrive.
--
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. It ends in ROLLBACK, so the first run only
-- SHOWS what would be deleted. When the numbers look right, change the last line to COMMIT and
-- run again. Rider accounts, documents and subscriptions are kept unless you list test accounts
-- in step 3.

BEGIN;

-- 1. What is there now
SELECT 'delivery_orders' AS table_name, COUNT(*) FROM delivery_orders
UNION ALL SELECT 'order_offers', COUNT(*) FROM order_offers
UNION ALL SELECT 'rider_presence', COUNT(*) FROM rider_presence
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'riders', COUNT(*) FROM riders;

-- 2. Every delivery before launch is a test delivery: remove them all.
DELETE FROM order_offers;
DELETE FROM delivery_orders;
DELETE FROM rider_presence;

-- 3. Optional: remove specific TEST accounts (their auth users are removed in
--    Supabase → Authentication → Users). Put the test emails in the list.
--
-- WITH test_users AS (
--   SELECT id FROM auth.users WHERE email IN ('test1@example.com', 'test2@example.com')
-- )
-- DELETE FROM customers WHERE id IN (SELECT id FROM test_users);

-- 4. After: should be zero
SELECT 'delivery_orders' AS table_name, COUNT(*) FROM delivery_orders
UNION ALL SELECT 'order_offers', COUNT(*) FROM order_offers;

ROLLBACK; -- change to COMMIT when you are sure
