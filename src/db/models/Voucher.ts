/**
 * TallyTracker — Voucher Model
 *
 * Header of every accounting entry. Each voucher has 2+ voucher lines.
 * Double-entry is enforced: SUM(Dr lines) must equal SUM(Cr lines).
 *
 * voucher_type: payment | receipt | contra | journal | sales | purchase
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, relation, children, readonly } from '@nozbe/watermelondb/decorators';
import { TABLE_NAMES } from '../../utils/constants';
import type { VoucherType } from '../../utils/constants';

export default class Voucher extends Model {
  static table = TABLE_NAMES.VOUCHERS;

  static associations = {
    [TABLE_NAMES.ENTITIES]: { type: 'belongs_to' as const, key: 'entity_id' },
    [TABLE_NAMES.VOUCHER_LINES]: { type: 'has_many' as const, foreignKey: 'voucher_id' },
  };

  @field('entity_id') entityId!: string;
  @field('voucher_type') voucherType!: VoucherType;
  @field('number') number!: string;                // e.g. 'PMT/001/2425'
  @date('date') date!: Date;
  @field('narration') narration!: string;
  @field('ref_number') refNumber!: string;
  @field('is_cancelled') isCancelled!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation(TABLE_NAMES.ENTITIES, 'entity_id') entity: any;
  @children(TABLE_NAMES.VOUCHER_LINES) voucherLines: any;
}
