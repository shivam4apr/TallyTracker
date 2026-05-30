/**
 * TallyTracker — Database Synchronization Service
 *
 * Implements client-side WatermelonDB sync protocol.
 * Integrates bidirectional pulls and pushes, conflict resolution,
 * and persistent storage of sync timestamps.
 */

import { synchronize } from '@nozbe/watermelondb/sync';
import database from '../db';
import { safeStorage } from '../utils/safeStorage';

const LAST_SYNCED_KEY = '@tallytracker/last_synced_at';
const SYNC_ENDPOINT_KEY = '@tallytracker/sync_endpoint';
const DEFAULT_SYNC_ENDPOINT = 'https://api.tallytracker.com/sync';

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
}

/**
 * Get the currently configured sync endpoint URL
 */
export async function getSyncEndpoint(): Promise<string> {
  try {
    const saved = await safeStorage.getItem(SYNC_ENDPOINT_KEY);
    return saved || DEFAULT_SYNC_ENDPOINT;
  } catch {
    return DEFAULT_SYNC_ENDPOINT;
  }
}

/**
 * Set a custom sync endpoint URL (useful for testing or dedicated enterprise domains)
 */
export async function setSyncEndpoint(url: string): Promise<void> {
  await safeStorage.setItem(SYNC_ENDPOINT_KEY, url);
}

/**
 * Get the timestamp of the last successful synchronization
 */
export async function getLastSyncedAt(): Promise<number | null> {
  try {
    const saved = await safeStorage.getItem(LAST_SYNCED_KEY);
    return saved ? parseInt(saved, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Performs full bidirectional WatermelonDB SQLite synchronization.
 */
export async function syncDatabase(
  onProgress?: (status: string) => void
): Promise<void> {
  const endpoint = await getSyncEndpoint();

  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt, schemaVersion }) => {
      if (onProgress) onProgress('Fetching updates...');
      
      const pullUrl = `${endpoint}?since=${lastPulledAt || 0}&schema_version=${schemaVersion}`;
      const response = await fetch(pullUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Sync pull failed with status ${response.status}`);
      }

      const { changes, timestamp } = await response.json();
      return { changes, timestamp };
    },
    pushChanges: async ({ changes, lastPulledAt }) => {
      if (onProgress) onProgress('Uploading modifications...');
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ changes, lastPulledAt }),
      });

      if (!response.ok) {
        throw new Error(`Sync push failed with status ${response.status}`);
      }
    },
    sendCreatedAsUpdated: true,
  });

  // Record successful sync timestamp
  const now = Date.now();
  await safeStorage.setItem(LAST_SYNCED_KEY, String(now)).catch(() => {});
  if (onProgress) onProgress('Completed');
}
