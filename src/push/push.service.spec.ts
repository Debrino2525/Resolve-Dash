import { DatabaseService } from '../database/database.service';
import { DeliveryNotifier } from '../orders/delivery-notifier';
import { OrderRepository } from '../orders/order.repository';
import { PushMessage, PushService } from './push.service';

type Q = { text: string; values: unknown[] };

function fakeDb(tokens: string[]): { db: DatabaseService; queries: Q[] } {
  const queries: Q[] = [];
  const db = {
    query: jest.fn(async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      if (text.startsWith('SELECT token')) return { rows: tokens.map((token) => ({ token })) };
      return { rows: [] };
    }),
  } as unknown as DatabaseService;
  return { db, queries };
}

function service(tokens: string[], tickets: unknown[] = []) {
  const { db, queries } = fakeDb(tokens);
  const push = new PushService(db);
  push.enabled = true;
  const sent: unknown[][] = [];
  push.fetchImpl = jest.fn(async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)) as unknown[]);
    return { ok: true, json: async () => ({ data: tickets }) } as Response;
  });
  return { push, queries, sent };
}

const MSG: PushMessage = {
  title: 'Hi',
  body: 'There',
  channel: 'delivery',
  data: { orderId: 'o1' },
};

describe('PushService', () => {
  it('registers a token for one app, moving it to whoever signed in last', async () => {
    const { push, queries } = service([]);
    await push.register('u1', 'rider', 'android', 'ExponentPushToken[abc]');
    expect(queries[0].text).toContain('ON CONFLICT (token) DO UPDATE');
    expect(queries[0].values).toEqual(['ExponentPushToken[abc]', 'u1', 'rider', 'android']);
  });

  it('sends one message per device with the channel, data and high priority', async () => {
    const { push, queries, sent } = service(['ExponentPushToken[a]', 'ExponentPushToken[b]']);
    await push.send(['u1'], 'customer', { ...MSG, ttl: 25 });
    expect(queries[0].values).toEqual([['u1'], 'customer']);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[a]',
        channelId: 'delivery',
        priority: 'high',
        ttl: 25,
        data: { orderId: 'o1' },
      }),
      expect.objectContaining({ to: 'ExponentPushToken[b]' }),
    ]);
  });

  it('deletes tokens Expo says are no longer registered', async () => {
    const { push, queries } = service(
      ['ExponentPushToken[a]', 'ExponentPushToken[b]'],
      [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }],
    );
    await push.send(['u1'], 'rider', MSG);
    const del = queries.find((q) => q.text.startsWith('DELETE'));
    expect(del?.values).toEqual([['ExponentPushToken[b]']]);
  });

  it('sends nothing when nobody has a phone registered, and never throws', async () => {
    const { push, sent } = service([]);
    await push.send(['u1'], 'rider', MSG);
    expect(sent).toHaveLength(0);
    push.fetchImpl = jest.fn(async () => {
      throw new Error('network down');
    });
    const { db } = fakeDb(['ExponentPushToken[a]']);
    const broken = new PushService(db);
    broken.enabled = true;
    broken.fetchImpl = push.fetchImpl;
    await expect(broken.send(['u1'], 'rider', MSG)).resolves.toBeUndefined();
  });

  it('is off unless enabled (tests, PUSH_DISABLED)', async () => {
    const { push, sent } = service(['ExponentPushToken[a]']);
    push.enabled = false;
    await push.send(['u1'], 'rider', MSG);
    expect(sent).toHaveLength(0);
  });
});

describe('DeliveryNotifier', () => {
  const pushSpy = () => {
    const calls: { userId: string; app: string; msg: PushMessage }[] = [];
    const push = {
      notify: (userId: string, app: string, msg: PushMessage) => calls.push({ userId, app, msg }),
    } as unknown as PushService;
    return { push, calls };
  };

  it('rings the rider for an offer, expiring with it', () => {
    const { push, calls } = pushSpy();
    const n = new DeliveryNotifier({} as OrderRepository, push);
    n.offer(
      'r1',
      { orderId: 'o1', pickupAddress: 'Market Circle', toPickupMeters: 1234, farePesewas: 2500 },
      25,
    );
    expect(calls[0]).toMatchObject({
      userId: 'r1',
      app: 'rider',
      msg: {
        title: 'New delivery · GH₵25.00',
        channel: 'offers',
        ttl: 25,
        data: { type: 'offer', orderId: 'o1' },
      },
    });
    expect(calls[0].msg.body).toContain('1.2 km away');
  });

  it('words the quiet-rider alert by whether they are on a job', () => {
    const { push, calls } = pushSpy();
    new DeliveryNotifier({} as OrderRepository, push).stale(['r1', 'r2'], new Set(['r2']));
    expect(calls[0].msg.title).toBe('You’re not getting orders');
    expect(calls[1].msg.title).toBe('Your customer can’t see you moving');
  });

  it('tells the customer about drop-offs, with the reason when one failed', async () => {
    const { push, calls } = pushSpy();
    const order = {
      id: 'o1',
      code: 'GD-1',
      customerId: 'c1',
      extraStops: [{ contactName: 'Ama', status: 'FAILED', failReason: 'Nobody home' }],
    };
    const repo = { findById: jest.fn(async () => order) } as unknown as OrderRepository;
    new DeliveryNotifier(repo, push).stopDone('o1', 0);
    await new Promise((r) => setImmediate(r));
    expect(calls[0]).toMatchObject({
      userId: 'c1',
      app: 'customer',
      msg: { title: 'Drop-off 1 not delivered', data: { type: 'order', orderId: 'o1' } },
    });
    expect(calls[0].msg.body).toContain('Nobody home');
  });

  it('sends calls and chat to the other person on the delivery', () => {
    const { push, calls } = pushSpy();
    const n = new DeliveryNotifier({} as OrderRepository, push);
    const order = { id: 'o1', code: 'GD-1', customerId: 'c1', riderId: 'r1' } as never;
    n.incomingCall(order, 'RIDER');
    n.chatMessage(order, 'CUSTOMER', 'At the gate');
    expect(calls[0]).toMatchObject({ userId: 'c1', app: 'customer', msg: { channel: 'calls' } });
    expect(calls[1]).toMatchObject({ userId: 'r1', app: 'rider', msg: { body: 'At the gate' } });
  });
});
