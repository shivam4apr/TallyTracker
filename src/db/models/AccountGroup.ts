/**
 * TallyTracker — AccountGroup Model
 *
 * Tally group hierarchy per entity. Seeded on entity creation.
 * Self-referential via parent_group_id for nested groups.
 * nature: asset | liability | income | expense | equity
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, relation, children, readonly } from '@nozbe/watermelondb/decorators';
import { TABLE_NAMES } from '../../utils/constants';
import type { AccountNature } from '../../utils/constants';

export default class AccountGroup extends Model {
  static table = TABLE_NAMES.ACCOUNT_GROUPS;

  static associations = {
    [TABLE_NAMES.ENTITIES]: { type: 'belongs_to' as const, key: 'entity_id' },
    [TABLE_NAMES.LEDGERS]: { type: 'has_many' as const, foreignKey: 'group_id' },
  };

  @field('entity_id') entityId!: string;
  @field('name') name!: string;
  @field('nature') nature!: AccountNature;
  @field('parent_group_id') parentGroupId!: string | null;
  @field('is_system') isSystem!: boolean;
  @field('display_order') displayOrder!: number;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation(TABLE_NAMES.ENTITIES, 'entity_id') entity: any;
  @children(TABLE_NAMES.LEDGERS) ledgers: any;
}
