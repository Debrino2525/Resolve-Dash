import * as crypto from 'crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RtcRole, RtcTokenBuilder } from 'agora-token';
import { DeliveryNotifier } from './delivery-notifier';
import { OrderRepository } from './order.repository';
import { DeliveryOrder, OrderStatus } from './order.types';

/**
 * In-app voice calls between a delivery's customer and its assigned rider (Agora).
 *
 * Neither side sees the other's phone credit used, and a call is only possible while the
 * delivery is in progress. Our server decides who may call: it hands out a short-lived Agora
 * token for a channel unique to this call, so nobody can join a call they don't belong to.
 *
 * Ringing works over the polling both apps already do (the customer's order and the rider's job
 * carry `call`). Calls live in memory: the API runs as a single instance, and a call that is lost
 * on a redeploy simply ends (both sides see it drop and can call again).
 */

export type CallRole = 'CUSTOMER' | 'RIDER';
export type CallStatus = 'RINGING' | 'ACTIVE' | 'ENDED';
export type CallEndReason = 'HUNG_UP' | 'DECLINED' | 'MISSED' | 'CANCELLED' | 'DELIVERY_ENDED';

/** What each app sees about the current call on a delivery. */
export interface CallSummary {
  id: string;
  status: CallStatus;
  /** Who started the call. */
  from: CallRole;
  /** True when the call was started by the other person (show "incoming"). */
  incoming: boolean;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  endReason: CallEndReason | null;
}

/** Everything the app needs to join the Agora channel. */
export interface CallJoin {
  call: CallSummary;
  appId: string;
  channel: string;
  token: string;
  uid: number;
}

interface CallSession {
  id: string;
  orderId: string;
  from: CallRole;
  status: CallStatus;
  startedAt: number;
  answeredAt: number | null;
  endedAt: number | null;
  endReason: CallEndReason | null;
}

const CALL_OPEN: OrderStatus[] = ['ASSIGNED', 'PICKED_UP'];
/** Unanswered calls stop ringing after this. */
export const RING_TIMEOUT_MS = 45_000;
/** An ended call stays visible this long, so both apps can show "Call ended". */
const ENDED_VISIBLE_MS = 30_000;
/** Agora token lifetime: comfortably longer than any delivery call. */
const TOKEN_TTL_S = 60 * 60;
/** Fixed Agora user ids per side; a channel only ever has these two. */
const UID: Record<CallRole, number> = { CUSTOMER: 1, RIDER: 2 };

@Injectable()
export class OrderCallService {
  private readonly calls = new Map<string, CallSession>();
  now: () => number = () => Date.now();

  constructor(
    private readonly orders: OrderRepository,
    @Optional() private readonly notify?: DeliveryNotifier,
  ) {}

  /** The other person on the delivery calls; start ringing. */
  async start(userId: string, orderId: string): Promise<CallJoin> {
    const { order, role } = await this.requireOpenParticipant(userId, orderId);
    const existing = this.current(orderId);
    if (existing && existing.status !== 'ENDED') {
      // Both pressed Call at once: join the call that's already ringing instead of a second one.
      if (existing.from !== role && existing.status === 'RINGING')
        return this.answer(userId, orderId);
      if (existing.from === role || existing.status === 'ACTIVE')
        return this.join(existing, role, order);
    }
    const session: CallSession = {
      id: crypto.randomUUID(),
      orderId,
      from: role,
      status: 'RINGING',
      startedAt: this.now(),
      answeredAt: null,
      endedAt: null,
      endReason: null,
    };
    this.calls.set(orderId, session);
    this.notify?.incomingCall(order, role);
    return this.join(session, role, order);
  }

  /** The person being called picks up. */
  async answer(userId: string, orderId: string): Promise<CallJoin> {
    const { order, role } = await this.requireOpenParticipant(userId, orderId);
    const session = this.current(orderId);
    if (!session || session.status === 'ENDED') {
      throw new ConflictException('This call has ended. Call back if you still need to talk.');
    }
    if (session.status === 'RINGING' && session.from !== role) {
      session.status = 'ACTIVE';
      session.answeredAt = this.now();
    }
    return this.join(session, role, order);
  }

