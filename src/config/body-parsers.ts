import { NestExpressApplication } from '@nestjs/platform-express';

/**
 * JSON and form body parsing with a size limit, registered through Nest so the app's
 * `rawBody: true` option is honoured: signed webhooks (Paystack, Supabase Auth hooks) verify
 * their signature against the exact raw bytes in `req.rawBody`.
 *
 * Do not replace this with app.use(express.json()): Nest would then skip its own parser and
 * `req.rawBody` would be empty, so every signed webhook fails its signature check.
 */
export function configureBodyParsers(app: NestExpressApplication, maxBytes: number): void {
  app.useBodyParser('json', { limit: maxBytes });
  app.useBodyParser('urlencoded', { extended: true, limit: maxBytes });
}
