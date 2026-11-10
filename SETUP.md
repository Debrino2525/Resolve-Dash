# SETUP.md — Ghana Delivery Backend & Platform

GhanaDash serves the whole of Ghana. Cities are delivery locations, not separate products.

## 1. First-Time Supabase Project Setup

### A. Run migrations

```bash
supabase link --project-ref tllhlkpeepkopzxvxhvc
supabase db push
```

You will be prompted for the database password. This is the only time you should type it.

---

## 2. Setting the `ghana_delivery_app` Login Password

The migration creates the role with `NOLOGIN` and no password so that no credential ever appears in a committed file or in chat.

You must set the password yourself in the **Supabase Dashboard SQL Editor** (Dashboard → SQL Editor → New query):

```sql
-- Step 1: Enable LOGIN and set a strong random password.
-- Generate a password with: openssl rand -base64 32
-- Store it in your password manager — not in .env.example, not in chat.
ALTER ROLE ghana_delivery_app LOGIN PASSWORD 'REPLACE_WITH_YOUR_STRONG_RANDOM_PASSWORD';
```

> [!CAUTION]
> Never paste the actual password into chat, into any committed file, or into application logs.
> The `DATABASE_URL` in your server `.env` file should use this role and password.

### Connection String Configuration (Supavisor Pooler)
To retrieve your exact connection string:
1. Open your Supabase Dashboard: **Project Settings → Database → Connection string**.
2. Select **Transaction Pooler** (port `6543`) or **Session Pooler** (port `5432`).
3. Replace the username with your custom role: `ghana_delivery_app.<project_ref>` (e.g., `ghana_delivery_app.tllhlkpeepkopzxvxhvc`).
4. Replace the password placeholder with your chosen password.

Your server `.env` (gitignored) should contain:
```
DATABASE_URL=postgresql://ghana_delivery_app.<project_ref>:<YOUR_PASSWORD>@<POOLER_HOST_FROM_DASHBOARD>:6543/postgres
```

### Verified TLS to the database
The backend checks the database server's certificate so nobody on the network path can impersonate it.
1. Supabase Dashboard → **Project Settings → Database → SSL Configuration → Download certificate**.
2. Save it on the server (e.g. `certs/supabase-ca.crt`, which is gitignored) and set `DATABASE_SSL_CA=./certs/supabase-ca.crt`. On hosts without a filesystem, put the PEM text in the env var; `\n` escapes are accepted.
3. With `NODE_ENV=production` the server **refuses to start** without `DATABASE_SSL_CA`. To knowingly run unverified, set `DATABASE_SSL_REJECT_UNAUTHORIZED=false` (logged as a warning). In development a missing CA only logs a warning.

### Rate limiting
Every route is limited per client IP (`THROTTLE_LIMIT`, default 120 per `THROTTLE_TTL_MS` = 60s). Admin login is limited to `AUTH_THROTTLE_LIMIT` (default 5) attempts per minute, and Paystack webhooks are exempt. **Behind a reverse proxy or load balancer, set `TRUST_PROXY=1`**. Without it every request appears to come from the proxy, and all users share one budget.

---

## 3. Running the SQL Security & Constraint Tests

The SQL tests verify RLS isolation, privilege boundaries, append-only triggers, and GiST exclusion constraints.

> [!IMPORTANT]
> The test suite MUST be run using your **`postgres` / admin connection** (or pasted directly into the Supabase Dashboard SQL Editor), **NOT as `ghana_delivery_app`**.
> The test harness creates mock `auth.users` fixtures and calls `SET LOCAL ROLE anon/authenticated` to rigorously probe security boundaries.

```bash
# Using psql as postgres admin:
psql "postgresql://postgres:<ADMIN_PASSWORD>@<DB_HOST>:5432/postgres" -f test/db-security-and-constraints.sql
```

The script wraps all assertions in a transaction that always ends with `ROLLBACK;` — zero test rows persist.

---

## 4. Test Database Configuration (Integration Tests)

Because the schema strictly depends on Supabase native internal schemas (`auth.users`, `auth.uid()`, and the `anon`/`authenticated` roles), local standalone vanilla PostgreSQL is insufficient without the complete Supabase auth mock.

* **Requirement**: The test database MUST be a **second, dedicated Supabase project** (or a local Supabase CLI container instance via `supabase start`).
* **Isolation Rule**: NEVER point `TEST_DATABASE_URL` at the development or production project.
* In `.env`:
```
TEST_DATABASE_URL=postgresql://postgres:<PASSWORD>@<TEST_PROJECT_DB_HOST>:5432/postgres
```

---

## 5. Rider Onboarding & Admin Approval Flow

