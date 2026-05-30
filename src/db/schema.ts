/**
 * TallyTracker — WatermelonDB Schema
 *
 * 8 tables. Every monetary column is an integer in paise.
 * Every table has created_at, updated_at for sync compatibility.
 */

import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { TABLE_NAMES } from '../utils/constants';

export const schema = appSchema({
  version: 5,
  tables: [
    // ─── CA Users ────────────────────────────────────────────────
    tableSchema({
      name: TABLE_NAMES.CA_USERS,
      columns: [
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'pin_hash', type: 'string' },
        { name: 'biometric_enabled', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ─── Entities (Client Businesses) ────────────────────────────
    tableSchema({
      name: TABLE_NAMES.ENTITIES,
      columns: [
        { name: 'ca_user_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'pan', type: 'string' },
        { name: 'gstin', type: 'string' },
        { name: 'address', type: 'string' },
        { name: 'financial_year_start', type: 'number' }, // Month number: 1=Jan, 4=Apr
        { name: 'base_currency', type: 'string' },       // 'INR' for v1.0
        { name: 'closed_fy_years', type: 'string' },     // JSON array of closed FY strings
        { name: 'is_archived', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ─── Account Groups ──────────────────────────────────────────
    tableSchema({
      name: TABLE_NAMES.ACCOUNT_GROUPS,
      columns: [
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'nature', type: 'string' },               // 'asset'|'liability'|'income'|'expense'|'equity'
        { name: 'parent_group_id', type: 'string', isOptional: true }, // Self-referential
        { name: 'is_system', type: 'boolean' },
        { name: 'display_order', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ─── Ledgers (Accounts) ──────────────────────────────────────
    tableSchema({
      name: TABLE_NAMES.LEDGERS,
      columns: [
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'group_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'gst_rate', type: 'number' },              // 0, 5, 12, 18, or 28
        { name: 'hsn_sac', type: 'string' },                // HSN/SAC code
        { name: 'affects_stock', type: 'boolean' },
        { name: 'is_system', type: 'boolean' },
        { name: 'opening_balance_dr_cr', type: 'string' },  // 'Dr' or 'Cr'
        { name: 'opening_balance_paise', type: 'number' },  // Integer in paise
        { name: 'is_archived', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ─── Vouchers ────────────────────────────────────────────────
    tableSchema({
      name: TABLE_NAMES.VOUCHERS,
      columns: [
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'voucher_type', type: 'string' },           // 'payment'|'receipt'|'contra'|'journal'|'sales'|'purchase'
        { name: 'number', type: 'string' },                  // e.g. 'PMT/001/2425'
        { name: 'date', type: 'number' },                    // Timestamp
        { name: 'narration', type: 'string' },
        { name: 'ref_number', type: 'string' },
        { name: 'is_cancelled', type: 'boolean' },
        { name: 'foreign_currency_code', type: 'string', isOptional: true },
        { name: 'exchange_rate', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ─── Voucher Lines ───────────────────────────────────────────
    tableSchema({
      name: TABLE_NAMES.VOUCHER_LINES,
      columns: [
        { name: 'voucher_id', type: 'string', isIndexed: true },
        { name: 'ledger_id', type: 'string', isIndexed: true },
        { name: 'dr_cr', type: 'string' },                  // 'Dr' or 'Cr'
        { name: 'amount_paise', type: 'number' },            // Integer in paise
        { name: 'gst_type', type: 'string' },                // 'intrastate'|'interstate'|'exempt'|''
        { name: 'cgst_paise', type: 'number' },
        { name: 'sgst_paise', type: 'number' },
        { name: 'igst_paise', type: 'number' },
        { name: 'bank_date', type: 'number', isOptional: true },
        { name: 'is_reconciled', type: 'boolean' },
        { name: 'stock_item_id', type: 'string', isOptional: true },
        { name: 'stock_qty', type: 'number', isOptional: true },
        { name: 'discount_percent', type: 'number', isOptional: true },
        { name: 'foreign_amount_paise', type: 'number', isOptional: true },
        { name: 'line_order', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ─── GST Components ──────────────────────────────────────────
    tableSchema({
      name: TABLE_NAMES.GST_COMPONENTS,
      columns: [
        { name: 'voucher_line_id', type: 'string', isIndexed: true },
        { name: 'type', type: 'string' },                    // 'cgst'|'sgst'|'igst'|'cess'
        { name: 'rate', type: 'number' },                     // Percentage (e.g. 9 for 9%)
        { name: 'amount_paise', type: 'number' },             // Integer in paise
        { name: 'hsn_sac', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ─── Habits ──────────────────────────────────────────────────
    tableSchema({
      name: TABLE_NAMES.HABITS,
      columns: [
        { name: 'ca_user_id', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'frequency', type: 'string' },               // 'daily'|'weekly'|'monthly'|'quarterly'|'annual'
        { name: 'last_completed_date', type: 'number', isOptional: true },
        { name: 'streak_count', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ─── Parties (Customer/Supplier Contacts) ────────────────────
    tableSchema({
      name: 'parties', // Using raw string or TABLE_NAMES.PARTIES which evaluates to 'parties'
      columns: [
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'ledger_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'gstin', type: 'string' },
        { name: 'pan', type: 'string' },
        { name: 'phone', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'billing_address', type: 'string' },
        { name: 'shipping_address', type: 'string' },
        { name: 'state_code', type: 'string' },
        { name: 'credit_days', type: 'number' },
        { name: 'credit_limit_paise', type: 'number' },
        { name: 'is_archived', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ─── Audit Logs ──────────────────────────────────────────────
    tableSchema({
      name: TABLE_NAMES.AUDIT_LOGS,
      columns: [
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'table_name', type: 'string' },
        { name: 'record_id', type: 'string' },
        { name: 'action', type: 'string' },
        { name: 'changed_fields', type: 'string' },
        { name: 'performed_by', type: 'string' },
        { name: 'performed_at', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ─── Stock Items (Inventory Master) ──────────────────────────
    tableSchema({
      name: TABLE_NAMES.STOCK_ITEMS,
      columns: [
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'unit', type: 'string' },
        { name: 'opening_qty', type: 'number' },
        { name: 'opening_rate_paise', type: 'number' },
        { name: 'is_archived', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
