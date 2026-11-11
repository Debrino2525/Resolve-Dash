import { Logger } from '@nestjs/common';
import { ISmsProvider, SendSmsOptions } from './sms.interface';

export interface MnotifyConfig {
  readonly apiKey: string;
  /** Approved sender ID, at most 11 characters. OTP messages need an approved OTP sender ID. */
  readonly senderId: string;
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
}

interface MnotifyQuickResponse {
  status?: string;
  code?: string;
  message?: string;
  summary?: { total_sent?: number; total_rejected?: number };
}

/**
 * mNotify (BMS API v2) quick SMS: POST https://api.mnotify.com/api/sms/quick?key=API_KEY
 * Docs: https://developer.bms.africa/#tag/SMS/operation/campaign/sms_quick
 *
 * Recipients are local Ghana numbers (0241234567). Success is status "success" / code "2000".
 */
export class MnotifyProvider implements ISmsProvider {
  private readonly logger = new Logger(MnotifyProvider.name);
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: MnotifyConfig) {
    if (!config.apiKey) throw new Error('mNotify API key is required');
    if (!config.senderId || config.senderId.length > 11) {
      throw new Error('mNotify sender ID is required and must be at most 11 characters');
    }
    this.baseUrl = (config.baseUrl ?? 'https://api.mnotify.com/api').replace(/\/+$/, '');
    this.fetchImpl = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async send(phoneE164: string, message: string, options: SendSmsOptions = {}): Promise<void> {
    const recipient = toGhanaLocal(phoneE164);
    const body: Record<string, unknown> = {
      recipient: [recipient],
      sender: this.config.senderId,
      message,
      is_schedule: false,
      schedule_date: '',
    };
    if (options.otp) body.sms_type = 'otp';

    // The key travels in the query string (mNotify's scheme): never log this URL.
    const url = `${this.baseUrl}/sms/quick?key=${encodeURIComponent(this.config.apiKey)}`;

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(
        `mNotify request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new Error('SMS provider unreachable');
    }

    const parsed = (await res.json().catch(() => ({}))) as MnotifyQuickResponse;
    const sent = parsed.summary?.total_sent ?? 0;
    if (!res.ok || parsed.status !== 'success' || parsed.code !== '2000' || sent < 1) {
      const hint =
        res.status === 402
          ? options.otp
            ? ' (402 Payment Required: OTP sends are charged to the mNotify MAIN WALLET, separate from SMS credits; top up the wallet)'
            : ' (402 Payment Required: insufficient mNotify SMS credit)'
          : '';
      this.logger.warn(
        `mNotify rejected SMS to ${maskPhone(phoneE164)}: HTTP ${res.status} code=${parsed.code ?? '?'} ${parsed.message ?? ''}${hint} body=${JSON.stringify(parsed).slice(0, 300)}`,
      );
      throw new Error(`SMS was not sent: ${parsed.message ?? `HTTP ${res.status}`}`);
    }
  }
}

/** +233241234567 → 0241234567 (mNotify's expected recipient format). */
export function toGhanaLocal(phoneE164: string): string {
  const match = /^\+233(\d{9})$/.exec(phoneE164);
  if (!match) throw new Error('Only Ghana (+233) mobile numbers are supported for SMS');
  return `0${match[1]}`;
}

export function maskPhone(phone: string): string {
  return phone.length > 4 ? `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}` : '****';
}
