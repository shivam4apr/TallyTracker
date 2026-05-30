/**
 * TallyTracker — Entity Model
 *
 * One row per client business managed by the CA.
 * Each entity has its own isolated account group tree,
 * ledger list, and voucher history.
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, relation, children, readonly } from '@nozbe/watermelondb/decorators';
import { TABLE_NAMES } from '../../utils/constants';

export default class Entity extends Model {
  static table = TABLE_NAMES.ENTITIES;

  static associations = {
    [TABLE_NAMES.CA_USERS]: { type: 'belongs_to' as const, key: 'ca_user_id' },
    [TABLE_NAMES.ACCOUNT_GROUPS]: { type: 'has_many' as const, foreignKey: 'entity_id' },
    [TABLE_NAMES.LEDGERS]: { type: 'has_many' as const, foreignKey: 'entity_id' },
    [TABLE_NAMES.VOUCHERS]: { type: 'has_many' as const, foreignKey: 'entity_id' },
  };

  @field('ca_user_id') caUserId!: string;
  @field('name') name!: string;
  @field('pan') pan!: string;
  @field('gstin') gstin!: string;
  @field('address') address!: string;
  @field('financial_year_start') financialYearStart!: number; // Month: 1=Jan, 4=Apr
  @field('base_currency') baseCurrency!: string;
  @field('closed_fy_years') closedFyYears!: string;
  @field('is_archived') isArchived!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation(TABLE_NAMES.CA_USERS, 'ca_user_id') caUser: any;
  @children(TABLE_NAMES.ACCOUNT_GROUPS) accountGroups: any;
  @children(TABLE_NAMES.LEDGERS) ledgers: any;
  @children(TABLE_NAMES.VOUCHERS) vouchers: any;
}
