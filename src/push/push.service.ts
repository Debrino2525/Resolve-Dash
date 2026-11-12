import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type PushApp = 'customer' | 'rider';
export type PushPlatform = 'ios' | 'android';

/** Android notification channels the apps create (sound and importance live on the channel). */
export type PushChannel = 'offers' | 'delivery' | 'calls' | 'chat' | 'alerts';

export interface PushMessage {
  title: string;
  body: string;
  channel: PushChannel;
  /** Read by the app when the notification is tapped (e.g. { type: 'order', orderId }). */
  data?: Record<string, string>;
  /** Seconds Expo/FCM/APNs should keep trying to deliver; 0 = now or never. */
  ttl?: number;
  /** Custom sound file bundled in the app (iOS); Android takes it from the channel. */
  sound?: string;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;
export const PUSH_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Sends notifications through Expo's push service (which relays to FCM on Android and APNs on
 * iOS). Sending is best-effort and never throws: a failed push must not fail the delivery
 * action that triggered it. Tokens Expo reports as no longer registered are deleted.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init);
  /** Off in tests unless a test turns it on with a fake fetch. */
  enabled = process.env.NODE_ENV !== 'test' && process.env.PUSH_DISABLED !== 'true';

  constructor(private readonly db: DatabaseService) {}

  async register(
    userId: string,
    app: PushApp,
    platform: PushPlatform,
    token: string,
  ): Promise<void> {
    // A token belongs to one install; if someone else signs in on that phone it moves to them.
    await this.db.query(
      `INSERT INTO push_tokens (token, user_id, app, platform) VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id, app = EXCLUDED.app, platform = EXCLUDED.platform,
           updated_at = NOW()`,
      [token, userId, app, platform],
    );
  }

  /** On sign-out: this phone stops getting that person's notifications. */
  async unregister(userId: string, token: string): Promise<void> {
    await this.db.query(`DELETE FROM push_tokens WHERE token = $1 AND user_id = $2`, [
      token,
      userId,
    ]);
  }

  /** Fire-and-forget send to every device a person has for that app. */
  notify(userId: string | null | undefined, app: PushApp, msg: PushMessage): void {
    if (!userId) return;
    void this.send([userId], app, msg);
  }

  async send(userIds: string[], app: PushApp, msg: PushMessage): Promise<void> {
    if (!this.enabled || userIds.length === 0) return;
    try {
      const res = await this.db.query<{ token: string }>(
        `SELECT token FROM push_tokens WHERE user_id = ANY($1::uuid[]) AND app = $2`,
        [userIds, app],
      );
      const tokens = res.rows.map((r) => r.token);
      for (let i = 0; i < tokens.length; i += BATCH) {
        await this.post(tokens.slice(i, i + BATCH), msg);
      }
    } catch (err) {
      this.logger.warn(`Push failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async post(tokens: string[], msg: PushMessage): Promise<void> {
    const body = tokens.map((to) => ({
      to,
      title: msg.title,
      body: msg.body,
      data: msg.data ?? {},
      channelId: msg.channel,
      sound: msg.sound ?? 'default',
      priority: 'high',
      ...(msg.ttl !== undefined ? { ttl: msg.ttl } : {}),
    }));
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    // Optional: with "enhanced push security" on in Expo, sends must carry an access token.
    if (process.env.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    }
    const res = await this.fetchImpl(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      this.logger.warn(`Expo push returned HTTP ${res.status}`);
      return;
    }
    const json = (await res.json()) as { data?: ExpoTicket[] };
    const dead = (json.data ?? [])
      .map((t, i) =>
        t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? tokens[i] : null,
      )
      .filter((t): t is string => Boolean(t));
    if (dead.length) {
      await this.db.query(`DELETE FROM push_tokens WHERE token = ANY($1::text[])`, [dead]);
    }
  }
}
