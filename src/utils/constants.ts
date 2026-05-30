/**
 * TallyTracker — Application Constants & Enums
 *
 * All enums and type constants used across the app.
 * These match the WatermelonDB schema column values exactly.
 */

// ─── Account Group Natures ─────────────────────────────────────
export type AccountNature = 'asset' | 'liability' | 'income' | 'expense' | 'equity';

export const ACCOUNT_NATURES: readonly AccountNature[] = [
  'asset',
  'liability',
  'income',
  'expense',
  'equity',
] as const;

// ─── Voucher Types ─────────────────────────────────────────────
export type VoucherType =
  | 'payment'
  | 'receipt'
  | 'contra'
  | 'journal'
  | 'sales'
  | 'purchase'
  | 'debit_note'
  | 'credit_note'
  | 'sales_order'
  | 'purchase_order';

export const VOUCHER_TYPES: readonly VoucherType[] = [
  'payment',
  'receipt',
  'contra',
  'journal',
  'sales',
  'purchase',
  'debit_note',
  'credit_note',
  'sales_order',
  'purchase_order',
] as const;

/** Short prefix used in voucher numbering (e.g. PMT/001/2425) */
export const VOUCHER_TYPE_PREFIX: Record<VoucherType, string> = {
  payment: 'PMT',
  receipt: 'RCT',
  contra: 'CTR',
  journal: 'JRN',
  sales: 'SLS',
  purchase: 'PUR',
  debit_note: 'DBN',
  credit_note: 'CRN',
  sales_order: 'SO',
  purchase_order: 'PO',
};

export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  payment: 'Payment',
  receipt: 'Receipt',
  contra: 'Contra',
  journal: 'Journal',
  sales: 'Sales',
  purchase: 'Purchase',
  debit_note: 'Debit Note',
  credit_note: 'Credit Note',
  sales_order: 'Sales Order',
  purchase_order: 'Purchase Order',
};

// ─── Debit / Credit ────────────────────────────────────────────
export type DrCr = 'Dr' | 'Cr';

// ─── GST Types ─────────────────────────────────────────────────
export type SupplyType = 'intrastate' | 'interstate' | 'exempt';

export const SUPPLY_TYPES: readonly SupplyType[] = [
  'intrastate',
  'interstate',
  'exempt',
] as const;

export type GstComponentType = 'cgst' | 'sgst' | 'igst' | 'cess';

export const GST_RATES: readonly number[] = [0, 5, 12, 18, 28] as const;

// ─── Habit Frequencies ─────────────────────────────────────────
export type HabitFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

export const HABIT_FREQUENCIES: readonly HabitFrequency[] = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
] as const;

// ─── App Config ────────────────────────────────────────────────
export const APP_CONFIG = {
  /** App display name */
  APP_NAME: 'TallyTracker',

  /** Bundle identifier */
  BUNDLE_ID: 'com.tallytracker.app',

  /** Base currency (INR only in v1.0) */
  BASE_CURRENCY: 'INR',

  /** Currency symbol */
  CURRENCY_SYMBOL: '₹',

  /** Max free entities (premium gate) */
  MAX_FREE_ENTITIES: 3,

  /** PIN length */
  PIN_LENGTH: 4,

  /** Max failed PIN attempts before lockout */
  MAX_PIN_ATTEMPTS: 10,

  /** Auto-lock idle timeout (ms) — 5 minutes */
  IDLE_TIMEOUT_MS: 5 * 60 * 1000,

  /** Backup file extension */
  BACKUP_EXTENSION: '.ttbak',
} as const;

// ─── Table Names (WatermelonDB) ────────────────────────────────
export const TABLE_NAMES = {
  CA_USERS: 'ca_users',
  ENTITIES: 'entities',
  ACCOUNT_GROUPS: 'account_groups',
  LEDGERS: 'ledgers',
  VOUCHERS: 'vouchers',
  VOUCHER_LINES: 'voucher_lines',
  GST_COMPONENTS: 'gst_components',
  HABITS: 'habits',
  PARTIES: 'parties',
  AUDIT_LOGS: 'audit_logs',
  STOCK_ITEMS: 'stock_items',
} as const;
