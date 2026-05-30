/**
 * TallyTracker — VoucherLine Model
 *
 * One debit or credit line within a voucher.
 * Minimum 2 lines per voucher. SUM(Dr) must equal SUM(Cr).
 * Carries GST breakdown (CGST/SGST/IGST) per line.
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, relation, children, readonly } from '@nozbe/watermelondb/decorators';
import { TABLE_NAMES } from '../../utils/constants';
import type { DrCr, SupplyType } from '../../utils/constants';

export default class VoucherLine extends Model {
  static table = TABLE_NAMES.VOUCHER_LINES;

  static associations = {
    [TABLE_NAMES.VOUCHERS]: { type: 'belongs_to' as const, key: 'voucher_id' },
    [TABLE_NAMES.LEDGERS]: { type: 'belongs_to' as const, key: 'ledger_id' },
    [TABLE_NAMES.GST_COMPONENTS]: { type: 'has_many' as const, foreignKey: 'voucher_line_id' },
  };

  @field('voucher_id') voucherId!: string;
  @field('ledger_id') ledgerId!: string;
  @field('dr_cr') drCr!: DrCr;                          // 'Dr' or 'Cr'
  @field('amount_paise') amountPaise!: number;           // Integer in paise
  @field('gst_type') gstType!: SupplyType | '';          // 'intrastate'|'interstate'|'exempt'|''
  @field('cgst_paise') cgstPaise!: number;
  @field('sgst_paise') sgstPaise!: number;
  @field('igst_paise') igstPaise!: number;
  @field('bank_date') bankDate?: number;
  @field('is_reconciled') isReconciled!: boolean;
  @field('stock_item_id') stockItemId?: string;
  @field('stock_qty') stockQty?: number;
  @field('discount_percent') discountPercent?: number;
  @field('foreign_amount_paise') foreignAmountPaise!: number | null;
  @field('line_order') lineOrder!: number;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation(TABLE_NAMES.VOUCHERS, 'voucher_id') voucher: any;
  @relation(TABLE_NAMES.LEDGERS, 'ledger_id') ledger: any;
  @children(TABLE_NAMES.GST_COMPONENTS) gstComponents: any;
}
