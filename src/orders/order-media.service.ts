import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import {
  RIDER_DOCUMENTS_BUCKET,
  StoredFile,
  SupabaseStorageClient,
} from '../storage/supabase-storage.client';
import { DeliveryNotifier } from './delivery-notifier';
import { OrderRepository } from './order.repository';
import { DeliveryOrder, OrderStatus } from './order.types';

export const ORDER_PHOTOS_BUCKET = 'order-photos';
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_MESSAGE_LENGTH = 1000;

/** Chat is open while the rider is on the job; afterwards it is read-only. */
const CHAT_OPEN: OrderStatus[] = ['ASSIGNED', 'PICKED_UP'];

/** The parts of a multer file we use. */
export interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export type ChatRole = 'CUSTOMER' | 'RIDER';

export interface OrderMessage {
  id: string;
  senderRole: ChatRole;
  /** True when the caller sent it (for left/right bubbles). */
  mine: boolean;
  body: string | null;
  hasPhoto: boolean;
  createdAt: string;
}

export interface ChatThread {
  orderId: string;
  myRole: ChatRole;
  /** False once delivered/cancelled: history stays readable, no new messages. */
  open: boolean;
  messages: OrderMessage[];
}

interface MessageRow {
  id: string;
  sender_id: string;
  sender_role: ChatRole;
  body: string | null;
  photo_path: string | null;
  created_at: Date;
}

const IMAGE_KINDS: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': {
    ext: 'png',
    magic: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    ext: 'webp',
    magic: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
};

/** Checks size and real file type (magic bytes, not just the declared type). */
export function validatePhoto(file: UploadedPhoto | undefined): { ext: string; mimetype: string } {
  if (!file || !file.buffer || file.size === 0) {
    throw new BadRequestException('Attach a photo.');
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new BadRequestException('The photo is larger than 5 MB. Take a smaller photo.');
  }
  const kind = IMAGE_KINDS[file.mimetype];
  if (!kind || !kind.magic(file.buffer)) {
    throw new BadRequestException('Send a JPG, PNG or WebP photo.');
  }
  return { ext: kind.ext, mimetype: file.mimetype };
}

/**
 * Package photos and the customer/rider chat for an order. Files live in the private
 * `order-photos` bucket and are uploaded/read with the caller's own Supabase token, so the
 * bucket's policies apply on top of the checks here.
 */
@Injectable()
export class OrderMediaService {
  constructor(
    private readonly db: DatabaseService,
    private readonly orders: OrderRepository,
    private readonly storage: SupabaseStorageClient,
    @Optional() private readonly notify?: DeliveryNotifier,
  ) {}

  /** Customer, before booking: store the item photo and return its path for POST /orders. */
  async uploadPackagePhoto(
    userId: string,
    accessToken: string,
    file: UploadedPhoto | undefined,
  ): Promise<{ photoPath: string }> {
    const { ext, mimetype } = validatePhoto(file);
    const photoPath = `${userId}/package/${crypto.randomUUID()}.${ext}`;
    await this.storage.upload(ORDER_PHOTOS_BUCKET, photoPath, file!.buffer, mimetype, accessToken);
    return { photoPath };
  }

  /** The customer, the assigned rider, or a rider currently offered the order. */
  async readPackagePhoto(
    userId: string,
    accessToken: string,
    orderId: string,
  ): Promise<StoredFile> {
    const order = await this.requireOrder(orderId);
    if (!order.packagePhotoPath) throw new NotFoundException('This order has no package photo');
    const allowed =
      this.roleOf(order, userId) !== null || (await this.hasOpenOffer(orderId, userId));
    if (!allowed) throw new NotFoundException('Order not found');
    return this.storage.download(ORDER_PHOTOS_BUCKET, order.packagePhotoPath, accessToken);
  }

  /**
   * The assigned rider's approved profile photo, for the customer of an order in progress only.
   * Storage enforces the same rule (public.can_read_rider_photo) with the customer's own token.
   */
  async readRiderPhoto(userId: string, accessToken: string, orderId: string): Promise<StoredFile> {
    const order = await this.requireOrder(orderId);
    if (order.customerId !== userId || !order.riderId || !CHAT_OPEN.includes(order.status)) {
      throw new NotFoundException('Order not found');
    }
    const path = await this.orders.approvedRiderPhotoPath(order.riderId);
    if (!path) throw new NotFoundException('This rider has no photo yet');
    return this.storage.download(RIDER_DOCUMENTS_BUCKET, path, accessToken);
  }

