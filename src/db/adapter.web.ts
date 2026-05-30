/**
 * TallyTracker — WatermelonDB Web Adapter
 *
 * Configures the pure-JS LokiJSAdapter to run in browser IndexedDB.
 * This avoids importing SQLite packages on Web which breaks bundling.
 */

import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { schema } from './schema';

export function createAdapter() {
  return new LokiJSAdapter({
    schema,
    useIncrementalIndexedDB: true,
    useWebWorker: false,
    onSetUpError: (error) => {
      console.error('WatermelonDB Web setup error:', error);
    },
  });
}
