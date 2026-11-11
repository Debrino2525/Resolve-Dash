import * as dotenv from 'dotenv';
dotenv.config();

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import * as express from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { productionEnvProblems } from './config/production-env';
import { cloudflareAccessFromEnv } from './admin/cloudflare-access';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // Production must be fully configured: refuse to start rather than fail on the first order.
  const problems = productionEnvProblems();
  if (problems.length > 0) {
    logger.error(
      `Refusing to start: production configuration is incomplete:\n- ${problems.join('\n- ')}`,
    );
    process.exit(1);
  }

  // rawBody: true preserves raw payload Buffer on RawBodyRequest<Request>
  // essential for HMAC SHA-512 webhook signature verification.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Behind a reverse proxy / load balancer, trust X-Forwarded-For so req.ip (used by the rate
  // limiter) is the real client. Value: a hop count (e.g. "1") or an Express trust-proxy string.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy) {
    app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }

  // Security headers via Helmet
  app.use(helmet());

  // The admin portal can also be served on its own hostname (e.g. ghanadash-admin.<domain>),
  // pointing at this same server. On that host, "/" opens the portal, and the public API is
  // not offered there, so the admin hostname can sit behind extra protection (Cloudflare Access).
  const adminHost = process.env.ADMIN_HOST?.trim().toLowerCase();
  if (adminHost) {
    // Defence in depth: when configured, every admin-host request must carry a valid Cloudflare
    // Access pass for our Access app, so the portal stays locked even if Access or the proxied
    // DNS record is removed by mistake.
    const access = cloudflareAccessFromEnv();
    if (!access) {
      logger.warn(
        'ADMIN_HOST is set without CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD: the server does not check Cloudflare Access.',
      );
    }
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      const isAdminPath = req.path === '/admin' || req.path.startsWith('/admin/');
      if (req.hostname.toLowerCase() !== adminHost) {
        // Portal only on its own host, so protection on that host can't be bypassed via the API.
        if (isAdminPath) return res.status(404).json({ statusCode: 404, message: 'Not found' });
        return next();
      }
      if (req.path === '/health') return next();
      if (req.path !== '/' && !isAdminPath) {
        return res.status(404).json({ statusCode: 404, message: 'Not found' });
      }
      const proceed = (): void => {
        if (req.path === '/') return res.redirect(302, '/admin');
        next();
      };
      if (!access) return proceed();
      access
        .verify(req.header('cf-access-jwt-assertion'))
        .then((identity) => {
          if (!identity) {
            res.status(403).json({ statusCode: 403, message: 'Admin access requires sign-in.' });
            return;
          }
          proceed();
        })
        .catch(next);
    });
  }

  // Sensible payload size limits to guard against DOS memory exhaustion attacks
  const maxBodySize = process.env.MAX_BODY_SIZE_BYTES
    ? parseInt(process.env.MAX_BODY_SIZE_BYTES, 10)
    : 102400; // 100 KB default

  app.use(express.json({ limit: maxBodySize }));
  app.use(express.urlencoded({ extended: true, limit: maxBodySize }));

  // Let the host stop the server cleanly on deploys: close the DB pool and the dispatch timer.
  app.enableShutdownHooks();

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`GhanaDash API listening on port ${port} (${process.env.NODE_ENV ?? 'development'})`);
}

void bootstrap();