```
+-----------------------------------------------------------------------------------------+
|                               RIDER ONBOARDING & APPROVAL                               |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|  1. Rider Phone OTP (Supabase Client SDK)                                              |
|     └── Rider authenticates via SMS OTP.                                                |
|                                                                                         |
|  2. POST /riders/onboard (Authenticated Rider)                                          |
|     ├── Verifies caller JWT via Supabase JWKS (asymmetric RS256/ES256, no shared secret)|
|     └── Inserts riders profile with onboarding_status = 'PENDING_VERIFICATION'.         |
|         (Trial does NOT start here; profile is read-only to client).                   |
|                                                                                         |
|  3. Admin Approval Module (Server-Side Admin Endpoint)                                  |
|     ├── STEP 3A (Database Transaction First):                                           |
|     │   ├── UPDATE riders SET onboarding_status = 'ACTIVE';                             |
|     │   ├── INSERT INTO subscriptions (status = 'TRIAL', trial_ends_at = NOW()+14d);    |
|     │   ├── INSERT INTO rider_approval_events (action = 'APPROVED', admin_id);          |
|     │   └── INSERT INTO subscription_events (event_type = 'TRIAL_STARTED');             |
|     │   └── COMMIT;                                                                     |
|     │                                                                                   |
|     └── STEP 3B (Supabase Admin API Call):                                              |
|         └── auth.admin.updateUserById(id, { app_metadata: { role: 'rider' } })          |
|             using SUPABASE_SERVICE_ROLE_KEY.                                            |
|                                                                                         |
|  4. Idempotent Reconciliation Job:                                                      |
|     └── Hourly background worker finds riders where onboarding_status = 'ACTIVE'       |
|         but app_metadata.role is missing; retries the admin API call safely.            |
|                                                                                         |
|  5. Client Session Refresh:                                                             |
|     └── Rider client calls supabase.auth.refreshSession() to pick up role in JWT.       |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

### Admin Account Security & Role Isolation
* **Creation**: Admin accounts are never registered via public signup. They are provisioned directly in the Supabase Dashboard by the organization owner.
* **Role check (implemented)**: Every `/admin/api/*` data endpoint is protected by `AdminGuard` (`src/auth/admin.guard.ts`). It verifies the Supabase JWT and requires `app_metadata.role === 'admin'`. No token → 401, non-admin → 403. `user_metadata` is ignored because users can edit it themselves.
* **MFA (not yet implemented)**: The guard does not check the `aal` claim yet. Requiring `aal === 'aal2'` is planned once the admin page supports a TOTP step.

### Approval, eligibility, and audit
* **Dispatch eligibility** (`GET /subscriptions/me` → `canAcceptOrders`) requires both an admin-approved rider (`onboarding_status = 'ACTIVE'`) **and** subscription coverage. Rejected or pending riders get `ineligibleReason: 'RIDER_NOT_APPROVED'` even if they hold paid or granted access. The app shows rejected riders a blocked screen.
* **Subscription status is computed from timestamps when read** (`src/subscriptions/subscription-state.ts`): ACTIVE while `paid_until` is in the future, then TRIAL while `trial_ends_at` is, then `GRACE_PERIOD` for `GRACE_PERIOD_HOURS` after a *paid* week ends (an expired trial gets no grace), then SUSPENDED. Nothing updates the stored `status` column as time passes, so the API and admin roster never use it directly.
* **Audit**: approve and reject write `rider_approval_events` with the acting admin's user id. Trial starts and "+7 days free" grants write `subscription_events` with `actor_id = 'admin:<user id>'`.
* **Phone numbers are not OTP-verified** (sign-in is email + password). Confirm the number with the rider before approving. A number already used by another account is rejected with 409.

### Provisioning an admin account
1. Create the user in Supabase Dashboard → Authentication → Users → **Add user** (email + password, auto-confirm).
2. Grant the role in the SQL Editor (as `postgres`):
   ```sql
   UPDATE auth.users
   SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   WHERE email = '<admin email>';
   ```
3. Set `SUPABASE_ANON_KEY` (and `SUPABASE_URL`) in the backend `.env`. The admin page signs in through `POST /admin/api/login`, which calls Supabase on the server, so the page can stay same-origin under Helmet's CSP.
4. Open `https://<backend host>/admin` and sign in. The session token is kept in `sessionStorage` and dropped when the tab closes or the token expires (about 1 hour).
* **Service-Role Key Isolation**: The `SUPABASE_SERVICE_ROLE_KEY` is restricted strictly to the internal Admin Approval module for `app_metadata` synchronization. Everyday rider, consumer, and billing endpoints use the limited `ghana_delivery_app` database role and public JWKS verification.

---

## 6. Rider Mobile App (Expo & EAS Build)

The rider client lives in `rider-app/` and is linked to EAS Project ID `d050d3ed-baaf-49d0-b629-14c7bc7fac95` with deep link scheme `ghanadash-rider://`.

### A. Install mobile dependencies
```bash
cd rider-app
npm install
```

### B. Configure local environment
Create `rider-app/.env` based on `rider-app/.env.example`:
```ini
EXPO_PUBLIC_SUPABASE_URL=https://tllhlkpeepkopzxvxhvc.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key_here
```

### C. Build a standalone Android APK for riders (Preview Profile)
```bash
cd rider-app
eas build --profile preview --platform android
```
EAS outputs a direct `.apk` download link for installation on dispatch motorbikes.
