/**
 * TallyTracker — CaUser Model
 *
 * The CA's own profile. One per device installation.
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, children, readonly } from '@nozbe/watermelondb/decorators';
import { TABLE_NAMES } from '../../utils/constants';

export default class CaUser extends Model {
  static table = TABLE_NAMES.CA_USERS;

  static associations = {
    [TABLE_NAMES.ENTITIES]: { type: 'has_many' as const, foreignKey: 'ca_user_id' },
    [TABLE_NAMES.HABITS]: { type: 'has_many' as const, foreignKey: 'ca_user_id' },
  };

  @field('name') name!: string;
  @field('email') email!: string;
  @field('pin_hash') pinHash!: string;
  @field('biometric_enabled') biometricEnabled!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @children(TABLE_NAMES.ENTITIES) entities: any;
  @children(TABLE_NAMES.HABITS) habits: any;
}
