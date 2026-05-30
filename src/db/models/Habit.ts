/**
 * TallyTracker — Habit Model
 *
 * CA compliance habits. Separate from accounting data.
 * Tracks streaks and completion for compliance tasks.
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, relation, readonly } from '@nozbe/watermelondb/decorators';
import { TABLE_NAMES } from '../../utils/constants';
import type { HabitFrequency } from '../../utils/constants';

export default class Habit extends Model {
  static table = TABLE_NAMES.HABITS;

  static associations = {
    [TABLE_NAMES.CA_USERS]: { type: 'belongs_to' as const, key: 'ca_user_id' },
  };

  @field('ca_user_id') caUserId!: string;
  @field('title') title!: string;
  @field('frequency') frequency!: HabitFrequency;
  @field('last_completed_date') lastCompletedDate!: number | null;
  @field('streak_count') streakCount!: number;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation(TABLE_NAMES.CA_USERS, 'ca_user_id') caUser: any;
}
