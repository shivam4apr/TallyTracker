import * as SecureStore from 'expo-secure-store';

// Fallback in-memory map if SecureStore fails or is unavailable
const memoryStore = new Map<string, string>();

/**
 * Checks if SecureStore is available on the current platform.
 */
const isSecureStoreAvailable = (): boolean => {
  try {
    return SecureStore !== null && typeof SecureStore.isAvailableAsync === 'function';
  } catch {
    return false;
  }
};

/**
 * A highly resilient storage wrapper that uses expo-secure-store as its
 * primary persistent database. This is pre-compiled in Expo Go, ensuring
 * true native persistence across app reloads and restarts.
 */
/**
 * Sanitizes keys to contain only alphanumeric characters, '.', '-', and '_'
 * to satisfy expo-secure-store strict requirements.
 */
const sanitizeKey = (key: string): string => {
  return key.replace(/[^a-zA-Z0-9.\-_]/g, '_');
};

/**
 * A highly resilient storage wrapper that uses expo-secure-store as its
 * primary persistent database. This is pre-compiled in Expo Go, ensuring
 * true native persistence across app reloads and restarts.
 */
export const safeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const safeKey = sanitizeKey(key);
    try {
      if (isSecureStoreAvailable()) {
        const isAvail = await SecureStore.isAvailableAsync();
        if (isAvail) {
          return await SecureStore.getItemAsync(safeKey);
        }
      }
    } catch (e) {
      console.log(`[SafeStorage] SecureStore.getItemAsync failed for key "${key}" (sanitized: "${safeKey}"):`, e);
    }

    // Web LocalStorage / In-memory fallback
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {}

    return memoryStore.get(key) || null;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    const safeKey = sanitizeKey(key);
    try {
      if (isSecureStoreAvailable()) {
        const isAvail = await SecureStore.isAvailableAsync();
        if (isAvail) {
          await SecureStore.setItemAsync(safeKey, value);
          return;
        }
      }
    } catch (e) {
      console.log(`[SafeStorage] SecureStore.setItemAsync failed for key "${key}" (sanitized: "${safeKey}"):`, e);
    }

    // Web LocalStorage / In-memory fallback
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {}

    memoryStore.set(key, value);
  },

  removeItem: async (key: string): Promise<void> => {
    const safeKey = sanitizeKey(key);
    try {
      if (isSecureStoreAvailable()) {
        const isAvail = await SecureStore.isAvailableAsync();
        if (isAvail) {
          await SecureStore.deleteItemAsync(safeKey);
          return;
        }
      }
    } catch (e) {
      console.log(`[SafeStorage] SecureStore.deleteItemAsync failed for key "${key}" (sanitized: "${safeKey}"):`, e);
    }

    // Web LocalStorage / In-memory fallback
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {}

    memoryStore.delete(key);
  },
};
