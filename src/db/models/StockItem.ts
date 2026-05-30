/**
 * TallyTracker — StockItem Model
 *
 * Tracks individual stock items (inventory) per client entity.
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';
import { TABLE_NAMES } from '../../utils/constants';

export default class StockItem extends Model {
  static table = TABLE_NAMES.STOCK_ITEMS;

  @field('entity_id') entityId!: string;
  @field('name') name!: string;
  @field('unit') unit!: string;                         // e.g. 'Pcs', 'Kgs', 'Nos'
  @field('opening_qty') openingQty!: number;
  @field('opening_rate_paise') openingRatePaise!: number; // Rate per unit in paise
  @field('is_archived') isArchived!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
