import { z } from 'zod';

/** "024 123 4567", "0241234567", "+233241234567" → "+233241234567" (Ghana mobiles only). */
export function normaliseGhanaPhone(input: string): string | null {
  let d = input.replace(/[\s\-()]/g, '');
  if (d.startsWith('+233')) d = d.slice(4);
  else if (d.startsWith('233') && d.length === 12) d = d.slice(3);
  d = d.replace(/^0+/, '');
  return /^[25]\d{8}$/.test(d) ? `+233${d}` : null;
}

const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normaliseGhanaPhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid Ghana mobile number' });
      return z.NEVER;
    }
    return n;
  });

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const pointSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

export const stopSchema = pointSchema.extend({
  address: z.string().trim().min(2).max(255),
  landmark: optionalText(255),
  gpsCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}-?\d{3,4}-?\d{3,4}$/, 'GhanaPost GPS codes look like GA-123-4567')
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  contactName: z.string().trim().min(2).max(100),
  contactPhone: phone,
});

/** Drop-offs before the final one, in visiting order (up to 3, so 4 drop-offs in all). */
const MAX_EXTRA = 3;

export const quoteSchema = z.object({
  pickup: pointSchema,
  dropoff: pointSchema,
  stops: z.array(pointSchema).max(MAX_EXTRA, 'Up to 4 drop-offs per delivery').default([]),
});

export const createOrderSchema = z.object({
  pickup: stopSchema,
  dropoff: stopSchema,
  stops: z.array(stopSchema).max(MAX_EXTRA, 'Up to 4 drop-offs per delivery').default([]),
  packageType: z.enum(['DOCUMENT', 'SMALL_PARCEL', 'FOOD', 'LARGE_ITEM']),
  fragile: z.boolean().default(false),
  notes: optionalText(500),
  quoteToken: z.string().min(10).max(2000),
  packagePhotoPath: z.string().max(300).optional().nullable(),
});

export const cancelSchema = z.object({ reason: z.string().trim().max(255).optional() });

export const rateSchema = z.object({
  stars: z.number().int().min(1).max(5),
  tags: z.array(z.string().max(30)).max(10).default([]),
  comment: z.string().trim().max(500).optional(),
});

export const presenceSchema = z.object({
  online: z.boolean(),
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
  heading: z.number().gte(-1).lte(360).optional().nullable(),
  accuracy: z.number().gte(0).lte(100_000).optional().nullable(),
});

export const stopFailedSchema = z.object({
  reason: z.string().trim().min(3, 'Say briefly why it could not be delivered').max(255),
});

export const pinSchema = z.object({
  pin: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'The PIN is 4 digits'),
});

/** First validation issue as a readable message. */
export function firstIssue(err: z.ZodError): string {
  const i = err.issues[0];
  if (!i) return 'Invalid request';
  const where = i.path.join('.');
  return where ? `${where}: ${i.message}` : i.message;
}
