/**
 * TallyTracker — Bank Statement Import Parser & Matcher
 *
 * Implements high-fidelity parsers for bank statements:
 * 1. Structured CSV Parser with Universal Column Headers Auto-Detection.
 * 2. Regex-based Raw Text Paste Parser (PDF, Clipboard, Emails fallback).
 * 3. Double-entry direction mapping & Date-proximity Auto-Matching Engine.
 */

import { parse, format } from 'date-fns';
import { VoucherLine } from '@/db';

export interface BankStatementRow {
  id: string;
  date: Date;
  narration: string;
  refNo: string;
  amountPaise: number; // Positive for Deposit (Cr in Statement), Negative for Withdrawal (Dr in Statement)
  type: 'Dr' | 'Cr';   // 'Dr' is Withdrawal (Debit), 'Cr' is Deposit (Credit) from Bank Statement perspective
}

export interface ReconcileRow {
  lineId: string;
  lineRecord: VoucherLine;
  voucherId: string;
  date: Date;
  number: string;
  voucherType: string;
  refNumber: string;
  narration: string;
  drCr: 'Dr' | 'Cr'; // Books side: Dr is money in, Cr is money out
  amountPaise: number;
  particulars: string;
  isReconciled: boolean;
  clearanceDateStr: string;
}

export interface MatchResult {
  statementRow: BankStatementRow;
  matchedBookRow?: ReconcileRow;
  matchType: 'exact' | 'partial' | 'none' | 'reconciled';
  potentialMatches?: ReconcileRow[];
}

/**
 * Robust CSV Line Parser that honors quotes
 */
function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map(col => col.replace(/^"|"$/g, '').trim()); // Strip wrapping quotes
}

/**
 * Attempts to parse a date string in multiple common formats.
 */
