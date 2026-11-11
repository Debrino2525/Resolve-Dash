import type { NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';

/**
 * Extra CSP sources the admin portal's Live map needs (Mapbox GL JS from its CDN):
 * the script and stylesheet on api.mapbox.com, map styles, tiles, glyphs and sprites over
 * fetch, the map's web worker and canvas images as blob: URLs, and Mapbox telemetry.
 * See https://docs.mapbox.com/mapbox-gl-js/guides/browsers-and-testing/#csp-directives
 */
export const ADMIN_MAP_CSP = {
  scriptSrc: ["'self'", 'https://api.mapbox.com'],
  styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:', 'https://api.mapbox.com'],
  connectSrc: [
    "'self'",
    'https://api.mapbox.com',
    'https://*.tiles.mapbox.com',
    'https://events.mapbox.com',
  ],
  workerSrc: ["'self'", 'blob:'],
  childSrc: ['blob:'],
};

const isAdminPath = (path: string): boolean => path === '/admin' || path.startsWith('/admin/');

/**
 * Helmet everywhere with its strict defaults; the admin portal (/admin...) gets the same
 * policy widened only by the Mapbox sources above, so the public API keeps the strict CSP.
 */
export function securityHeaders(): RequestHandler {
  const strict = helmet();
  const admin = helmet({ contentSecurityPolicy: { directives: ADMIN_MAP_CSP } });
  return (req: Request, res: Response, next: NextFunction) =>
    (isAdminPath(req.path) ? admin : strict)(req, res, next);
}
