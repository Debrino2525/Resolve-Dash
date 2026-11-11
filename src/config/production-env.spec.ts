import { productionEnvProblems } from './production-env';

const good = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@h/db',
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  PHONE_VERIFICATION_SECRET: 'a'.repeat(32),
  ORDER_QUOTE_SECRET: 'b'.repeat(32),
  MNOTIFY_API_KEY: 'k',
  MNOTIFY_SENDER_ID: 'GhanaDash',
  MAPBOX_ACCESS_TOKEN: 'pk.x',
  PAYSTACK_SECRET_KEY: 'sk_live_x',
  PAYSTACK_CALLBACK_URL: 'https://ghanadash-api.example.com/subscriptions/callback',
  TRUST_PROXY: '1',
};

describe('productionEnvProblems', () => {
  it('does nothing outside production', () => {
    expect(productionEnvProblems({ NODE_ENV: 'development' })).toEqual([]);
  });

  it('accepts a complete production config', () => {
    expect(productionEnvProblems(good)).toEqual([]);
  });

  it('lists every missing or unsafe setting', () => {
    const problems = productionEnvProblems({
      ...good,
      DATABASE_URL: '',
      ORDER_QUOTE_SECRET: 'short',
      PAYSTACK_CALLBACK_URL: 'http://insecure',
      DISPATCH_DISABLED: 'true',
      TRUST_PROXY: undefined,
    });
    expect(problems).toHaveLength(5);
    expect(problems.join('\n')).toMatch(/DATABASE_URL/);
    expect(problems.join('\n')).toMatch(/ORDER_QUOTE_SECRET must be at least 32/);
    expect(problems.join('\n')).toMatch(/PAYSTACK_CALLBACK_URL must be an https/);
    expect(problems.join('\n')).toMatch(/DISPATCH_DISABLED/);
    expect(problems.join('\n')).toMatch(/TRUST_PROXY/);
  });

  it('rejects a Paystack test key unless explicitly allowed (staging)', () => {
    const env = { ...good, PAYSTACK_SECRET_KEY: 'sk_test_x' };
    expect(productionEnvProblems(env)).toHaveLength(1);
    expect(productionEnvProblems({ ...env, ALLOW_PAYSTACK_TEST_KEY: 'true' })).toEqual([]);
  });
});
