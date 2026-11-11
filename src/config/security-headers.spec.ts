import express from 'express';
import request from 'supertest';
import { securityHeaders } from './security-headers';

describe('securityHeaders', () => {
  const app = express();
  app.use(securityHeaders());
  app.get(['/admin', '/admin/app.js', '/api/orders', '/administrator'], (_req, res) => {
    res.send('ok');
  });

  const csp = async (path: string): Promise<string> =>
    (await request(app).get(path).expect(200)).headers['content-security-policy'];

  it('widens the admin portal CSP only for Mapbox', async () => {
    for (const path of ['/admin', '/admin/app.js']) {
      const policy = await csp(path);
      expect(policy).toContain("script-src 'self' https://api.mapbox.com");
      expect(policy).toContain(
        "connect-src 'self' https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com",
      );
      expect(policy).toContain("worker-src 'self' blob:");
      // Still no inline scripts, no inline handlers, no framing by other sites.
      expect(policy).not.toContain("'unsafe-eval'");
      expect(policy).toContain("script-src-attr 'none'");
      expect(policy).toContain("frame-ancestors 'self'");
      expect(policy).toContain("object-src 'none'");
    }
  });

  it('keeps the strict default CSP everywhere else', async () => {
    for (const path of ['/api/orders', '/administrator']) {
      const policy = await csp(path);
      expect(policy).toContain("script-src 'self';");
      expect(policy).not.toContain('mapbox');
    }
  });
});
