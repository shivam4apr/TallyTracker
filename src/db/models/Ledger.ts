/**
 * TallyTracker — Ledger Model
 *
 * One row per ledger (account) within a group.
 * Carries GST rate and HSN/SAC code for tax computation.
 * Opening balance stored directly on the ledger (not via a special voucher).
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, relation, readonly } from '@nozbe/watermelondb/decorators';
import { TABLE_NAMES } from '../../utils/constants';
import type { DrCr } from '../../utils/constants';

export default class Ledger extends Model {
  static table = TABLE_NAMES.LEDGERS;

  static associations = {
    [TABLE_NAMES.ENTITIES]: { type: 'belongs_to' as const, key: 'entity_id' },
    [TABLE_NAMES.ACCOUNT_GROUPS]: { type: 'belongs_to' as const, key: 'group_id' },
  };

  @field('entity_id') entityId!: string;
  @field('group_id') groupId!: string;
  @field('name') name!: string;
  @field('gst_rate') gstRate!: number;                    // 0, 5, 12, 18, or 28
  @field('hsn_sac') hsnSac!: string;                      // HSN/SAC code
  @field('affects_stock') affectsStock!: boolean;
  @field('is_system') isSystem!: boolean;
  @field('opening_balance_dr_cr') openingBalanceDrCr!: DrCr;
  @field('opening_balance_paise') openingBalancePaise!: number;
  @field('is_archived') isArchived!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation(TABLE_NAMES.ENTITIES, 'entity_id') entity: any;
  @relation(TABLE_NAMES.ACCOUNT_GROUPS, 'group_id') group: any;
}
