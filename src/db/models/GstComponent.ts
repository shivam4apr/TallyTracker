/**
 * TallyTracker — GstComponent Model
 *
 * One row per tax component on a taxable voucher line.
 * type: cgst | sgst | igst | cess
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, relation, readonly } from '@nozbe/watermelondb/decorators';
import { TABLE_NAMES } from '../../utils/constants';
import type { GstComponentType } from '../../utils/constants';

export default class GstComponent extends Model {
  static table = TABLE_NAMES.GST_COMPONENTS;

  static associations = {
    [TABLE_NAMES.VOUCHER_LINES]: { type: 'belongs_to' as const, key: 'voucher_line_id' },
  };

  @field('voucher_line_id') voucherLineId!: string;
  @field('type') type!: GstComponentType;              // 'cgst'|'sgst'|'igst'|'cess'
  @field('rate') rate!: number;                          // Percentage (e.g. 9 for 9%)
  @field('amount_paise') amountPaise!: number;           // Integer in paise
  @field('hsn_sac') hsnSac!: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation(TABLE_NAMES.VOUCHER_LINES, 'voucher_line_id') voucherLine: any;
}
