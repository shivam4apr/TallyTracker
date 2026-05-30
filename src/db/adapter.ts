/**
 * TallyTracker — WatermelonDB Platform Adapter Fallback
 *
 * This file serves as the TypeScript compile-time target for `./adapter`.
 * At bundle time, Metro resolves `./adapter` to `adapter.web.ts` or `adapter.native.ts`.
 */

import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

export function createAdapter(): LokiJSAdapter | SQLiteAdapter {
  throw new Error('Platform-specific adapter not resolved by bundler');
}
