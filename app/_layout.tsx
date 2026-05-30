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
import { StyleSheet, View, LogBox } from 'react-native';

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
  const { status, isLocked, loadPersistedState, checkIdleTimeout, recordActivity } = useAuthStore();
  const { isLoaded: entityLoaded, loadPersistedState: loadPersistedEntity } = useEntityStore();
  const segments = useSegments();
  const router = useRouter();
  const [storeStateLoaded, setStoreStateLoaded] = useState(false);

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

  // 2. Control routing based on authentication and lock status
  useEffect(() => {
    if (!storeStateLoaded) return;

    const inTabsGroup = segments[0] === '(tabs)';
    const isOnboarding = segments[0] === 'onboarding';
    const isLogin = segments[0] === 'login';

    if (status === 'unauthenticated') {
      // New users and returning unauthenticated users land on login
      // They can navigate to onboarding from the login screen
      if (!isLogin && !isOnboarding) {
        router.replace('/login');
      }
    } else if (isLocked) {
      if (!isLogin) {
        router.replace('/login');
      }
    } else {
      // Authenticated and unlocked
      // Direct user to tabs if they are on auth screen or root
      if (isOnboarding || isLogin || !segments[0]) {
        router.replace('/(tabs)');
      }
    }
  }, [status, isLocked, storeStateLoaded, segments, router]);

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