  async thread(userId: string, orderId: string): Promise<ChatThread> {
    const { order, role } = await this.requireParticipant(userId, orderId);
    const res = await this.db.query<MessageRow>(
      `SELECT id, sender_id, sender_role, body, photo_path, created_at
       FROM order_messages
       WHERE order_id = $1 AND created_at >= COALESCE($2::timestamptz, '-infinity')
       ORDER BY created_at ASC, id ASC LIMIT 500`,
      [orderId, this.visibleSince(order, role)],
    );
    return {
      orderId,
      myRole: role,
      open: CHAT_OPEN.includes(order.status),
      messages: res.rows.map((r) => this.toMessage(r, userId)),
    };
  }

  async sendText(userId: string, orderId: string, body: string): Promise<ChatThread> {
    const text = (body ?? '').trim();
    if (text.length === 0) throw new BadRequestException('Type a message');
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Messages can be up to ${MAX_MESSAGE_LENGTH} characters`);
    }
    const { role } = await this.requireOpenChat(userId, orderId);
    await this.insert(orderId, userId, role, text, null);
    return this.thread(userId, orderId);
  }

  async sendPhoto(
    userId: string,
    accessToken: string,
    orderId: string,
    file: UploadedPhoto | undefined,
    caption?: string,
  ): Promise<ChatThread> {
    const { ext, mimetype } = validatePhoto(file);
    const text = (caption ?? '').trim().slice(0, MAX_MESSAGE_LENGTH) || null;
    const { role } = await this.requireOpenChat(userId, orderId);
    const photoPath = `${userId}/chat/${orderId}/${crypto.randomUUID()}.${ext}`;
    await this.storage.upload(ORDER_PHOTOS_BUCKET, photoPath, file!.buffer, mimetype, accessToken);
    await this.insert(orderId, userId, role, text, photoPath);
    return this.thread(userId, orderId);
  }

  async readMessagePhoto(
    userId: string,
    accessToken: string,
    orderId: string,
    messageId: string,
  ): Promise<StoredFile> {
    const { order, role } = await this.requireParticipant(userId, orderId);
    const res = await this.db.query<{ photo_path: string | null }>(
      `SELECT photo_path FROM order_messages
       WHERE id = $1 AND order_id = $2 AND created_at >= COALESCE($3::timestamptz, '-infinity')`,
      [messageId, orderId, this.visibleSince(order, role)],
    );
    const path = res.rows[0]?.photo_path;
    if (!path) throw new NotFoundException('Photo not found');
    return this.storage.download(ORDER_PHOTOS_BUCKET, path, accessToken);
  }

  // ---------- helpers ----------

  private async insert(
    orderId: string,
    senderId: string,
    role: ChatRole,
    body: string | null,
    photoPath: string | null,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO order_messages (order_id, sender_id, sender_role, body, photo_path)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, senderId, role, body, photoPath],
    );
    this.notify?.chatMessageById(orderId, role, body);
  }

  private toMessage(r: MessageRow, userId: string): OrderMessage {
    return {
      id: r.id,
      senderRole: r.sender_role,
      mine: r.sender_id === userId,
      body: r.body,
      hasPhoto: Boolean(r.photo_path),
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  /**
   * A rider sees only the chat since they took the job: if an earlier rider handed it back, that
   * conversation (and its photos) stays between the customer and that rider.
   */
  private visibleSince(order: DeliveryOrder, role: ChatRole): Date | string | null {
    return role === 'RIDER' ? (order.assignedAt ?? null) : null;
  }

  roleOf(order: DeliveryOrder, userId: string): ChatRole | null {
    if (order.customerId === userId) return 'CUSTOMER';
    if (order.riderId && order.riderId === userId) return 'RIDER';
    return null;
  }

  private async requireOrder(orderId: string): Promise<DeliveryOrder> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Chat exists once a rider is assigned; only that rider and the customer can see it. */
  private async requireParticipant(
    userId: string,
    orderId: string,
  ): Promise<{ order: DeliveryOrder; role: ChatRole }> {
    const order = await this.requireOrder(orderId);
    const role = this.roleOf(order, userId);
    if (!role || !order.riderId) throw new NotFoundException('Order not found');
    return { order, role };
  }

  private async requireOpenChat(
    userId: string,
    orderId: string,
  ): Promise<{ order: DeliveryOrder; role: ChatRole }> {
    const p = await this.requireParticipant(userId, orderId);
    if (!CHAT_OPEN.includes(p.order.status)) {
      throw new ConflictException('This delivery has ended. Chat is now read-only.');
    }
    return p;
  }

  private async hasOpenOffer(orderId: string, riderId: string): Promise<boolean> {
    const res = await this.db.query(
      `SELECT 1 FROM order_offers
       WHERE order_id = $1 AND rider_id = $2 AND status = 'OFFERED' AND expires_at > NOW()`,
      [orderId, riderId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
