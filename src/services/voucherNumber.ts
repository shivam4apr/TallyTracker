/**
 * TallyTracker — Voucher Number Generation Service
 *
 * Automatically generates the next serial voucher number (e.g. PMT/001/2627)
 * based on active entity, type, and financial year date range.
 */

import { Database } from '@nozbe/watermelondb';
import { Q } from '@nozbe/watermelondb';
import { TABLE_NAMES, VOUCHER_TYPE_PREFIX, VoucherType } from '../utils/constants';
import { getFYString, getFYStartDate, getFYEndDate } from '../utils/date';

/**
 * Calculates the next serial voucher number.
 *
 * @param database - WatermelonDB database instance
 * @param entityId - Active entity ID
 * @param voucherType - The type of the voucher (e.g., 'payment')
 * @param date - Transaction date
 * @param fyStartMonth - Start month of financial year (4 = April, 1 = Jan)
 */
export async function getNextVoucherNumber(
  database: Database,
  entityId: string,
  voucherType: VoucherType,
  date: Date,
  fyStartMonth: number = 4
): Promise<string> {
  const fyString = getFYString(date, fyStartMonth);
  const prefix = VOUCHER_TYPE_PREFIX[voucherType];

  const fyStart = getFYStartDate(date, fyStartMonth).getTime();
  const fyEnd = getFYEndDate(date, fyStartMonth).getTime();

  // Query vouchers matching entity, type, and dates
  const count = await database
    .get(TABLE_NAMES.VOUCHERS)
    .query(
      Q.where('entity_id', entityId),
      Q.where('voucher_type', voucherType),
      Q.where('date', Q.between(fyStart, fyEnd))
    )
    .count;

  const nextNum = String(count + 1).padStart(3, '0');
  return `${prefix}/${nextNum}/${fyString}`;
}
