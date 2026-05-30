import { schemaMigrations, createTable, addColumns } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'parties',
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
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'voucher_lines',
          columns: [
            { name: 'bank_date', type: 'number', isOptional: true },
            { name: 'is_reconciled', type: 'boolean' },
          ],
        }),
        addColumns({
          table: 'entities',
          columns: [
            { name: 'closed_fy_years', type: 'string' },
          ],
        }),
        createTable({
          name: 'audit_logs',
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
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'voucher_lines',
          columns: [
            { name: 'stock_item_id', type: 'string', isOptional: true },
            { name: 'stock_qty', type: 'number', isOptional: true },
            { name: 'discount_percent', type: 'number', isOptional: true },
          ],
        }),
        createTable({
          name: 'stock_items',
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
    },
  ],
});
