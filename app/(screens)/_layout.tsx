/**
 * TallyTracker — Screens Layout
 *
 * Layout for modal/detail screens (ledger statement, voucher detail,
 * entities management, habits, agenda, premium).
 */

import React from 'react';
import { Stack } from 'expo-router';

export default function ScreensLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
