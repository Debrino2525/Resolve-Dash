-- Support can close a stuck delivery (rider locked out by wrong PINs, rider vanished after
-- pickup...), and a job a rider hands back gets a fresh search window.
--
-- admin_closed_by / admin_close_note: which admin marked the delivery delivered or cancelled it,
-- and why. Shown in the admin portal; never sent to the apps.
-- search_started_at: when the current search began. NULL means "since requested_at" (the order
-- was never handed back). Set when a rider releases a job, so the 10-minute search limit counts
-- from then, not from when the customer booked.

ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS admin_closed_by UUID NULL;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS admin_close_note VARCHAR(500) NULL;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS search_started_at TIMESTAMPTZ NULL;
