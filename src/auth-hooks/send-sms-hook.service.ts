import * as crypto from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '../sms/mnotify.provider';
import { ISmsProvider, SMS_PROVIDER_TOKEN } from '../sms/sms.interface';

/**
 * Supabase Auth "Send SMS" hook: Supabase generates the sign-in code and calls this endpoint to
 * deliver it, so phone sign-in goes through our mNotify account (Supabase has no Ghana provider).
 *
 * Requests are signed with Standard Webhooks (https://www.standardwebhooks.com): HMAC-SHA256 over
 * "<webhook-id>.<webhook-timestamp>.<body>" with the secret Supabase shows when the hook is created
 * ("v1,whsec_<base64>"), set here as SUPABASE_SMS_HOOK_SECRET.
 *
 * Abuse limits (SMS costs money): Ghana numbers only, and at most 5 codes per number per hour.
 */

const TOLERANCE_SEC = 5 * 60;
const MAX_PER_HOUR = 5;
const GHANA_E164 = /^\+233\d{9}$/;

export class HookError extends Error {
  constructor(
    readonly httpCode: number,
    message: string,
  ) {
    super(message);
  }
}

interface HookPayload {
  user?: { id?: string; phone?: string };
  sms?: { otp?: string };
}

/** Verifies a Standard Webhooks signature. Exported for tests. */
export function verifyStandardWebhook(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  body: string,
  nowSec: number,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > TOLERANCE_SEC) return false;
  // Several secrets may be configured during rotation: "v1,whsec_a|v1,whsec_b".
  for (const one of secret.split('|')) {
    const key = Buffer.from(one.trim().replace(/^v1,whsec_/, ''), 'base64');
    if (key.length === 0) continue;
    const expected = crypto
      .createHmac('sha256', key)
      .update(`${id}.${timestamp}.${body}`)
      .digest();
    for (const part of signature.split(' ')) {
      const [version, sig] = part.split(',');
      if (version !== 'v1' || !sig) continue;
      const given = Buffer.from(sig, 'base64');
      if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return true;
    }
  }
  return false;
}

@Injectable()
export class SendSmsHookService {
  private readonly logger = new Logger(SendSmsHookService.name);
  private readonly sent = new Map<string, number[]>();
  now: () => number = () => Date.now();

  constructor(@Inject(SMS_PROVIDER_TOKEN) private readonly sms: ISmsProvider) {}

  async handle(
    rawBody: Buffer,
    headers: { id?: string; timestamp?: string; signature?: string },
  ): Promise<void> {
    const secret = process.env.SUPABASE_SMS_HOOK_SECRET?.trim();
    if (!secret) throw new HookError(500, 'SMS hook is not configured');
    const body = rawBody.toString('utf8');
    if (!verifyStandardWebhook(secret, headers, body, Math.floor(this.now() / 1000))) {
      throw new HookError(401, 'Invalid signature');
    }

    let payload: HookPayload;
    try {
      payload = JSON.parse(body) as HookPayload;
    } catch {
      throw new HookError(400, 'Invalid payload');
    }
    const raw = payload.user?.phone?.trim() ?? '';
    const phone = raw.startsWith('+') ? raw : `+${raw}`;
    const otp = payload.sms?.otp ?? '';
    if (!/^\d{4,8}$/.test(otp)) throw new HookError(400, 'Invalid code');
    if (!GHANA_E164.test(phone)) {
      throw new HookError(400, 'GhanaDash works with Ghana phone numbers (+233) only.');
    }

    const nowMs = this.now();
    const recent = (this.sent.get(phone) ?? []).filter((t) => nowMs - t < 60 * 60 * 1000);
    if (recent.length >= MAX_PER_HOUR) {
      throw new HookError(429, 'Too many codes for this number. Try again in an hour.');
    }
    recent.push(nowMs);
    this.sent.set(phone, recent);

    try {
      await this.sms.send(
        phone,
        `${otp} is your GhanaDash code. It expires in 10 minutes. Never share it, not even with GhanaDash staff.`,
        { otp: true },
      );
    } catch (err) {
      this.logger.error(
        `Sign-in code to ${maskPhone(phone)} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new HookError(502, 'Could not send the SMS. Try again shortly.');
    }
  }
}
