/**
 * TallyTracker — Design Tokens
 *
 * Colors, spacing, typography, and nature→color mapping.
 * This is the visual language of the app.
 */

// ─── Nature → Color Map ────────────────────────────────────────
// The core visual identity: every ledger/group is colored by its nature.
export const NATURE_COLORS = {
  income: {
    primary: '#0D9488',    // Teal-600
    light: '#CCFBF1',      // Teal-100
    dark: '#065F53',        // Teal-800
    text: '#134E48',        // Teal-900
  },
  expense: {
    primary: '#F97066',    // Coral/Rose-400
    light: '#FFF1F2',      // Rose-50
    dark: '#BE123C',        // Rose-700
    text: '#881337',        // Rose-900
  },
  asset: {
    primary: '#3B82F6',    // Blue-500
    light: '#DBEAFE',      // Blue-100
    dark: '#1D4ED8',        // Blue-700
    text: '#1E3A5F',        // Blue-900
  },
  liability: {
    primary: '#EF4444',    // Red-500
    light: '#FEE2E2',      // Red-100
    dark: '#B91C1C',        // Red-700
    text: '#7F1D1D',        // Red-900
  },
  equity: {
    primary: '#8B5CF6',    // Violet-500
    light: '#EDE9FE',      // Violet-100
    dark: '#6D28D9',        // Violet-700
    text: '#4C1D95',        // Violet-900
  },
} as const;

// ─── Voucher Type Colors ───────────────────────────────────────
export const VOUCHER_TYPE_COLORS = {
  payment: {
    primary: '#F97316',    // Orange-500
    light: '#FFF7ED',      // Orange-50
    badge: '#FFEDD5',      // Orange-100
  },
  receipt: {
    primary: '#10B981',    // Emerald-500
    light: '#ECFDF5',      // Emerald-50
    badge: '#D1FAE5',      // Emerald-100
  },
  contra: {
    primary: '#3B82F6',    // Blue-500
    light: '#EFF6FF',      // Blue-50
    badge: '#DBEAFE',      // Blue-100
  },
  journal: {
    primary: '#8B5CF6',    // Violet-500
    light: '#F5F3FF',      // Violet-50
    badge: '#EDE9FE',      // Violet-100
  },
  sales: {
    primary: '#0D9488',    // Teal-600
    light: '#F0FDFA',      // Teal-50
    badge: '#CCFBF1',      // Teal-100
  },
  purchase: {
    primary: '#EF4444',    // Red-500
    light: '#FEF2F2',      // Red-50
    badge: '#FEE2E2',      // Red-100
  },
  debit_note: {
    primary: '#F43F5E',    // Rose-500 (Coral-ish)
    light: '#FFF1F2',      // Rose-50
    badge: '#FFE4E6',      // Rose-100
  },
  credit_note: {
    primary: '#06B6D4',    // Cyan-500
    light: '#ECFEFF',      // Cyan-50
    badge: '#CFFAFE',      // Cyan-100
  },
  sales_order: {
    primary: '#6366F1',    // Indigo-500
    light: '#EEF2FF',      // Indigo-50
    badge: '#E0E7FF',      // Indigo-100
  },
  purchase_order: {
    primary: '#D97706',    // Amber-600
    light: '#FFFBEB',      // Amber-50
    badge: '#FEF3C7',      // Amber-100
  },
} as const;

// ─── Base Colors ───────────────────────────────────────────────
export const COLORS = {
  // Neutrals
  white: '#FFFFFF',
  black: '#000000',

  // Grays
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  gray950: '#030712',

  // Semantic
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Dr/Cr
  debit: '#3B82F6',       // Blue for debit
  credit: '#10B981',      // Green for credit
  balanced: '#10B981',    // Green when Dr = Cr
  unbalanced: '#EF4444',  // Red when Dr ≠ Cr
} as const;

// ─── Spacing Scale ─────────────────────────────────────────────
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

// ─── Border Radius ─────────────────────────────────────────────
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

// ─── Typography ────────────────────────────────────────────────
export const FONT_FAMILIES = {
  heading: 'PlusJakartaSans-Bold',
  headingSemiBold: 'PlusJakartaSans-SemiBold',
  body: 'PlusJakartaSans-Regular',
  bodyMedium: 'PlusJakartaSans-Medium',
  bodySemiBold: 'PlusJakartaSans-SemiBold',
  mono: 'monospace',  // For amounts/numbers
} as const;

export const FONT_SIZES = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
} as const;

export const LINE_HEIGHTS = {
  xs: 16,
  sm: 18,
  md: 22,
  lg: 24,
  xl: 28,
  '2xl': 32,
  '3xl': 36,
  '4xl': 44,
  '5xl': 56,
} as const;

// ─── Shadows ───────────────────────────────────────────────────
export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;

// ─── Animation Durations ───────────────────────────────────────
export const ANIMATION = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;
