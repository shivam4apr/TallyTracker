/**
 * TallyTracker — Date Utilities
 *
 * Date helpers focused on Indian financial year calculations.
 * Indian FY runs April 1 → March 31 (default).
 */

import { format, parse, startOfDay, endOfDay, isWithinInterval, addDays, subDays } from 'date-fns';

/**
 * Get the financial year string for a given date.
 * Default FY starts in April.
 *
 * @example
 * getFYString(new Date('2024-06-15'), 4) // → "2425"
 * getFYString(new Date('2025-02-15'), 4) // → "2425"
 * getFYString(new Date('2025-04-01'), 4) // → "2526"
 */
export function getFYString(date: Date, fyStartMonth: number = 4): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-indexed

  let startYear: number;
  if (month >= fyStartMonth) {
    startYear = year;
  } else {
    startYear = year - 1;
  }

  const endYear = startYear + 1;

  // Last 2 digits of each year
  const startSuffix = String(startYear).slice(-2);
  const endSuffix = String(endYear).slice(-2);

  return `${startSuffix}${endSuffix}`;
}

/**
 * Get the start date of the financial year containing the given date.
 *
 * @example
 * getFYStartDate(new Date('2024-06-15'), 4) // → 2024-04-01
 * getFYStartDate(new Date('2025-02-15'), 4) // → 2024-04-01
 */
export function getFYStartDate(date: Date, fyStartMonth: number = 4): Date {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  if (month >= fyStartMonth) {
    return new Date(year, fyStartMonth - 1, 1);
  } else {
    return new Date(year - 1, fyStartMonth - 1, 1);
  }
}

/**
 * Get the end date of the financial year containing the given date.
 *
 * @example
 * getFYEndDate(new Date('2024-06-15'), 4) // → 2025-03-31
 */
export function getFYEndDate(date: Date, fyStartMonth: number = 4): Date {
  const start = getFYStartDate(date, fyStartMonth);
  // FY ends one day before the start of next FY
  const nextFYStart = new Date(start.getFullYear() + 1, start.getMonth(), 1);
  return subDays(nextFYStart, 1);
}

/**
 * Format a date as DD/MM/YYYY (Indian standard).
 *
 * @example
 * formatDateIndian(new Date('2024-06-15')) // → "15/06/2024"
 */
export function formatDateIndian(date: Date): string {
  return format(date, 'dd/MM/yyyy');
}

/**
 * Format a date as DD MMM YYYY (short format).
 *
 * @example
 * formatDateShort(new Date('2024-06-15')) // → "15 Jun 2024"
 */
export function formatDateShort(date: Date): string {
  return format(date, 'dd MMM yyyy');
}

/**
 * Format a date for display in voucher headers.
 *
 * @example
 * formatVoucherDate(new Date('2024-06-15')) // → "15-Jun-2024"
 */
export function formatVoucherDate(date: Date): string {
  return format(date, 'dd-MMM-yyyy');
}

/**
 * Parse a DD/MM/YYYY string to a Date object.
 */
export function parseDateIndian(dateStr: string): Date {
  return parse(dateStr, 'dd/MM/yyyy', new Date());
}

/**
 * Get ISO date string (YYYY-MM-DD) for database storage.
 */
export function toISODateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Parse an ISO date string (YYYY-MM-DD) to a Date object.
 */
export function fromISODateString(dateStr: string): Date {
  return parse(dateStr, 'yyyy-MM-dd', new Date());
}

/**
 * Check if a date falls within a date range (inclusive).
 */
export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  return isWithinInterval(startOfDay(date), {
    start: startOfDay(start),
    end: endOfDay(end),
  });
}

/**
 * Get today's date at start of day (midnight).
 */
export function today(): Date {
  return startOfDay(new Date());
}

/**
 * Get the FY display label.
 *
 * @example
 * getFYLabel(new Date('2024-06-15'), 4) // → "FY 2024-25"
 */
export function getFYLabel(date: Date, fyStartMonth: number = 4): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  let startYear: number;
  if (month >= fyStartMonth) {
    startYear = year;
  } else {
    startYear = year - 1;
  }

  const endYear = startYear + 1;
  return `FY ${startYear}-${String(endYear).slice(-2)}`;
}

export { addDays, subDays, startOfDay, endOfDay };
