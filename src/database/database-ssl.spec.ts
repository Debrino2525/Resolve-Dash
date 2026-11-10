import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildDatabaseSslConfig, readPoolMax } from './database-ssl';

describe('buildDatabaseSslConfig', () => {
  const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';

  it('disables TLS only when DATABASE_SSL=false', () => {
    expect(buildDatabaseSslConfig({ DATABASE_SSL: 'false' })).toEqual({ ssl: false });
  });

  it('verifies the certificate when a PEM CA is supplied inline', () => {
    const { ssl, warning } = buildDatabaseSslConfig({
      DATABASE_SSL_CA: PEM,
      NODE_ENV: 'production',
    });
    expect(ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
    expect(warning).toBeUndefined();
  });

  it('accepts a PEM with escaped \\n (single-line env var)', () => {
    const { ssl } = buildDatabaseSslConfig({ DATABASE_SSL_CA: PEM.replace(/\n/g, '\\n') });
    expect(ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('reads the CA from a file path', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ca-')), 'ca.pem');
    fs.writeFileSync(file, PEM);
    expect(buildDatabaseSslConfig({ DATABASE_SSL_CA: file }).ssl).toEqual({
      ca: PEM,
      rejectUnauthorized: true,
    });
  });

  it('fails loudly when the CA file cannot be read', () => {
    expect(() => buildDatabaseSslConfig({ DATABASE_SSL_CA: '/nope/missing.pem' })).toThrow(
      /cannot be read/,
    );
  });

  it('refuses to start unverified in production', () => {
    expect(() => buildDatabaseSslConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_SSL_CA/);
  });

  it('allows an explicit, warned opt-out in production', () => {
    const result = buildDatabaseSslConfig({
      NODE_ENV: 'production',
      DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
    });
    expect(result.ssl).toEqual({ rejectUnauthorized: false });
    expect(result.warning).toMatch(/NOT verified/);
  });

  it('stays unverified but warns in development', () => {
    const result = buildDatabaseSslConfig({ NODE_ENV: 'development' });
    expect(result.ssl).toEqual({ rejectUnauthorized: false });
    expect(result.warning).toMatch(/NOT verified/);
  });
});

describe('readPoolMax', () => {
  it.each([
    [undefined, 10],
    ['25', 25],
    ['0', 10],
    ['x', 10],
  ])('parses %p as %p', (raw, expected) => {
    expect(readPoolMax(raw)).toBe(expected);
  });
});
