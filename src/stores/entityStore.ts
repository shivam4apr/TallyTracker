/**
 * TallyTracker — Entity Store
 *
 * Zustand store for managing the active entity context.
 * The CA can manage N client entities and switch between them.
 */

import { create } from 'zustand';
import { safeStorage } from '@/utils/safeStorage';

const STORAGE_KEY = '@tallytracker/activeEntityId';

interface EntityState {
  /** Currently active entity ID */
  activeEntityId: string | null;

  /** Whether the store has loaded from storage */
  isLoaded: boolean;

  /** Set the active entity */
  setActiveEntity: (entityId: string) => void;

  /** Clear the active entity (e.g., when entity is deleted) */
  clearActiveEntity: () => void;

  /** Load persisted state from AsyncStorage */
  loadPersistedState: () => Promise<void>;
}

export const useEntityStore = create<EntityState>((set) => ({
  activeEntityId: null,
  isLoaded: false,

  setActiveEntity: (entityId: string) => {
    set({ activeEntityId: entityId });
    // Persist asynchronously
    safeStorage.setItem(STORAGE_KEY, entityId).catch(() => {});
  },

  clearActiveEntity: () => {
    set({ activeEntityId: null });
    safeStorage.removeItem(STORAGE_KEY).catch(() => {});
  },

  loadPersistedState: async () => {
    try {
      const savedId = await safeStorage.getItem(STORAGE_KEY);
      set({ activeEntityId: savedId, isLoaded: true });
    } catch {
      set({ isLoaded: true });
    }
  },
}));
