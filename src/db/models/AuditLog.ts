/**
 * TallyTracker — AuditLog Model
 *
 * Tracks administrative changes and transactional logs for legal/compliance auditing.
 * Keeps history of voucher updates, deletions, and resets.
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';
import { TABLE_NAMES } from '../../utils/constants';

export default class AuditLog extends Model {
  static table = TABLE_NAMES.AUDIT_LOGS;

  @field('entity_id') entityId!: string;
  @field('table_name') tableName!: string;
  @field('record_id') recordId!: string;
  @field('action') action!: string;                   // 'create' | 'update' | 'cancel'
  @field('changed_fields') changedFields!: string;     // JSON String representing fields diff
  @field('performed_by') performedBy!: string;         // Name of the CA or operator
  @field('performed_at') performedAt!: number;         // Timestamp
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
