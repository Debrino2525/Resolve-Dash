# SETUP.md — Ghana Delivery Backend & Platform

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
* **MFA Enforcement**: All admin endpoints enforce Multi-Factor Authentication. The backend guard inspects the JWT claim `aal` (Authenticator Assurance Level) and rejects requests unless `aal === 'aal2'`.
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
