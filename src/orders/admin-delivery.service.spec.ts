import { ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AdminDeliveryService } from './admin-delivery.service';
import { DeliveryNotifier } from './delivery-notifier';
import { DispatchService } from './dispatch.service';
import { OrderRepository } from './order.repository';
import { DeliveryOrder } from './order.types';

const ADMIN = '99999999-9999-9999-9999-999999999999';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(order: Partial<DeliveryOrder> | null) {
  const queries: { text: string; values: unknown[] }[] = [];
  const client = {
    query: jest.fn(async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      return { rows: [] };
    }),
  };
  const db = {
    withTransaction: jest.fn(async (fn: (c: typeof client) => unknown) => fn(client)),
  } as unknown as DatabaseService;
  const full = order
    ? ({
        id: 'o1',
        code: 'GD-1',
        customerId: 'c1',
        riderId: 'r1',
        extraStops: [],
        ...order,
      } as DeliveryOrder)
    : null;
  const orders = { lockById: jest.fn(async () => full) } as unknown as OrderRepository;
  const dispatch = { kick: jest.fn() } as unknown as DispatchService;
  const notify = { closedBySupport: jest.fn() } as unknown as jest.Mocked<DeliveryNotifier>;
  return {
    service: new AdminDeliveryService(db, orders, dispatch, notify),
    queries,
    notify,
    dispatch,
  };
}

describe('AdminDeliveryService', () => {
  it('marks a picked-up delivery delivered, finishing pending drop-offs and recording the admin', async () => {
    const { service, queries, notify } = setup({
      status: 'PICKED_UP',
      extraStops: [
        { status: 'PENDING', doneAt: null } as never,
        { status: 'FAILED', doneAt: '2026-11-12T10:00:00Z' } as never,
      ],
    });
    await service.markDelivered('o1', ADMIN, 'Customer confirmed by phone');
    const update = queries.find((q) => q.text.includes("status = 'DELIVERED'"));
    expect(update?.values[2]).toBe(ADMIN);
    expect(update?.values[3]).toBe('Customer confirmed by phone');
    const stops = JSON.parse(String(update?.values[1])) as { status: string }[];
    expect(stops.map((s) => s.status)).toEqual(['DELIVERED', 'FAILED']);
    expect(notify.closedBySupport).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'o1' }),
      'DELIVERED',
    );
  });

  it('only marks picked-up deliveries delivered', async () => {
    for (const status of ['ASSIGNED', 'SEARCHING', 'DELIVERED', 'CANCELLED'] as const) {
      const { service, notify } = setup({ status });
      await expect(service.markDelivered('o1', ADMIN, 'note')).rejects.toThrow(ConflictException);
      expect(notify.closedBySupport).not.toHaveBeenCalled();
    }
  });

  it('cancels at any open stage, withdraws offers and tells both sides', async () => {
    for (const status of ['SEARCHING', 'ASSIGNED', 'PICKED_UP'] as const) {
      const { service, queries, notify, dispatch } = setup({ status });
      await service.cancel('o1', ADMIN, 'Rider unreachable');
      const update = queries.find((q) => q.text.includes("status = 'CANCELLED'"));
      expect(update?.text).toContain("cancelled_by = 'ADMIN'");
      expect(update?.values).toEqual(['o1', 'Rider unreachable', ADMIN]);
      expect(queries.some((q) => q.text.includes("SET status = 'WITHDRAWN'"))).toBe(true);
      expect(notify.closedBySupport).toHaveBeenCalledWith(expect.anything(), 'CANCELLED');
      expect(dispatch.kick).toHaveBeenCalled();
    }
  });

  it('refuses to cancel a finished delivery, or one that does not exist', async () => {
    await expect(
      setup({ status: 'DELIVERED' }).service.cancel('o1', ADMIN, 'x y z'),
    ).rejects.toThrow(ConflictException);
    await expect(setup(null).service.cancel('o1', ADMIN, 'x y z')).rejects.toThrow(
      NotFoundException,
    );
  });
});
