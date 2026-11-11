import * as crypto from 'crypto';
import { HookError, SendSmsHookService, verifyStandardWebhook } from './send-sms-hook.service';

const KEY = crypto.randomBytes(32);
const SECRET = `v1,whsec_${KEY.toString('base64')}`;
const NOW = 1_800_000_000_000;

function signed(
  body: object,
  opts: { key?: Buffer; ts?: number } = {},
): { raw: Buffer; headers: { id: string; timestamp: string; signature: string } } {
  const raw = JSON.stringify(body);
  const id = 'msg_123';
  const timestamp = String(opts.ts ?? NOW / 1000);
  const sig = crypto
    .createHmac('sha256', opts.key ?? KEY)
    .update(`${id}.${timestamp}.${raw}`)
    .digest('base64');
  return { raw: Buffer.from(raw), headers: { id, timestamp, signature: `v1,${sig}` } };
}

const payload = (phone = '233241234567', otp = '561166'): object => ({
  user: { id: 'u1', phone },
  sms: { otp },
});

describe('SendSmsHookService', () => {
  const original = process.env.SUPABASE_SMS_HOOK_SECRET;
  let send: jest.Mock;
  let svc: SendSmsHookService;

  beforeEach(() => {
    process.env.SUPABASE_SMS_HOOK_SECRET = SECRET;
    send = jest.fn().mockResolvedValue(undefined);
    svc = new SendSmsHookService({ send });
    svc.now = (): number => NOW;
  });
  afterAll(() => {
    if (original === undefined) delete process.env.SUPABASE_SMS_HOOK_SECRET;
    else process.env.SUPABASE_SMS_HOOK_SECRET = original;
  });

  it('sends the code by SMS to a Ghana number as an OTP message', async () => {
    const { raw, headers } = signed(payload());
    await svc.handle(raw, headers);
    expect(send).toHaveBeenCalledWith(
      '+233241234567',
      expect.stringContaining('561166 is your GhanaDash code'),
      { otp: true },
    );
  });

  it.each([
    ['a wrong key', signed(payload(), { key: crypto.randomBytes(32) })],
    ['an old timestamp', signed(payload(), { ts: NOW / 1000 - 3600 })],
  ])('rejects %s', async (_label, { raw, headers }) => {
    await expect(svc.handle(raw, headers)).rejects.toMatchObject({ httpCode: 401 });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a changed body', async () => {
    const { headers } = signed(payload());
    const tampered = Buffer.from(JSON.stringify(payload('233209999999')));
    await expect(svc.handle(tampered, headers)).rejects.toMatchObject({ httpCode: 401 });
  });

  it('refuses numbers outside Ghana (SMS pumping protection)', async () => {
    const { raw, headers } = signed(payload('447700900123'));
    await expect(svc.handle(raw, headers)).rejects.toMatchObject({ httpCode: 400 });
    expect(send).not.toHaveBeenCalled();
  });

  it('allows 5 codes per number per hour', async () => {
    for (let i = 0; i < 5; i++) {
      const { raw, headers } = signed(payload());
      await svc.handle(raw, headers);
    }
    const { raw, headers } = signed(payload());
    await expect(svc.handle(raw, headers)).rejects.toMatchObject({ httpCode: 429 });
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('reports an SMS failure without leaking details', async () => {
    send.mockRejectedValue(new Error('mNotify balance low'));
    const { raw, headers } = signed(payload());
    const err = await svc.handle(raw, headers).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HookError);
    expect((err as HookError).httpCode).toBe(502);
    expect((err as HookError).message).not.toMatch(/balance/);
  });

  it('fails closed when the secret is not configured', async () => {
    delete process.env.SUPABASE_SMS_HOOK_SECRET;
    const { raw, headers } = signed(payload());
    await expect(svc.handle(raw, headers)).rejects.toMatchObject({ httpCode: 500 });
  });
});

describe('verifyStandardWebhook', () => {
  it('accepts any of several rotated secrets', () => {
    const { raw, headers } = signed(payload());
    const other = `v1,whsec_${crypto.randomBytes(32).toString('base64')}`;
    expect(verifyStandardWebhook(`${other}|${SECRET}`, headers, raw.toString(), NOW / 1000)).toBe(
      true,
    );
  });
});
