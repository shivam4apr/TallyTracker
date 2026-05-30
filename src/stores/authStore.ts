/**
 * TallyTracker — Auth Store
 *
 * Zustand store for authentication state:
 * - Local user profile
 * - PIN management
 * - Biometric preference
 * - Lock/unlock state
 */

import { create } from 'zustand';
import { safeStorage } from '@/utils/safeStorage';
import { APP_CONFIG } from '../utils/constants';

const STORAGE_KEY_USER = '@tallytracker/caUserId';
const STORAGE_KEY_LOCK = '@tallytracker/isLocked';
const STORAGE_KEY_LAST_ACTIVE = '@tallytracker/lastActiveTime';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  /** Current auth status */
  status: AuthStatus;

  /** Current CA user ID */
  caUserId: string | null;

  /** Whether the app is locked (PIN/biometric required) */
  isLocked: boolean;

  /** Number of consecutive failed PIN attempts */
  failedAttempts: number;

  /** Whether the user has active Pro premium features */
  isPremium: boolean;

  /** Action to purchase/activate premium locally */
  upgradeToPremium: () => Promise<void>;

  /** Action to restore premium purchase state */
  restorePremium: () => Promise<boolean>;

  /** Set authenticated with user ID */
  signIn: (caUserId: string) => void;

  /** Clear auth state */
  signOut: () => void;

  /** Lock the app */
  lock: () => void;

  /** Unlock the app */
  unlock: () => void;

  /** Record a failed PIN attempt */
  recordFailedAttempt: () => void;

  /** Reset failed attempts (after successful unlock) */
  resetFailedAttempts: () => void;

  /** Check if locked out (too many failed attempts) */
  isLockedOut: () => boolean;

  /** Load persisted state */
  loadPersistedState: () => Promise<void>;

  /** Check if should auto-lock (idle timeout) */
  checkIdleTimeout: () => Promise<boolean>;

  /** Record current time as last active */
  recordActivity: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  caUserId: null,
  isLocked: false,
  failedAttempts: 0,
  isPremium: false,

  upgradeToPremium: async () => {
    set({ isPremium: true });
    await safeStorage.setItem('@tallytracker/isPremium', 'true').catch(() => {});
  },

  restorePremium: async () => {
    try {
      const savedPremium = await safeStorage.getItem('@tallytracker/isPremium');
      if (savedPremium === 'true') {
        set({ isPremium: true });
        return true;
      }
    } catch {}
    return false;
  },

  signIn: (caUserId: string) => {
    set({ status: 'authenticated', caUserId, isLocked: false });
    safeStorage.setItem(STORAGE_KEY_USER, caUserId).catch(() => {});
  },

  signOut: () => {
    set({ status: 'unauthenticated', caUserId: null, isLocked: false, failedAttempts: 0, isPremium: false });
    Promise.all([
      safeStorage.removeItem(STORAGE_KEY_USER),
      safeStorage.removeItem(STORAGE_KEY_LOCK),
      safeStorage.removeItem('@tallytracker/isPremium'),
    ]).catch(() => {});
  },

  lock: () => {
    set({ isLocked: true });
    safeStorage.setItem(STORAGE_KEY_LOCK, 'true').catch(() => {});
  },

  unlock: () => {
    set({ isLocked: false, failedAttempts: 0 });
    safeStorage.setItem(STORAGE_KEY_LOCK, 'false').catch(() => {});
    get().recordActivity();
  },

  recordFailedAttempt: () => {
    set((state) => ({ failedAttempts: state.failedAttempts + 1 }));
  },

  resetFailedAttempts: () => {
    set({ failedAttempts: 0 });
  },

  isLockedOut: () => {
    return get().failedAttempts >= APP_CONFIG.MAX_PIN_ATTEMPTS;
  },

  loadPersistedState: async () => {
    try {
      const [savedUserId, savedLock, savedPremium] = await Promise.all([
        safeStorage.getItem(STORAGE_KEY_USER),
        safeStorage.getItem(STORAGE_KEY_LOCK),
        safeStorage.getItem('@tallytracker/isPremium'),
      ]);

      if (savedUserId) {
        set({
          status: 'authenticated',
          caUserId: savedUserId,
          isLocked: true, // Enforce lock on startup/launch
          isPremium: savedPremium === 'true',
        });
        await safeStorage.setItem(STORAGE_KEY_LOCK, 'true').catch(() => {});
      } else {
        set({ status: 'unauthenticated' });
      }
    } catch {
      set({ status: 'unauthenticated' });
    }
  },

  checkIdleTimeout: async () => {
    try {
      const lastActive = await safeStorage.getItem(STORAGE_KEY_LAST_ACTIVE);
      if (lastActive) {
        const elapsed = Date.now() - parseInt(lastActive, 10);
        if (elapsed > APP_CONFIG.IDLE_TIMEOUT_MS) {
          get().lock();
          return true;
        }
      }
    } catch {
      // Ignore
    }
    return false;
  },

  recordActivity: () => {
    safeStorage.setItem(STORAGE_KEY_LAST_ACTIVE, String(Date.now())).catch(() => {});
  },
}));
