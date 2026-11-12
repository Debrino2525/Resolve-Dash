import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { ISmsProvider, SMS_PROVIDER_TOKEN } from '../sms/sms.interface';

export const OTP_TTL_MS = 10 * 60 * 1000; // code valid for 10 minutes
export const OTP_MAX_ATTEMPTS = 5; // wrong guesses before the code is burned
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // per account
export const PROOF_TTL_MS = 30 * 60 * 1000; // verified-phone proof usable for 30 minutes
/** Codes per account, and per phone number, in any 24 hours (each SMS costs money). */
export const OTP_DAILY_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** All verification SMS together per hour: a ceiling on cost if many accounts are abused at once. */
export const smsHourlyLimit = (): number => {
  const n = Number.parseInt(process.env.SMS_HOURLY_LIMIT ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : 300;
};

/** Ghana mobile in E.164: +233 followed by 9 digits starting 2 or 5 (e.g. +233241234567). */
export const GHANA_MOBILE_E164 = /^\+233[25]\d{8}$/;

interface PendingCode {
  userId: string;
  phone: string;
  codeHash: Buffer;
  expiresAt: number;
  attempts: number;
}

/**
 * Returns true if `phone` already belongs to a different account of the caller's kind
 * (another rider, or another customer). Checked before any SMS is paid for.
 */
export type PhoneOwnershipCheck = (phone: string, userId: string) => Promise<boolean>;

export interface SendCodeResult {
  verificationId: string;
  phoneNumber: string;
  expiresAt: string;
  resendAfterSeconds: number;
}

export interface VerifyCodeResult {
  phoneNumber: string;
  /** Pass to POST /riders/onboard as phoneVerificationToken. */
  phoneVerificationToken: string;
}

/**
 * SMS one-time-code verification of a rider's phone number, delivered via the SMS provider
 * (mNotify). mNotify only delivers messages; generating, expiring and checking codes is ours.
 *
 * State is in memory: fine for a single backend instance. Run several instances behind a
 * load balancer and this must move to the database or Redis (codes sent by one instance
 * would not be found by another).
 */
@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);
  private readonly pending = new Map<string, PendingCode>();
  private readonly lastSentAt = new Map<string, number>();
  /** Send times in the last 24 h, by "u:<userId>" and "p:<phone>". */
  private readonly sentLog = new Map<string, number[]>();
  private sentAll: number[] = [];
  private readonly secret: Buffer;

  constructor(@Inject(SMS_PROVIDER_TOKEN) private readonly sms: ISmsProvider) {
    const configured = process.env.PHONE_VERIFICATION_SECRET?.trim();
    if (configured) {
      this.secret = Buffer.from(configured, 'utf8');
    } else {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('PHONE_VERIFICATION_SECRET must be set in production');
      }
      // Dev: per-process secret. Proofs stop validating after a restart, which is harmless.
      this.secret = crypto.randomBytes(32);
    }
  }

  async sendCode(
    userId: string,
    phoneNumber: string,
    now = Date.now(),
    isTakenByAnother?: PhoneOwnershipCheck,
  ): Promise<SendCodeResult> {
    const phone = phoneNumber.trim();
    if (!GHANA_MOBILE_E164.test(phone)) {
      throw new BadRequestException('Enter a valid Ghana mobile number, e.g. +233241234567');
    }

    const last = this.lastSentAt.get(userId);
    if (last !== undefined && now - last < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - last)) / 1000);
      throw new HttpException(
        `Please wait ${wait}s before requesting another code`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Don't spend SMS credit on (or let someone squat) a number another account already owns.
    const recent = (key: string): number[] =>
      (this.sentLog.get(key) ?? []).filter((t) => now - t < DAY_MS);
    if (
      recent(`u:${userId}`).length >= OTP_DAILY_LIMIT ||
      recent(`p:${phone}`).length >= OTP_DAILY_LIMIT
    ) {
      throw new HttpException(
        'Too many codes requested today. Try again tomorrow, or contact GhanaDash support.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.sentAll = this.sentAll.filter((t) => now - t < HOUR_MS);
    if (this.sentAll.length >= smsHourlyLimit()) {
      this.logger.error('Hourly verification SMS limit reached; refusing more codes for now');
      throw new ServiceUnavailableException(
        'We could not send the SMS code right now. Please try again shortly.',
      );
    }

    if (isTakenByAnother && (await isTakenByAnother(phone, userId))) {
      throw new ConflictException(
        'This phone number is already registered to another account. Contact GhanaDash support if it is yours.',
      );
    }

    this.purgeExpired(now);
    // Only one live code per account: a new request invalidates the old one.
    for (const [id, entry] of this.pending) {
      if (entry.userId === userId) this.pending.delete(id);
    }

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const verificationId = crypto.randomBytes(16).toString('hex');
    const expiresAt = now + OTP_TTL_MS;

    try {
      await this.sms.send(
        phone,
        `Your GhanaDash verification code is ${code}. It expires in 10 minutes. Do not share it.`,
        { otp: true },
      );
    } catch (err) {
      this.logger.error(`OTP SMS failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException(
        'We could not send the SMS code right now. Please try again shortly.',
      );
    }

    this.pending.set(verificationId, {
      userId,
      phone,
      codeHash: hashCode(verificationId, code),
      expiresAt,
      attempts: 0,
    });
    this.lastSentAt.set(userId, now);
    for (const key of [`u:${userId}`, `p:${phone}`]) this.sentLog.set(key, [...recent(key), now]);
    this.sentAll.push(now);

    return {
      verificationId,
      phoneNumber: phone,
      expiresAt: new Date(expiresAt).toISOString(),
      resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
    };
  }

  verifyCode(
    userId: string,
    verificationId: string,
    code: string,
    now = Date.now(),
  ): VerifyCodeResult {
    const entry = this.pending.get(verificationId);
    if (!entry || entry.userId !== userId || entry.expiresAt <= now) {
      if (entry && entry.expiresAt <= now) this.pending.delete(verificationId);
      throw new BadRequestException('This code has expired. Request a new one.');
    }

    entry.attempts += 1;
    const ok =
      /^\d{6}$/.test(code.trim()) &&
      crypto.timingSafeEqual(entry.codeHash, hashCode(verificationId, code.trim()));

    if (!ok) {
      if (entry.attempts >= OTP_MAX_ATTEMPTS) {
        this.pending.delete(verificationId);
        throw new BadRequestException('Too many incorrect attempts. Request a new code.');
      }
      throw new BadRequestException(
        `Incorrect code. ${OTP_MAX_ATTEMPTS - entry.attempts} attempt(s) left.`,
      );
    }

    this.pending.delete(verificationId);
    return {
      phoneNumber: entry.phone,
      phoneVerificationToken: this.signProof(userId, entry.phone, now + PROOF_TTL_MS),
    };
  }

  /** Returns the verified phone if the proof is authentic, unexpired and issued to `userId`. */
  readProof(userId: string, token: string | undefined, now = Date.now()): string | undefined {
    if (!token) return undefined;
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return undefined;

    const expected = crypto.createHmac('sha256', this.secret).update(payloadB64).digest();
    const actual = Buffer.from(sigB64, 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return undefined;
    }

    try {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
        sub?: string;
        phone?: string;
        exp?: number;
      };
      if (payload.sub !== userId || !payload.phone || !payload.exp || payload.exp <= now) {
        return undefined;
      }
      return payload.phone;
    } catch {
      return undefined;
    }
  }

  private signProof(userId: string, phone: string, exp: number): string {
    const payloadB64 = Buffer.from(JSON.stringify({ sub: userId, phone, exp })).toString(
      'base64url',
    );
    const sig = crypto.createHmac('sha256', this.secret).update(payloadB64).digest('base64url');
    return `${payloadB64}.${sig}`;
  }

  private purgeExpired(now: number): void {
    for (const [id, entry] of this.pending) {
      if (entry.expiresAt <= now) this.pending.delete(id);
    }
    for (const [userId, at] of this.lastSentAt) {
      if (now - at > OTP_TTL_MS) this.lastSentAt.delete(userId);
    }
    for (const [key, times] of this.sentLog) {
      if (times.every((t) => now - t >= DAY_MS)) this.sentLog.delete(key);
    }
  }
}

function hashCode(verificationId: string, code: string): Buffer {
  return crypto.createHash('sha256').update(`${verificationId}:${code}`).digest();
}
