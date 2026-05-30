/**
 * TallyTracker — WatermelonDB Native Adapter
 *
 * Configures SQLiteAdapter for iOS/Android native platforms.
 * Falls back to LokiJSAdapter if SQLite is not available (e.g. running in Expo Go).
 */

import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { schema } from './schema';
import { migrations } from './migrations';

export function createAdapter() {
  try {
    return new SQLiteAdapter({
      schema,
      migrations,
      dbName: 'tallytracker',
      jsi: false, // Safer default on native, avoids JSI thread crashes in dev builds
      onSetUpError: (error) => {
        console.error('WatermelonDB SQLite setup error:', error);
      },
    });
  } catch (error) {
    console.log('WatermelonDB SQLiteAdapter failed to instantiate. Falling back to LokiJSAdapter.');
    return new LokiJSAdapter({
      schema,
      migrations,
      useIncrementalIndexedDB: true,
      useWebWorker: false,
      onSetUpError: (error) => {
        console.error('WatermelonDB LokiJS setup error:', error);
      },
    });
  }
}
