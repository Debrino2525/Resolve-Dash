import { Controller, Post, Req, Module, HttpStatus, RawBodyRequest } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request } from 'express';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

@Controller('test-webhooks')
class TestWebhookController {
  @Post('raw-verify')
  handleWebhook(@Req() req: RawBodyRequest<Request>): {
    receivedHex: string;
    byteLength: number;
    rawBodyAvailable: boolean;
  } {
    const rawBuffer = req.rawBody;
    if (!rawBuffer) {
      return {
        receivedHex: '',
        byteLength: 0,
        rawBodyAvailable: false,
      };
    }

    return {
      receivedHex: rawBuffer.toString('hex'),
      byteLength: rawBuffer.length,
      rawBodyAvailable: true,
    };
  }
}

@Module({
  controllers: [TestWebhookController],
})
class TestWebhookAppModule {}

describe('E2E: Raw Body Capture for Webhooks', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(TestWebhookAppModule, { rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('proves the webhook route receives the raw body byte-for-byte as sent without mutation', async () => {
    // Exact payload with specific spacing, JSON keys, and special characters (e.g. Takoradi emoji / symbols)
    const rawPayload = JSON.stringify({
      event: 'charge.success',
      data: {
        id: 1234567,
        reference: 'sub_rider_99_2026_w45',
        amount: 5000,
        currency: 'GHS',
        metadata: {
          rider_hub: 'Takoradi Market Circle',
          notes: 'Near Paa Grant roundabout — gate #3',
        },
      },
    });

    const expectedBuffer = Buffer.from(rawPayload, 'utf-8');
    const expectedHex = expectedBuffer.toString('hex');

    const response = await request(app.getHttpServer())
      .post('/test-webhooks/raw-verify')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'dummy-signature-header')
      .send(rawPayload)
      .expect(HttpStatus.CREATED);

    expect(response.body).toEqual({
      rawBodyAvailable: true,
      byteLength: expectedBuffer.length,
      receivedHex: expectedHex,
    });

    // Byte-for-byte comparison of decoded received hex against original expected buffer
    const reconstructedBuffer = Buffer.from(response.body.receivedHex, 'hex');
    expect(Buffer.compare(reconstructedBuffer, expectedBuffer)).toBe(0);
  });
});