function parseStatementDate(dateStr: string): Date | null {
  const cleanStr = dateStr.replace(/[\s,\-]+/g, ' ').trim();
  const formats = [
    'dd MM yyyy',
    'dd MMM yyyy',
    'dd MMMM yyyy',
    'yyyy MM dd',
    'dd/MM/yyyy',
    'dd-MM-yyyy',
    'yyyy-MM-dd',
    'dd.MM.yyyy',
    'd MMM yy',
    'dd MMM yy',
  ];

  for (const fmt of formats) {
    try {
      const parsed = parse(cleanStr, fmt, new Date());
      if (!isNaN(parsed.getTime())) {
        // Basic sanity check: year should be reasonable
        const year = parsed.getFullYear();
        if (year > 2000 && year < 2100) {
          return parsed;
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Clean numeric values from bank statements, handling commas, currencies, and signs.
 */
function parseAmountPaise(amtStr: string): number {
  if (!amtStr) return 0;
  // Remove currency symbols, commas, spaces, and trailing Dr/Cr
  let clean = amtStr.replace(/[^\d\.\-\+]/g, '').trim();
  const val = parseFloat(clean);
  if (isNaN(val)) return 0;
  return Math.round(val * 100);
}

/**
 * 1. UNIVERSAL CSV PARSER
 */
export function parseBankStatementCSV(csvContent: string): BankStatementRow[] {
  const lines = csvContent.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length < 2) return [];

  // Determine delimiter
  let delimiter = ',';
  const firstLine = lines[0] || '';
  if (firstLine.includes(';') && firstLine.split(';').length > firstLine.split(',').length) {
    delimiter = ';';
  } else if (firstLine.includes('\t') && firstLine.split('\t').length > firstLine.split(',').length) {
    delimiter = '\t';
  }

  // Parse headers and find column indices
  let headerIndex = 0;
  let headers = parseCSVLine(lines[0] || '', delimiter);

  // If the first row doesn't look like a header (e.g. it starts with numbers/dates),
  // let's scan for a header row.
  const dateRegex = /\b(date|txn|trans)\b/i;
  let foundHeader = headers.some(h => dateRegex.test(h));
  if (!foundHeader) {
    for (let i = 1; i < Math.min(lines.length, 10); i++) {
      const parsedLine = parseCSVLine(lines[i] || '', delimiter);
      if (parsedLine.some(col => dateRegex.test(col))) {
        headerIndex = i;
        headers = parsedLine;
        foundHeader = true;
        break;
      }
    }
  }

  // Map header words semantically
  let dateCol = -1;
  let descCol = -1;
  let refCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let amountCol = -1;

  headers.forEach((h, idx) => {
    const cleanH = h.toLowerCase().trim();
    if (/\b(date|txn.*date|value.*date|val.*date|post.*date)\b/i.test(cleanH)) {
      if (dateCol === -1) dateCol = idx;
    } else if (/\b(narration|particulars|description|remarks|memo|txn.*details|details)\b/i.test(cleanH)) {
      if (descCol === -1) descCol = idx;
    } else if (/\b(cheque|chq|ref|reference|utr|instrument|inst.*no|doc.*no)\b/i.test(cleanH)) {
      if (refCol === -1) refCol = idx;
    } else if (/\b(debit|withdrawal|dr|payment|out.*amount|amt.*out|paid.*out)\b/i.test(cleanH)) {
      if (debitCol === -1) debitCol = idx;
    } else if (/\b(credit|deposit|cr|receipt|in.*amount|amt.*in|received)\b/i.test(cleanH)) {
      if (creditCol === -1) creditCol = idx;
    } else if (/\b(amount|value|txn.*amt|balance|amt)\b/i.test(cleanH)) {
      // If it contains 'balance', don't use it unless no other amount column
      if (!cleanH.includes('balance') && amountCol === -1) {
        amountCol = idx;
      }
    }
  });

  // If no date column was matched, assume the first column
  if (dateCol === -1) dateCol = 0;
  // If no description column, assume the second
  if (descCol === -1) descCol = Math.min(1, headers.length - 1);

  const rows: BankStatementRow[] = [];
  const startRow = headerIndex + 1;

  for (let i = startRow; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i] || '', delimiter);
    if (cols.length < Math.max(dateCol, descCol) + 1) continue;

    // Parse date
    const dateStr = cols[dateCol] || '';
    const date = parseStatementDate(dateStr);
    if (!date) continue; // Skip rows that do not have a parseable transaction date

    // Parse narration & ref
    const narration = cols[descCol] || 'Bank Transaction';
    const refNo = refCol !== -1 ? cols[refCol] || '' : '';

    // Calculate amounts
    let type: 'Dr' | 'Cr' = 'Cr';
    let amountPaise = 0;

    if (debitCol !== -1 || creditCol !== -1) {
      const debitStr = debitCol !== -1 ? cols[debitCol] || '' : '';
      const creditStr = creditCol !== -1 ? cols[creditCol] || '' : '';
      const debPaise = parseAmountPaise(debitStr);
      const credPaise = parseAmountPaise(creditStr);

      if (debPaise > 0) {
        amountPaise = -debPaise;
        type = 'Dr';
      } else if (credPaise > 0) {
        amountPaise = credPaise;
        type = 'Cr';
      } else {
        // Skip zero rows
        continue;
      }
    } else if (amountCol !== -1) {
      const amtStr = cols[amountCol] || '';
      const rawPaise = parseAmountPaise(amtStr);
      
      // Look for signs or Dr/Cr labels inside amount column or row
      const rowStr = cols.join(' ').toLowerCase();
      const isDebit = rowStr.includes('dr') || amtStr.includes('-') || rowStr.includes('withdrawal') || rowStr.includes('debit');
      if (isDebit) {
        amountPaise = -Math.abs(rawPaise);
        type = 'Dr';
      } else {
        amountPaise = Math.abs(rawPaise);
        type = 'Cr';
      }
    } else {
      continue;
    }

    rows.push({
      id: `csv-${i}-${Date.now()}`,
      date,
      narration,
      refNo,
      amountPaise,
      type,
    });
  }

  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * 2. SMART RAW TEXT PASTED INGEST PARSER
 */
export function parseBankStatementRawText(text: string): BankStatementRow[] {
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
  const rows: BankStatementRow[] = [];

  // Match dates like 28/05/2026, 28-05-2026, 28-May-2026, 28 May 2026, etc.
  const dateRegex = /\b(\d{1,2})[/\-.\s]+([0-9]{1,2}|[A-Za-z]{3,9})[/\-.\s]+(\d{2,4})\b/;

  // Match numeric monetary amounts with two decimals, with optional commas (e.g. 15,000.00, 450.50, -500.00)
  const amountRegex = /(?:\b|\-)\d{1,3}(?:,\d{3})*\.\d{2}\b/g;

  lines.forEach((line, idx) => {
    // 1. Identify date
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) return; // Skip lines without a clear date token

    const dateStr = dateMatch[0];
    const date = parseStatementDate(dateStr);
    if (!date) return;

    // 2. Strip date from line to avoid numeric collision
    const lineWithoutDate = line.replace(dateStr, '').trim();

    // 3. Scan for monetary amounts
    const amounts = lineWithoutDate.match(amountRegex);
    if (!amounts || amounts.length === 0) return;

    // In pasted lists, usually the last number is the Running Balance, 
    // and the one before it is the Transaction Amount.
    // If only one amount is found, it's the Transaction Amount.
    let amtStr = '';
    if (amounts.length >= 2) {
      // Typically: [Amount, Running Balance] or [Withdrawal, Deposit, Balance]
      amtStr = amounts[amounts.length - 2]!;
    } else {
      amtStr = amounts[0]!;
    }

    const rawPaise = parseAmountPaise(amtStr);
    if (rawPaise === 0) return;

    // Determine Dr/Cr direction from contextual clues in the line
    const lowerLine = lineWithoutDate.toLowerCase();
    let type: 'Dr' | 'Cr' = 'Cr';
    let amountPaise = Math.abs(rawPaise);

    // If line has withdrawal terms, debit triggers, or a minus sign
    const isDebit = lowerLine.includes('dr') || 
                    lowerLine.includes('debit') || 
                    lowerLine.includes('withdrawal') || 
                    lowerLine.includes('payment') || 
                    lowerLine.includes('withdrawn') || 
                    lowerLine.includes('sent') || 
                    lowerLine.includes('charges') || 
                    amtStr.includes('-');

    if (isDebit) {
      amountPaise = -amountPaise;
      type = 'Dr';
    }

    // Narration is the leftover string once we remove date, amounts, and metadata words
    let narration = lineWithoutDate;
    amounts.forEach(a => {
      narration = narration.replace(a, '');
    });
    // Remove cleanups
    narration = narration
      .replace(/\b(dr|cr|debit|credit|bal|balance)\b/gi, '')
      .replace(/[\s,\-\t\|]+/g, ' ')
      .trim();

    if (!narration) narration = 'Bank Transaction';

    rows.push({
      id: `text-${idx}-${Date.now()}`,
      date,
      narration,
      refNo: '',
      amountPaise,
      type,
    });
  });

  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * 3. AUTO-MATCHING ENGINE
 * 
 * Maps bank statement entries to outstanding books voucher lines.
 * Rule constraints:
 * - Bank Statement Credit (Deposit) maps to Books Ledger Line DEBIT (Dr)
 * - Bank Statement Debit (Withdrawal) maps to Books Ledger Line CREDIT (Cr)
 * - Date window: Statement date must be within -3 to +15 days of books voucher date.
 */
export function matchStatementWithBooks(
  statementRows: BankStatementRow[],
  unreconciledBookRows: ReconcileRow[]
): MatchResult[] {
  const matchedBookIds = new Set<string>();

  return statementRows.map(stmt => {
    // 1. Filter candidates by amount and inverse books drCr direction
    const expectedDrCr = stmt.type === 'Cr' ? 'Dr' : 'Cr';
    const targetAmt = Math.abs(stmt.amountPaise);

    const candidates = unreconciledBookRows.filter(book => {
      if (matchedBookIds.has(book.lineId)) return false;
      if (book.amountPaise !== targetAmt) return false;
      if (book.drCr !== expectedDrCr) return false;
      return true;
    });

    if (candidates.length === 0) {
      return { statementRow: stmt, matchType: 'none', potentialMatches: [] };
    }

    // 2. Proximity Date Check (-3 days to +15 days window)
    // Clearances usually happen on or after the books voucher date.
    const stmtTime = stmt.date.getTime();
    const msInDay = 24 * 60 * 60 * 1000;

    const exactMatchCandidates = candidates.filter(book => {
      const diffDays = (stmtTime - book.date.getTime()) / msInDay;
      return diffDays >= -3 && diffDays <= 15;
    });

    if (exactMatchCandidates.length > 0) {
      // Pick the chronologically closest match
      exactMatchCandidates.sort((a, b) => {
        const diffA = Math.abs(stmtTime - a.date.getTime());
        const diffB = Math.abs(stmtTime - b.date.getTime());
        return diffA - diffB;
      });

      const matched = exactMatchCandidates[0]!;
      matchedBookIds.add(matched.lineId);

      return {
        statementRow: stmt,
        matchedBookRow: matched,
        matchType: 'exact',
        potentialMatches: exactMatchCandidates,
      };
    }

    // 3. If no date proximity match, offer them as potential manual linkages
    return {
      statementRow: stmt,
      matchType: 'partial',
      potentialMatches: candidates,
    };
  });
}
