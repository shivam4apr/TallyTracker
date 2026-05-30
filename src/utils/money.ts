/**
 * TallyTracker — Money Utilities
 *
 * All monetary values are stored as 64-bit integers in paise
 * (1 rupee = 100 paise). There is NO floating-point arithmetic
 * in the accounting engine. This is the same approach used by
 * all production accounting software.
 */

import { APP_CONFIG } from './constants';

/**
 * Convert rupees (as a decimal number) to paise (integer).
 * Always rounds to the nearest paise.
 *
 * @example
 * rupeesToPaise(100.50)  // → 10050
 * rupeesToPaise(0.01)    // → 1
 * rupeesToPaise(1234.99) // → 123499
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Convert paise (integer) to rupees (float for display only).
 * Never use the result for arithmetic — always work in paise.
 *
 * @example
 * paiseToRupees(10050)  // → 100.50
 * paiseToRupees(1)      // → 0.01
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Format paise as a human-readable rupee string with currency symbol.
 *
 * @example
 * formatPaise(10050)    // → "₹100.50"
 * formatPaise(-5000)    // → "-₹50.00"
 * formatPaise(0)        // → "₹0.00"
 * formatPaise(1234567)  // → "₹12,345.67"
 */
export function formatPaise(paise: number): string {
  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = absPaise / 100;

  // Use Indian numbering system (e.g., 12,34,567.89)
  const formatted = formatIndianNumber(rupees);
  return `${isNegative ? '-' : ''}${APP_CONFIG.CURRENCY_SYMBOL}${formatted}`;
}

/**
 * Format paise as a plain number string (no currency symbol).
 * Useful for input fields.
 *
 * @example
 * formatPaisePlain(10050) // → "100.50"
 * formatPaisePlain(0)     // → "0.00"
 */
export function formatPaisePlain(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  return rupees.toFixed(2);
}

/**
 * Parse a rupee string (from user input) to paise.
 * Strips currency symbols, commas, and whitespace.
 * Returns 0 for invalid input.
 *
 * @example
 * parseInputToPaise("100.50")    // → 10050
 * parseInputToPaise("₹1,234.99") // → 123499
 * parseInputToPaise("abc")       // → 0
 */
export function parseInputToPaise(input: string): number {
  const cleaned = input.replace(/[₹,\s]/g, '').trim();
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return 0;
  return rupeesToPaise(parsed);
}

/**
 * Format a number in Indian numbering system.
 * Indian system: 1,00,000 (one lakh) instead of 100,000.
 *
 * @example
 * formatIndianNumber(1234567.89) // → "12,34,567.89"
 * formatIndianNumber(100.5)      // → "100.50"
 * formatIndianNumber(0)          // → "0.00"
 */
export function formatIndianNumber(num: number): string {
  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split('.');

  if (!intPart || intPart.length <= 3) {
    return fixed;
  }

  // Last 3 digits
  const lastThree = intPart.slice(-3);
  // Remaining digits grouped by 2
  const remaining = intPart.slice(0, -3);
  const grouped = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');

  return `${grouped},${lastThree}.${decPart}`;
}

/**
 * Add two paise amounts safely (integer arithmetic).
 * Uses Math.trunc instead of bitwise OR to avoid 32-bit overflow
 * for transactions exceeding ~₹21.47 crore.
 */
export function addPaise(a: number, b: number): number {
  return Math.trunc(a) + Math.trunc(b);
}

/**
 * Subtract two paise amounts safely (integer arithmetic).
 */
export function subtractPaise(a: number, b: number): number {
  return Math.trunc(a) - Math.trunc(b);
}

/**
 * Check if a Dr/Cr pair is balanced (Dr total === Cr total).
 */
export function isBalanced(drTotal: number, crTotal: number): boolean {
  return Math.trunc(drTotal) === Math.trunc(crTotal);
}

/**
 * Calculate the difference between Dr and Cr totals.
 * Positive = Dr excess, Negative = Cr excess.
 */
export function balanceDifference(drTotal: number, crTotal: number): number {
  return Math.trunc(drTotal) - Math.trunc(crTotal);
}
