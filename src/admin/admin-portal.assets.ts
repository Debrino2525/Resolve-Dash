import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The admin portal is plain HTML/CSS/JS in /admin-web (no build step). This resolves to the
 * repo's admin-web folder from both src/admin (ts-node) and dist/admin (compiled).
 */
const PORTAL_DIR = path.resolve(__dirname, '..', '..', 'admin-web');
const ALLOWED = new Set(['index.html', 'app.js', 'app.css']);
const cache = new Map<string, string>();

export function readPortalAsset(name: string): string {
  if (!ALLOWED.has(name)) throw new NotFoundException();
  // Cache in production; re-read in development so edits show on refresh.
  const cached = process.env.NODE_ENV === 'production' ? cache.get(name) : undefined;
  if (cached) return cached;
  const file = path.join(PORTAL_DIR, name);
  if (!fs.existsSync(file)) throw new NotFoundException(`Admin portal asset missing: ${name}`);
  const content = fs.readFileSync(file, 'utf8');
  cache.set(name, content);
  return content;
}
