import * as crypto from 'crypto';
import { CloudflareAccessVerifier, cloudflareAccessFromEnv } from './cloudflare-access';

const TEAM = 'myteam.cloudflareaccess.com';
const AUD = 'a'.repeat(64);
const NOW = 1_800_000_000_000;

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: 'k1' };

function sign(
  payload: Record<string, unknown>,
  opts: { kid?: string; alg?: string; key?: crypto.KeyObject } = {},
): string {
  const header = { alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' };
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .sign('sha256', Buffer.from(`${h}.${p}`), opts.key ?? privateKey)
    .toString('base64url');
  return `${h}.${p}.${sig}`;
}

const good = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  aud: [AUD],
  iss: `https://${TEAM}`,
  exp: NOW / 1000 + 600,
  nbf: NOW / 1000 - 10,
  email: 'admin@example.com',
  sub: 'user-1',
  ...over,
});

function makeVerifier(): { v: CloudflareAccessVerifier; fetchMock: jest.Mock } {
  const v = new CloudflareAccessVerifier(TEAM, AUD);
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: (): Promise<unknown> => Promise.resolve({ keys: [jwk] }),
  });
  v.fetchImpl = fetchMock as unknown as typeof fetch;
  v.now = (): number => NOW;
  return { v, fetchMock };
}

describe('CloudflareAccessVerifier', () => {
  it('accepts a valid pass for our app and returns the email', async () => {
    const { v, fetchMock } = makeVerifier();
    await expect(v.verify(sign(good()))).resolves.toEqual({
      email: 'admin@example.com',
      sub: 'user-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(`https://${TEAM}/cdn-cgi/access/certs`);
  });

  it('accepts aud given as a plain string', async () => {
    const { v } = makeVerifier();
    await expect(v.verify(sign(good({ aud: AUD })))).resolves.not.toBeNull();
  });

  it('caches keys between requests', async () => {
    const { v, fetchMock } = makeVerifier();
    await v.verify(sign(good()));
    await v.verify(sign(good()));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing token', undefined],
    ['garbage', 'not-a-jwt'],
    ['another Access app', sign(good({ aud: ['b'.repeat(64)] }))],
    ['another team', sign(good({ iss: 'https://evil.cloudflareaccess.com' }))],
    ['expired', sign(good({ exp: NOW / 1000 - 3600 }))],
    ['not yet valid', sign(good({ nbf: NOW / 1000 + 3600 }))],
    ['wrong signing key', sign(good(), { key: other.privateKey })],
    ['unknown key id', sign(good(), { kid: 'nope' })],
    ['HS256 algorithm', sign(good(), { alg: 'HS256' })],
  ])('refuses %s', async (_label, token) => {
    const { v } = makeVerifier();
    await expect(v.verify(token)).resolves.toBeNull();
  });

  it('fails closed when the keys cannot be loaded', async () => {
    const { v, fetchMock } = makeVerifier();
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(v.verify(sign(good()))).resolves.toBeNull();
  });

  it('normalises the team domain', async () => {
    const v = new CloudflareAccessVerifier('https://MyTeam.cloudflareaccess.com/', AUD);
    v.fetchImpl = makeVerifier().fetchMock as unknown as typeof fetch;
    v.now = (): number => NOW;
    await expect(v.verify(sign(good()))).resolves.not.toBeNull();
  });
});

describe('cloudflareAccessFromEnv', () => {
  it('needs both settings', () => {
    expect(cloudflareAccessFromEnv({})).toBeNull();
    expect(cloudflareAccessFromEnv({ CF_ACCESS_TEAM_DOMAIN: TEAM })).toBeNull();
    expect(
      cloudflareAccessFromEnv({ CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD }),
    ).toBeInstanceOf(CloudflareAccessVerifier);
  });
});
