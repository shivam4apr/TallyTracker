/**
 * TallyTracker — Root Layout
 *
 * Configures global providers:
 * 1. WatermelonDB DatabaseProvider
 * 2. ThemeProvider (Light/Dark/System + Custom Themes)
 * 3. React Query QueryClientProvider
 *
 * Implements navigation guards for onboarding and security locks.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View, LogBox, AppState } from 'react-native';

LogBox.ignoreLogs([
  'WatermelonDB SQLiteAdapter failed to instantiate. Falling back to LokiJSAdapter.',
]);

import { Slot, Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

import '@/i18n';
import database from '@/db';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/stores/authStore';
import { useEntityStore } from '@/stores/entityStore';

// Keep splash screen visible until we resolve state and fonts
SplashScreen.preventAutoHideAsync().catch(() => {});

// Initialize Query Client for caching API/DB calculations if needed
const queryClient = new QueryClient();

function NavigationGuard() {
  const { status, isLocked, loadPersistedState, checkIdleTimeout, recordActivity, lock } = useAuthStore();
  const { isLoaded: entityLoaded, loadPersistedState: loadPersistedEntity } = useEntityStore();
  const segments = useSegments();
  const router = useRouter();
  const [storeStateLoaded, setStoreStateLoaded] = useState(false);

  const [appState, setAppState] = useState(AppState.currentState);

  // 1. Load persisted state on app launch
  useEffect(() => {
    async function initStores() {
      await Promise.all([
        loadPersistedState(),
        loadPersistedEntity(),
      ]);
      setStoreStateLoaded(true);
    }
    initStores();
  }, [loadPersistedState, loadPersistedEntity]);

  // 1.5. Lock the session automatically when the application is backgrounded
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      setAppState(nextAppState);
      if (nextAppState === 'background') {
        if (status === 'authenticated') {
          console.log('[NavGuard] App moved to background. Session locked.');
          lock();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [status, lock]);

  // 2. Control routing based on authentication and lock status
  useEffect(() => {
    if (!storeStateLoaded) return;

    // Enforce that we only perform navigation routing changes when the app is actively in the foreground
    if (appState !== 'active') {
      console.log('[NavGuard] App is not active (currentState:', appState, '). Deferring routing redirect evaluation.');
      return;
    }

    const inTabsGroup = segments[0] === '(tabs)';
    const isOnboarding = segments[0] === 'onboarding';
    const isLogin = segments[0] === 'login';

    console.log('[NavGuard] status:', status, 'isLocked:', isLocked, 'segments:', segments, 'isOnboarding:', isOnboarding, 'isLogin:', isLogin);

    if (status === 'unauthenticated') {
      // New users and returning unauthenticated users land on login
      // They can navigate to onboarding from the login screen
      if (!isLogin && !isOnboarding) {
        console.log('[NavGuard] → Redirecting to /login (unauthenticated, not on login/onboarding)');
        router.replace('/login');
      } else {
        console.log('[NavGuard] → Staying on current screen (unauthenticated, on login or onboarding)');
      }
    } else if (isLocked) {
      if (!isLogin && !isOnboarding) {
        console.log('[NavGuard] → Redirecting to /login (locked)');
        router.replace('/login');
      }
    } else {
      // Authenticated and unlocked
      // Direct user to tabs if they are on auth screen or root
      if (isOnboarding || isLogin || !segments[0]) {
        console.log('[NavGuard] → Redirecting to /(tabs) (authenticated, on auth screen)');
        router.replace('/(tabs)');
      }
    }
  }, [status, isLocked, storeStateLoaded, segments, router, appState]);

  // If store is loading, render nothing (splash screen handles the placeholder)
  if (!storeStateLoaded) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      <Stack.Screen name="login" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(screens)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // Hide splash screen once fonts are loaded
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <DatabaseProvider database={database}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <NavigationGuard />
        </ThemeProvider>
      </QueryClientProvider>
    </DatabaseProvider>
  );
}
