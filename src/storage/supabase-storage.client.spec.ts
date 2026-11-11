import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseStorageClient } from './supabase-storage.client';

describe('SupabaseStorageClient', () => {
  let client: SupabaseStorageClient;
  let fetchFn: jest.Mock;

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://proj.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    fetchFn = jest.fn();
    client = new SupabaseStorageClient();
    client.fetchImpl = fetchFn as unknown as typeof fetch;
  });

  it('uploads as the caller (their JWT + anon apikey), never overwriting', async () => {
    fetchFn.mockResolvedValue({ ok: true });
    await client.upload(
      'rider-documents',
      'u1/GHANA_CARD/1.jpg',
      Buffer.from('x'),
      'image/jpeg',
      'user-jwt',
    );

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      'https://proj.supabase.co/storage/v1/object/rider-documents/u1/GHANA_CARD/1.jpg',
    );
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer user-jwt',
      apikey: 'anon',
      'Content-Type': 'image/jpeg',
      'x-upsert': 'false',
    });
  });

  it('URL-encodes path segments', async () => {
    fetchFn.mockResolvedValue({ ok: true });
    await client.upload('b', 'u1/a b#c.jpg', Buffer.from('x'), 'image/jpeg', 't');
    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://proj.supabase.co/storage/v1/object/b/u1/a%20b%23c.jpg',
    );
  });

  it('maps a storage policy denial to 503 for the caller', async () => {
    fetchFn.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'new row violates policy',
    });
    await expect(
      client.upload('b', 'someone-else/1.jpg', Buffer.from('x'), 'image/jpeg', 't'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('downloads through the authenticated endpoint', async () => {
    fetchFn.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: { get: () => 'image/png' },
    });
    const file = await client.download('rider-documents', 'u1/X/1.png', 'admin-jwt');

    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://proj.supabase.co/storage/v1/object/authenticated/rider-documents/u1/X/1.png',
    );
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer admin-jwt');
    expect(file).toEqual({ body: Buffer.from([1, 2, 3]), contentType: 'image/png' });
  });

  it('reports network failures as 503', async () => {
    fetchFn.mockRejectedValue(new Error('ECONNRESET'));
    await expect(client.download('b', 'p', 't')).rejects.toThrow(ServiceUnavailableException);
  });
});
