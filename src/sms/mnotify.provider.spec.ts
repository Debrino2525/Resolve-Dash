import { createSmsProvider, ConsoleSmsProvider } from './sms.module';
import { MnotifyProvider, toGhanaLocal } from './mnotify.provider';

describe('MnotifyProvider', () => {
  const ok = {
    status: 'success',
    code: '2000',
    message: 'messages sent successfully',
    summary: { total_sent: 1, total_rejected: 0 },
  };

  function provider(response: unknown, httpOk = true): { p: MnotifyProvider; fetchFn: jest.Mock } {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: httpOk,
      status: httpOk ? 200 : 422,
      json: async () => response,
    });
    return {
      p: new MnotifyProvider({
        apiKey: 'k3y',
        senderId: 'GhanaDash',
        fetchFn: fetchFn as unknown as typeof fetch,
      }),
      fetchFn,
    };
  }

  it('posts a quick SMS in mNotify’s documented shape', async () => {
    const { p, fetchFn } = provider(ok);
    await p.send('+233241234567', 'Your code is 123456', { otp: true });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.mnotify.com/api/sms/quick?key=k3y');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      recipient: ['0241234567'],
      sender: 'GhanaDash',
      message: 'Your code is 123456',
      is_schedule: false,
      schedule_date: '',
      sms_type: 'otp',
    });
  });

  it('omits sms_type for non-OTP messages (mNotify warns against sending it)', async () => {
    const { p, fetchFn } = provider(ok);
    await p.send('+233241234567', 'hello');
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).not.toHaveProperty('sms_type');
  });

  it.each([
    ['an error code', { status: 'error', code: '1005', message: 'Invalid sender ID' }, true],
    ['zero messages sent', { ...ok, summary: { total_sent: 0, total_rejected: 1 } }, true],
    ['an HTTP error', { message: 'Unprocessable' }, false],
  ])('throws on %s', async (_label, body, httpOk) => {
    const { p } = provider(body, httpOk);
    await expect(p.send('+233241234567', 'x')).rejects.toThrow('SMS was not sent');
  });

  it('wraps network errors without leaking the key-bearing URL', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const p = new MnotifyProvider({
      apiKey: 'secret-key',
      senderId: 'GhanaDash',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(p.send('+233241234567', 'x')).rejects.toThrow('SMS provider unreachable');
  });

  it('rejects sender IDs longer than 11 characters', () => {
    expect(() => new MnotifyProvider({ apiKey: 'k', senderId: 'TwelveChars!' })).toThrow();
  });

  it('converts E.164 Ghana numbers to local format', () => {
    expect(toGhanaLocal('+233241234567')).toBe('0241234567');
    expect(() => toGhanaLocal('+447700900123')).toThrow();
  });
});

describe('createSmsProvider', () => {
  it('uses mNotify when the key and sender ID are configured', () => {
    expect(
      createSmsProvider({ MNOTIFY_API_KEY: 'k', MNOTIFY_SENDER_ID: 'GhanaDash' }),
    ).toBeInstanceOf(MnotifyProvider);
  });

  it('falls back to the console provider in development', () => {
    expect(createSmsProvider({ NODE_ENV: 'development' })).toBeInstanceOf(ConsoleSmsProvider);
  });

  it('refuses to run without mNotify in production', () => {
    expect(() => createSmsProvider({ NODE_ENV: 'production' })).toThrow(/MNOTIFY_API_KEY/);
  });
});