  /** Hang up, decline, or cancel a call that hasn't been answered. */
  async end(userId: string, orderId: string): Promise<CallSummary | null> {
    const { role } = await this.requireParticipant(userId, orderId);
    const session = this.current(orderId);
    if (!session || session.status === 'ENDED') return session ? this.summary(session, role) : null;
    const reason: CallEndReason =
      session.status === 'ACTIVE' ? 'HUNG_UP' : session.from === role ? 'CANCELLED' : 'DECLINED';
    this.finish(session, reason);
    return this.summary(session, role);
  }

  /** Current call on a delivery as seen by one side (null if none); used by the polled views. */
  summaryFor(orderId: string, role: CallRole, orderStatus?: OrderStatus): CallSummary | null {
    const session = this.current(orderId);
    if (!session) return null;
    if (orderStatus && !CALL_OPEN.includes(orderStatus) && session.status !== 'ENDED') {
      this.finish(session, 'DELIVERY_ENDED');
    }
    return this.summary(session, role);
  }

  /** Latest call, after applying ring timeout and forgetting long-ended calls. */
  private current(orderId: string): CallSession | null {
    const s = this.calls.get(orderId);
    if (!s) return null;
    const now = this.now();
    if (s.status === 'RINGING' && now - s.startedAt > RING_TIMEOUT_MS) this.finish(s, 'MISSED');
    if (s.status === 'ENDED' && s.endedAt !== null && now - s.endedAt > ENDED_VISIBLE_MS) {
      this.calls.delete(orderId);
      return null;
    }
    return s;
  }

  private finish(s: CallSession, reason: CallEndReason): void {
    s.status = 'ENDED';
    s.endedAt = this.now();
    s.endReason = reason;
  }

  private summary(s: CallSession, role: CallRole): CallSummary {
    const iso = (t: number | null): string | null =>
      t === null ? null : new Date(t).toISOString();
    return {
      id: s.id,
      status: s.status,
      from: s.from,
      incoming: s.from !== role,
      startedAt: new Date(s.startedAt).toISOString(),
      answeredAt: iso(s.answeredAt),
      endedAt: iso(s.endedAt),
      endReason: s.endReason,
    };
  }

  private join(s: CallSession, role: CallRole, order: DeliveryOrder): CallJoin {
    const appId = process.env.AGORA_APP_ID?.trim();
    const certificate = process.env.AGORA_APP_CERTIFICATE?.trim();
    if (!appId || !certificate) {
      throw new ServiceUnavailableException(
        'In-app calling is not available right now. Use Call or WhatsApp instead.',
      );
    }
    // One channel per call; the order id keeps it traceable in Agora's console.
    const channel = `gd-${order.id.slice(0, 8)}-${s.id.slice(0, 8)}`;
    const uid = UID[role];
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      certificate,
      channel,
      uid,
      RtcRole.PUBLISHER,
      TOKEN_TTL_S,
      TOKEN_TTL_S,
    );
    return { call: this.summary(s, role), appId, channel, token, uid };
  }

  private roleOf(order: DeliveryOrder, userId: string): CallRole | null {
    if (order.customerId === userId) return 'CUSTOMER';
    if (order.riderId && order.riderId === userId) return 'RIDER';
    return null;
  }

  private async requireParticipant(
    userId: string,
    orderId: string,
  ): Promise<{ order: DeliveryOrder; role: CallRole }> {
    const order = await this.orders.findById(orderId);
    const role = order ? this.roleOf(order, userId) : null;
    if (!order || !role || !order.riderId) throw new NotFoundException('Order not found');
    return { order, role };
  }

  private async requireOpenParticipant(
    userId: string,
    orderId: string,
  ): Promise<{ order: DeliveryOrder; role: CallRole }> {
    const p = await this.requireParticipant(userId, orderId);
    if (!CALL_OPEN.includes(p.order.status)) {
      const s = this.calls.get(orderId);
      if (s && s.status !== 'ENDED') this.finish(s, 'DELIVERY_ENDED');
      throw new ConflictException('Calls are only available while the delivery is in progress.');
    }
    return p;
  }
}
