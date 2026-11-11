import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { getSupabaseUrl } from '../auth/supabase-config';

export const RIDER_DOCUMENTS_BUCKET = 'rider-documents';

export interface StoredFile {
  readonly body: Buffer;
  readonly contentType: string;
}

/**
 * Minimal Supabase Storage REST client that acts AS THE CALLER: every request carries the
 * caller's own Supabase JWT, so the bucket's storage policies decide access (a rider can only
 * write/read their own folder; an admin can read all). No service-role key is involved.
 */
@Injectable()
export class SupabaseStorageClient {
  private readonly logger = new Logger(SupabaseStorageClient.name);
  /** Replaceable in tests. */
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init);

  async upload(
    bucket: string,
    path: string,
    body: Buffer,
    contentType: string,
    userAccessToken: string,
  ): Promise<void> {
    const res = await this.request(
      `${getSupabaseUrl()}/storage/v1/object/${bucket}/${encodePath(path)}`,
      {
        method: 'POST',
        headers: {
          ...this.authHeaders(userAccessToken),
          'Content-Type': contentType,
          'x-upsert': 'false',
          'cache-control': 'private, max-age=0',
        },
        body: new Uint8Array(body),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.warn(`Storage upload failed (${res.status}) for ${bucket}/${path}: ${detail}`);
      throw new ServiceUnavailableException('Could not store the file. Please try again.');
    }
  }

  async download(bucket: string, path: string, userAccessToken: string): Promise<StoredFile> {
    const res = await this.request(
      `${getSupabaseUrl()}/storage/v1/object/authenticated/${bucket}/${encodePath(path)}`,
      { method: 'GET', headers: this.authHeaders(userAccessToken) },
    );
    if (!res.ok) {
      this.logger.warn(`Storage download failed (${res.status}) for ${bucket}/${path}`);
      throw new ServiceUnavailableException('Could not load the file.');
    }
    return {
      body: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  private authHeaders(userAccessToken: string): Record<string, string> {
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!anonKey) {
      throw new ServiceUnavailableException('SUPABASE_ANON_KEY is not configured on the server');
    }
    return { Authorization: `Bearer ${userAccessToken}`, apikey: anonKey };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, init);
    } catch (err) {
      this.logger.error(
        `Storage request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException('File storage is unreachable. Please try again.');
    }
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
