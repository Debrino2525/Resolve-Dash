/**
 * Start-up check for production. A misconfigured server must refuse to start with a clear list
 * of what is wrong, rather than boot and fail on a customer's first order (or, worse, run with
 * dev fallbacks such as per-process signing secrets or HTTP callback URLs).
 *
 * Only enforced when NODE_ENV=production. Returns problems; the caller decides to exit.
 */

type Env = Record<string, string | undefined>;

interface Rule {
  name: string;
  /** Returns an error message, or null when the value is acceptable. */
  check: (value: string | undefined, env: Env) => string | null;
}

const present = (v: string | undefined): v is string =>
  typeof v === 'string' && v.trim().length > 0;

type Check = Rule['check'];

const required =
  (hint: string): Check =>
  (v) =>
    present(v) ? null : `is required (${hint})`;

const secret =
  (min: number): Check =>
  (v) =>
    !present(v)
      ? `is required (random string, at least ${min} characters)`
      : v.trim().length < min
        ? `must be at least ${min} characters`
        : null;

const https: Check = (v) =>
  !present(v) ? 'is required' : /^https:\/\//i.test(v.trim()) ? null : 'must be an https:// URL';

const RULES: Rule[] = [
  { name: 'DATABASE_URL', check: required('Supabase Postgres connection string for the app role') },
  { name: 'SUPABASE_URL', check: https },
  { name: 'SUPABASE_ANON_KEY', check: required('Supabase publishable/anon key') },
  { name: 'PHONE_VERIFICATION_SECRET', check: secret(32) },
  { name: 'ORDER_QUOTE_SECRET', check: secret(32) },
  { name: 'MNOTIFY_API_KEY', check: required('mNotify BMS API key') },
  { name: 'MNOTIFY_SENDER_ID', check: required('approved mNotify sender ID, e.g. GhanaDash') },
  { name: 'MAPBOX_ACCESS_TOKEN', check: required('Mapbox token for road-distance pricing') },
  { name: 'PAYSTACK_SECRET_KEY', check: required('Paystack secret key') },
  { name: 'PAYSTACK_CALLBACK_URL', check: https },
  {
    name: 'TRUST_PROXY',
    check: (v) =>
      present(v)
        ? null
        : 'is required behind a host/proxy (usually "1") so rate limits see real client IPs',
  },
  {
    name: 'DISPATCH_DISABLED',
    check: (v) =>
      v?.trim() === 'true'
        ? 'must not be "true" in production: no orders would reach riders'
        : null,
  },
  {
    name: 'REQUIRE_VERIFIED_PHONE',
    check: (v) => (v?.trim() === 'false' ? 'must not be "false" in production' : null),
  },
];

export function productionEnvProblems(env: Env = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  for (const rule of RULES) {
    const msg = rule.check(env[rule.name], env);
    if (msg) problems.push(`${rule.name} ${msg}`);
  }
  if (
    present(env.PAYSTACK_SECRET_KEY) &&
    env.PAYSTACK_SECRET_KEY.startsWith('sk_test_') &&
    env.ALLOW_PAYSTACK_TEST_KEY !== 'true'
  ) {
    problems.push(
      'PAYSTACK_SECRET_KEY is a test key (sk_test_…). Use the live key, or set ALLOW_PAYSTACK_TEST_KEY=true for a staging server.',
    );
  }
  return problems;
}
