import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { OrderCallService, RING_TIMEOUT_MS } from './order-call.service';
import { OrderRepository } from './order.repository';
import { DeliveryOrder, OrderStatus } from './order.types';

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const RIDER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '99999999-9999-4999-8999-999999999999';
const ORDER = '33333333-3333-4333-8333-333333333333';

function order(status: OrderStatus = 'ASSIGNED'): DeliveryOrder {
  return { id: ORDER, customerId: CUSTOMER, riderId: RIDER, status } as unknown as DeliveryOrder;
}

describe('OrderCallService', () => {
  const env = { ...process.env };
  let findById: jest.Mock;
  let svc: OrderCallService;
  let now: number;

  beforeEach(() => {
    process.env.AGORA_APP_ID = 'c64f6ae3b0aa4d5d8c2275e72aa7e3a0';
    process.env.AGORA_APP_CERTIFICATE = 'f'.repeat(32);
    findById = jest.fn().mockResolvedValue(order());
    svc = new OrderCallService({ findById } as unknown as OrderRepository);
    now = 1_800_000_000_000;
    svc.now = (): number => now;
  });
  afterAll(() => {
    process.env = env;
  });

  it('starts a ringing call with a token for this call only', async () => {
    const join = await svc.start(CUSTOMER, ORDER);
    expect(join.call).toMatchObject({ status: 'RINGING', from: 'CUSTOMER', incoming: false });
    expect(join.appId).toBe(process.env.AGORA_APP_ID);
    expect(join.uid).toBe(1);
    expect(join.channel).toMatch(/^gd-33333333-[0-9a-f]{8}$/);
    expect(join.token.length).toBeGreaterThan(50);
    // The rider sees it as incoming through the polled job view.
    expect(svc.summaryFor(ORDER, 'RIDER')).toMatchObject({ status: 'RINGING', incoming: true });
  });

  it('connects when the other side answers, on the same channel', async () => {
    const caller = await svc.start(CUSTOMER, ORDER);
    now += 5_000;
    const answer = await svc.answer(RIDER, ORDER);
    expect(answer.call.status).toBe('ACTIVE');
    expect(answer.channel).toBe(caller.channel);
    expect(answer.uid).toBe(2);
    expect(svc.summaryFor(ORDER, 'CUSTOMER')?.status).toBe('ACTIVE');
  });

  it('joins the ringing call when both press Call at the same time', async () => {
    const first = await svc.start(CUSTOMER, ORDER);
    const second = await svc.start(RIDER, ORDER);
    expect(second.channel).toBe(first.channel);
    expect(second.call.status).toBe('ACTIVE');
  });

  it('reports declined, cancelled and hung-up calls', async () => {
    await svc.start(CUSTOMER, ORDER);
    expect((await svc.end(RIDER, ORDER))?.endReason).toBe('DECLINED');
    now += 60_000;
    await svc.start(CUSTOMER, ORDER);
    expect((await svc.end(CUSTOMER, ORDER))?.endReason).toBe('CANCELLED');
    now += 60_000;
    await svc.start(RIDER, ORDER);
    await svc.answer(CUSTOMER, ORDER);
    expect((await svc.end(CUSTOMER, ORDER))?.endReason).toBe('HUNG_UP');
  });

  it('stops ringing after the timeout (missed call)', async () => {
    await svc.start(RIDER, ORDER);
    now += RING_TIMEOUT_MS + 1;
    expect(svc.summaryFor(ORDER, 'CUSTOMER')).toMatchObject({
      status: 'ENDED',
      endReason: 'MISSED',
    });
    await expect(svc.answer(CUSTOMER, ORDER)).rejects.toThrow(ConflictException);
  });

  it('forgets ended calls after a short while', async () => {
    await svc.start(CUSTOMER, ORDER);
    await svc.end(CUSTOMER, ORDER);
    now += 31_000;
    expect(svc.summaryFor(ORDER, 'RIDER')).toBeNull();
  });

  it('only lets the customer and the assigned rider call', async () => {
    await expect(svc.start(STRANGER, ORDER)).rejects.toThrow(NotFoundException);
  });

  it('only allows calls while the delivery is in progress, and ends a call when it finishes', async () => {
    await svc.start(CUSTOMER, ORDER);
    expect(svc.summaryFor(ORDER, 'RIDER', 'DELIVERED')).toMatchObject({
      status: 'ENDED',
      endReason: 'DELIVERY_ENDED',
    });
    findById.mockResolvedValue(order('DELIVERED'));
    now += 60_000;
    await expect(svc.start(CUSTOMER, ORDER)).rejects.toThrow(ConflictException);
  });

  it('says calling is unavailable when Agora is not configured', async () => {
    delete process.env.AGORA_APP_CERTIFICATE;
    await expect(svc.start(CUSTOMER, ORDER)).rejects.toThrow(ServiceUnavailableException);
  });
});
