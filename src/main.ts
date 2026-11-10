import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import * as express from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
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

  // Sensible payload size limits to guard against DOS memory exhaustion attacks
  const maxBodySize = process.env.MAX_BODY_SIZE_BYTES
    ? parseInt(process.env.MAX_BODY_SIZE_BYTES, 10)
    : 102400; // 100 KB default

  app.use(express.json({ limit: maxBodySize }));
  app.use(express.urlencoded({ extended: true, limit: maxBodySize }));

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);
}

void bootstrap();
