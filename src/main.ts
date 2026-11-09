import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody: true preserves raw payload Buffer on RawBodyRequest<Request>
  // essential for HMAC SHA-512 webhook signature verification.
  const app = await NestFactory.create(AppModule, { rawBody: true });

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
