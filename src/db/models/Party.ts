/**
 * TallyTracker — Party Model
 *
 * Stores contact details, GSTIN, PAN, and payment terms for Sundry Debtors and Creditors.
 * Linked to a unique Ledger account under active Entity.
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, relation, readonly } from '@nozbe/watermelondb/decorators';
import { TABLE_NAMES } from '../../utils/constants';

export default class Party extends Model {
  static table = 'parties';

  static associations = {
    [TABLE_NAMES.ENTITIES]: { type: 'belongs_to' as const, key: 'entity_id' },
    [TABLE_NAMES.LEDGERS]: { type: 'belongs_to' as const, key: 'ledger_id' },
  };

  @field('entity_id') entityId!: string;
  @field('ledger_id') ledgerId!: string;
  @field('name') name!: string;
  @field('gstin') gstin!: string;
  @field('pan') pan!: string;
  @field('phone') phone!: string;
  @field('email') email!: string;
  @field('billing_address') billingAddress!: string;
  @field('shipping_address') shippingAddress!: string;
  @field('state_code') stateCode!: string; // 2-character State Code (e.g. '07' for Delhi)
  @field('credit_days') creditDays!: number;
  @field('credit_limit_paise') creditLimitPaise!: number;
  @field('is_archived') isArchived!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation(TABLE_NAMES.ENTITIES, 'entity_id') entity: any;
  @relation(TABLE_NAMES.LEDGERS, 'ledger_id') ledger: any;
}
