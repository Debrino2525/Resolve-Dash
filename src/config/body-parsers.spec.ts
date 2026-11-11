import { Controller, HttpCode, Module, Post, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureBodyParsers } from './body-parsers';

@Controller()
class EchoController {
  @Post('echo')
  @HttpCode(200)
  echo(@Req() req: { rawBody?: Buffer; body: unknown }): { raw: string | null; body: unknown } {
    return { raw: req.rawBody ? req.rawBody.toString('utf8') : null, body: req.body };
  }
}

@Module({ controllers: [EchoController] })
class EchoModule {}

describe('configureBodyParsers', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(EchoModule, {
      rawBody: true,
      logger: false,
    });
    configureBodyParsers(app, 1024);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('keeps the exact raw bytes for webhook signatures and still parses JSON', async () => {
    const payload = '{"b":1,  "a":"x"}'; // spacing must survive byte-for-byte
    const res = await request(app.getHttpServer())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.raw).toBe(payload);
    expect(res.body.body).toEqual({ b: 1, a: 'x' });
  });

  it('enforces the size limit', async () => {
    const res = await request(app.getHttpServer())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ big: 'x'.repeat(2000) }));
    expect(res.status).toBe(413);
  });
});
