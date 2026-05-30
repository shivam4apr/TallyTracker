/**
 * TallyTracker — PDF Statement Generator Service
 *
 * Compiles accounting statements into compact, print-ready, high-fidelity PDFs.
 * Styled to look exactly like standard, high-quality Tally ERP 9 accounting sheets:
 * - Proper serif columns, borders, and double underlines for totals.
 * - Auto-scaling to fit A4 paper margins.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Entity } from '@/db';
import { formatPaise } from '@/utils/money';
import { formatDateShort } from '@/utils/date';
import { VOUCHER_TYPE_LABELS } from '@/utils/constants';


interface TrialItem {
  name: string;
  groupName: string;
  nature: string;
  openingPaise: number;
  openingDrCr: string;
  periodDrPaise: number;
  periodCrPaise: number;
  closingPaise: number;
  closingDrCr: string;
}

interface PLItem {
  name: string;
  amount: number;
}

interface BSItem {
  name: string;
  amount: number;
}

export async function exportReportToPdf(
  entity: Entity,
  tab: 'trial' | 'pl' | 'bs' | 'gstr1' | 'gstr3b' | 'salesReg' | 'purchaseReg' | 'receivables' | 'payables' | 'cashflow',
  startDate: Date,
  endDate: Date,
  data: any
) {
  const isHindi = false; // Localization fallback
  const dateRangeStr = `${formatDateShort(startDate)} to ${formatDateShort(endDate)}`;
  
  let reportTitle = '';
  let contentHtml = '';

  if (tab === 'trial') {
    reportTitle = 'Trial Balance';
    const items = data.ledgerBalances as TrialItem[];
    const totals = data.totals as { drSum: number; crSum: number; isBalanced: boolean };

    contentHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th align="left">Ledger Account</th>
            <th align="left">Account Group</th>
            <th align="right">Debit (₹)</th>
            <th align="right">Credit (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((b) => {
              const isDr = b.closingDrCr === 'Dr';
              return `
                <tr>
                  <td><strong>${b.name}</strong></td>
                  <td>${b.groupName}</td>
                  <td align="right" class="amount">${isDr && b.closingPaise > 0 ? formatPaise(b.closingPaise) : '—'}</td>
                  <td align="right" class="amount">${!isDr && b.closingPaise > 0 ? formatPaise(b.closingPaise) : '—'}</td>
                </tr>
              `;
            })
            .join('')}
          <tr class="total-row">
            <td>TOTALS</td>
            <td></td>
            <td align="right" class="amount">${formatPaise(totals.drSum)}</td>
            <td align="right" class="amount">${formatPaise(totals.crSum)}</td>
          </tr>
        </tbody>
      </table>
      <div class="balanced-banner ${totals.isBalanced ? 'success' : 'error'}">
        Status: ${totals.isBalanced ? 'Trial Balance is Balanced' : 'Trial Balance Out of Balance!'}
      </div>
    `;
  } else if (tab === 'pl') {
    reportTitle = 'Profit & Loss Statement';
    const directIncomes = data.directIncomes as PLItem[];
    const directExpenses = data.directExpenses as PLItem[];
    const grossProfit = data.grossProfit as number;
    const indirectIncomes = data.indirectIncomes as PLItem[];
    const indirectExpenses = data.indirectExpenses as PLItem[];
    const netProfit = data.netProfit as number;

    const sumList = (arr: PLItem[]) => arr.reduce((s, x) => s + x.amount, 0);

    contentHtml = `
      <div class="two-col-layout">
        <!-- Direct Operations -->
        <div class="col-box">
          <h3>Trading Account (Direct Incomes & Expenses)</h3>
          <table class="report-table compact">
            <thead>
              <tr>
                <th align="left">Particulars</th>
                <th align="right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="2"><strong>Direct Revenues (Sales)</strong></td></tr>
              ${directIncomes.map(i => `<tr><td class="indent">${i.name}</td><td align="right">${formatPaise(i.amount)}</td></tr>`).join('')}
              <tr class="subtotal-row"><td>Total Direct Revenues (A)</td><td align="right">${formatPaise(sumList(directIncomes))}</td></tr>
              
              <tr><td colspan="2"><strong>Direct Expenses (Purchases)</strong></td></tr>
              ${directExpenses.map(e => `<tr><td class="indent">${e.name}</td><td align="right">${formatPaise(e.amount)}</td></tr>`).join('')}
              <tr class="subtotal-row"><td>Total Direct Expenses (B)</td><td align="right">${formatPaise(sumList(directExpenses))}</td></tr>
              
              <tr class="total-row">
                <td><strong>GROSS ${grossProfit >= 0 ? 'PROFIT' : 'LOSS'} (A - B)</strong></td>
                <td align="right"><strong>${formatPaise(grossProfit)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Indirect Operations -->
        <div class="col-box">
          <h3>Profit & Loss (Overheads & Net Profit)</h3>
          <table class="report-table compact">
            <thead>
              <tr>
                <th align="left">Particulars</th>
                <th align="right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Gross ${grossProfit >= 0 ? 'Profit' : 'Loss'} b/f</td><td align="right">${formatPaise(grossProfit)}</td></tr>
              
              <tr><td colspan="2"><strong>Indirect Incomes</strong></td></tr>
              ${indirectIncomes.map(i => `<tr><td class="indent">${i.name}</td><td align="right">${formatPaise(i.amount)}</td></tr>`).join('')}
              <tr class="subtotal-row"><td>Total Indirect Incomes</td><td align="right">${formatPaise(sumList(indirectIncomes))}</td></tr>
              
              <tr><td colspan="2"><strong>Indirect Expenses (Overheads)</strong></td></tr>
              ${indirectExpenses.map(e => `<tr><td class="indent">${e.name}</td><td align="right">${formatPaise(e.amount)}</td></tr>`).join('')}
              <tr class="subtotal-row"><td>Total Indirect Expenses</td><td align="right">${formatPaise(sumList(indirectExpenses))}</td></tr>
              
              <tr class="total-row highlight">
                <td><strong>NET ${netProfit >= 0 ? 'PROFIT' : 'LOSS'}</strong></td>
                <td align="right"><strong>${formatPaise(netProfit)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (tab === 'bs') {
    reportTitle = 'Balance Sheet';
    const assets = data.assetsList as BSItem[];
    const liabilities = data.liabilitiesList as BSItem[];
    const totalAssets = data.totalAssets as number;
    const totalLiab = data.totalLiab as number;
    const isBalanced = data.isBalanced as boolean;

    contentHtml = `
      <div class="two-col-layout">
        <!-- Assets Column -->
        <div class="col-box">
          <h3>ASSETS</h3>
          <table class="report-table compact">
            <thead>
              <tr>
                <th align="left">Asset Ledger</th>
                <th align="right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${assets.map(a => `<tr><td>${a.name}</td><td align="right">${formatPaise(a.amount)}</td></tr>`).join('')}
              <tr class="total-row">
                <td>TOTAL ASSETS</td>
                <td align="right">${formatPaise(totalAssets)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Liabilities Column -->
        <div class="col-box">
          <h3>LIABILITIES & CAPITAL</h3>
          <table class="report-table compact">
            <thead>
              <tr>
                <th align="left">Liability / Capital</th>
                <th align="right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${liabilities.map(l => `<tr><td>${l.name}</td><td align="right">${formatPaise(l.amount)}</td></tr>`).join('')}
              <tr class="total-row">
                <td>TOTAL LIABILITIES & CAPITAL</td>
                <td align="right">${formatPaise(totalLiab)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="balanced-banner ${isBalanced ? 'success' : 'error'}">
        Status: ${isBalanced ? 'Balance Sheet is Balanced' : 'Accounts are Out of Balance!'}
      </div>
    `;
  } else if (tab === 'gstr1') {
    reportTitle = 'GSTR-1 Outward Supplies Summary';
    const records = data.records as { hsnSac: string; rate: number; taxableValuePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }[];

    contentHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th align="left">HSN/SAC</th>
            <th align="right">Tax Rate (%)</th>
            <th align="right">Taxable Value (₹)</th>
            <th align="right">CGST (₹)</th>
            <th align="right">SGST (₹)</th>
            <th align="right">IGST (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${records.map(r => `
            <tr>
              <td><strong>${r.hsnSac}</strong></td>
              <td align="right">${r.rate}%</td>
              <td align="right" class="amount">${formatPaise(r.taxableValuePaise)}</td>
              <td align="right" class="amount">${formatPaise(r.cgstPaise)}</td>
              <td align="right" class="amount">${formatPaise(r.sgstPaise)}</td>
              <td align="right" class="amount">${formatPaise(r.igstPaise)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (tab === 'gstr3b') {
    reportTitle = 'GSTR-3B Monthly Filing Summary';
    const outward31 = data.outward31 as { value: number; cgst: number; sgst: number; igst: number };
    const eligible4 = data.eligible4 as { cgst: number; sgst: number; igst: number };
    const netPayable = data.netPayable as { cgst: number; sgst: number; igst: number };

    contentHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th align="left">GST return Section</th>
            <th align="right">Taxable Value (₹)</th>
            <th align="right">Integrated Tax (IGST)</th>
            <th align="right">Central Tax (CGST)</th>
            <th align="right">State Tax (SGST)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>3.1 Outward Taxable Supplies</strong></td>
            <td align="right" class="amount">${formatPaise(outward31.value)}</td>
            <td align="right" class="amount">${formatPaise(outward31.igst)}</td>
            <td align="right" class="amount">${formatPaise(outward31.cgst)}</td>
            <td align="right" class="amount">${formatPaise(outward31.sgst)}</td>
          </tr>
          <tr>
            <td><strong>4 Eligible Input Tax Credit (ITC)</strong></td>
            <td align="right" class="amount">0.00</td>
            <td align="right" class="amount">${formatPaise(eligible4.igst)}</td>
            <td align="right" class="amount">${formatPaise(eligible4.cgst)}</td>
            <td align="right" class="amount">${formatPaise(eligible4.sgst)}</td>
          </tr>
          <tr class="total-row highlight">
            <td><strong>Net Tax Liability Payable</strong></td>
            <td align="right" class="amount">—</td>
            <td align="right" class="amount">${formatPaise(netPayable.igst)}</td>
            <td align="right" class="amount">${formatPaise(netPayable.cgst)}</td>
            <td align="right" class="amount">${formatPaise(netPayable.sgst)}</td>
          </tr>
        </tbody>
      </table>
    `;
  } else if (tab === 'salesReg' || tab === 'purchaseReg') {
    reportTitle = tab === 'salesReg' ? 'Sales Register' : 'Purchase Register';
    const items = data.registers as any[];
    const totals = data.totals as any;

    contentHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th align="left">Date</th>
            <th align="left">Voucher No</th>
            <th align="left">Ref No</th>
            <th align="left">Party Account Name</th>
            <th align="right">Taxable Value (₹)</th>
            <th align="right">CGST (₹)</th>
            <th align="right">SGST (₹)</th>
            <th align="right">IGST (₹)</th>
            <th align="right">Total Value (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td>${formatDateShort(r.date)}</td>
              <td><strong>${r.number}</strong></td>
              <td>${r.refNumber || '—'}</td>
              <td>${r.partyName}</td>
              <td align="right" class="amount">${formatPaise(r.taxablePaise)}</td>
              <td align="right" class="amount">${formatPaise(r.cgstPaise)}</td>
              <td align="right" class="amount">${formatPaise(r.sgstPaise)}</td>
              <td align="right" class="amount">${formatPaise(r.igstPaise)}</td>
              <td align="right" class="amount"><strong>${formatPaise(r.totalPaise)}</strong></td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="4">TOTALS</td>
            <td align="right" class="amount">${formatPaise(totals.taxableSum)}</td>
            <td align="right" class="amount">${formatPaise(totals.cgstSum)}</td>
            <td align="right" class="amount">${formatPaise(totals.sgstSum)}</td>
            <td align="right" class="amount">${formatPaise(totals.igstSum)}</td>
            <td align="right" class="amount">${formatPaise(totals.totalSum)}</td>
          </tr>
        </tbody>
      </table>
    `;
  } else if (tab === 'receivables' || tab === 'payables') {
    reportTitle = tab === 'receivables' ? 'Outstanding Receivables' : 'Outstanding Payables';
    const items = data.outstandings as any[];
    const totals = data.totals as any;

    contentHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th align="left">Party / Ledger Account</th>
            <th align="right">Total Outstanding (₹)</th>
            <th align="right">0 - 30 Days (₹)</th>
            <th align="right">31 - 60 Days (₹)</th>
            <th align="right">61 - 90 Days (₹)</th>
            <th align="right">90+ Days (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td><strong>${r.partyName}</strong></td>
              <td align="right" class="amount" style="font-weight: bold;">${formatPaise(r.totalOutstandingPaise)}</td>
              <td align="right" class="amount">${formatPaise(r.bucket0_30)}</td>
              <td align="right" class="amount">${formatPaise(r.bucket31_60)}</td>
              <td align="right" class="amount">${formatPaise(r.bucket61_90)}</td>
              <td align="right" class="amount">${formatPaise(r.bucket90_plus)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td>TOTALS</td>
            <td align="right" class="amount">${formatPaise(totals.outstandingSum)}</td>
            <td align="right" class="amount">${formatPaise(totals.sum0_30)}</td>
            <td align="right" class="amount">${formatPaise(totals.sum31_60)}</td>
            <td align="right" class="amount">${formatPaise(totals.sum61_90)}</td>
            <td align="right" class="amount">${formatPaise(totals.sum90_plus)}</td>
          </tr>
        </tbody>
      </table>
    `;
  } else if (tab === 'cashflow') {
    reportTitle = 'Cash Flow Statement';
    
    contentHtml = `
      <table class="report-table" style="max-width: 600px; margin: 0 auto;">
        <thead>
          <tr>
            <th align="left">Particulars</th>
            <th align="right">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="2"><strong>A. Cash Flow from Operating Activities</strong></td></tr>
          <tr><td class="indent">Net Profit Before Tax</td><td align="right" class="amount">${formatPaise(data.netProfit)}</td></tr>
          <tr><td class="indent">Adjustments for Working Capital changes:</td><td align="right"></td></tr>
          <tr><td class="indent" style="padding-left: 30px;">(Increase)/Decrease in Sundry Debtors</td><td align="right" class="amount">${formatPaise(-data.changeInDebtors)}</td></tr>
          <tr><td class="indent" style="padding-left: 30px;">Increase/(Decrease) in Sundry Creditors</td><td align="right" class="amount">${formatPaise(data.changeInCreditors)}</td></tr>
          <tr class="subtotal-row"><td>Net Cash from Operating Activities</td><td align="right" class="amount">${formatPaise(data.operatingCashFlow)}</td></tr>

          <tr><td colspan="2" style="padding-top: 12px;"><strong>B. Cash Flow from Investing Activities</strong></td></tr>
          <tr><td class="indent">Purchase / Sale of Fixed Assets</td><td align="right" class="amount">${formatPaise(-data.changeInFixedAssets)}</td></tr>
          <tr class="subtotal-row"><td>Net Cash used in Investing Activities</td><td align="right" class="amount">${formatPaise(data.investingCashFlow)}</td></tr>

          <tr><td colspan="2" style="padding-top: 12px;"><strong>C. Cash Flow from Financing Activities</strong></td></tr>
          <tr><td class="indent">Infusion / (Drawings) of Capital</td><td align="right" class="amount">${formatPaise(-data.changeInCapital)}</td></tr>
          <tr><td class="indent">Loans Taken / (Repaid)</td><td align="right" class="amount">${formatPaise(-data.changeInLoans)}</td></tr>
          <tr class="subtotal-row"><td>Net Cash from Financing Activities</td><td align="right" class="amount">${formatPaise(data.financingCashFlow)}</td></tr>

          <tr class="total-row highlight" style="font-size: 11px;">
            <td><strong>NET INCREASE / (DECREASE) IN CASH (A + B + C)</strong></td>
            <td align="right" class="amount"><strong>${formatPaise(data.netCashFlow)}</strong></td>
          </tr>
          <tr><td class="indent">Cash & Bank Balance at beginning of period</td><td align="right" class="amount" style="color: #555;">${formatPaise(data.openingCashBank)}</td></tr>
          <tr style="border-bottom: 2px solid #000000;"><td class="indent"><strong>Cash & Bank Balance at end of period</strong></td><td align="right" class="amount"><strong>${formatPaise(data.closingCashBank)}</strong></td></tr>
        </tbody>
      </table>
    `;
  }

  // Double-underlined standard print layout stylesheet
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${reportTitle}</title>
        <style>
          body {
            font-family: 'Georgia', 'Times New Roman', serif;
            color: #1a1a1a;
            background-color: #ffffff;
            margin: 0;
            padding: 20px;
            font-size: 11px;
            line-height: 1.4;
          }
          .header-box {
            text-align: center;
            border-bottom: 2px solid #000000;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .header-box h1 {
            font-size: 18px;
            margin: 0 0 6px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .header-box h2 {
            font-size: 12px;
            margin: 0 0 4px 0;
            font-weight: normal;
          }
          .header-box p {
            margin: 2px 0 0 0;
            color: #555555;
            font-size: 10px;
          }
          .report-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
            font-size: 10px;
          }
          .report-table th, .report-table td {
            border: 1px solid #d3d3d3;
            padding: 8px 10px;
            vertical-align: top;
          }
          .report-table th {
            background-color: #f7f7f7;
            font-weight: bold;
            border-bottom: 2px solid #000000;
          }
          .report-table tr:nth-child(even) td {
            background-color: #fafafa;
          }
          .total-row td {
            font-weight: bold;
            border-top: 2px solid #000000;
            border-bottom: 4px double #000000;
            background-color: #f0f0f0 !important;
          }
          .subtotal-row td {
            font-weight: bold;
            border-top: 1px solid #000000;
            border-bottom: 1px solid #000000;
            background-color: #fcfcfc !important;
          }
          .amount {
            font-family: 'Courier New', monospace;
            font-weight: 500;
          }
          .balanced-banner {
            padding: 10px 14px;
            border-radius: 6px;
            font-weight: bold;
            text-align: center;
            font-size: 11px;
            margin-top: 16px;
          }
          .balanced-banner.success {
            background-color: #e6f4ea;
            color: #137333;
            border: 1px solid #a3cfb4;
          }
          .balanced-banner.error {
            background-color: #fce8e6;
            color: #c5221f;
            border: 1px solid #f5c2c1;
          }
          .two-col-layout {
            display: flex;
            gap: 20px;
            width: 100%;
          }
          .col-box {
            flex: 1;
            min-width: 0;
          }
          .col-box h3 {
            font-size: 11px;
            text-transform: uppercase;
            border-bottom: 1px solid #000000;
            padding-bottom: 4px;
            margin-top: 0;
            margin-bottom: 12px;
          }
          .compact td, .compact th {
            padding: 5px 6px;
          }
          .indent {
            padding-left: 16px !important;
          }
          .highlight td {
            background-color: #fff9db !important;
            border-bottom: 2px solid #f08c00;
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <h1>${entity.name}</h1>
          <h2>${reportTitle}</h2>
          <p>Period: ${dateRangeStr}</p>
          ${
            entity.gstin
              ? `<p style="margin-top: 4px; font-weight: bold;">GSTIN: ${entity.gstin} | PAN: ${entity.pan || '—'}</p>`
              : ''
          }
        </div>
        ${contentHtml}
      </body>
    </html>
  `;

  // Compiles print-ready document and writes local PDF cache file
  const printToFileResult = await Print.printToFileAsync({ html });

  // Share the compiled PDF cache file natively via sheet
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(printToFileResult.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${entity.name.replace(/\s+/g, '_')}_${reportTitle.replace(/\s+/g, '_')}`,
      UTI: 'com.adobe.pdf',
    });
  }
}

export async function shareCsvFile(csvContent: string, fileName: string) {
  try {
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: `Share ${fileName}`,
        UTI: 'public.comma-separated-values-text',
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }
  } catch (error) {
    console.error('Failed to share CSV file:', error);
    throw error;
  }
}

export async function exportVoucherToPdf(
  entity: Entity,
  voucher: any,
  printableLines: any[],
  totalDr: number,
  totalCr: number
) {
  const vchTypeStr = (voucher.voucherType || 'journal').toUpperCase();
  const dateStr = formatDateShort(voucher.date);

  const linesHtml = printableLines.map((line) => {
    const isDr = line.drCr === 'Dr';
    const prefix = isDr ? 'By ' : 'To ';
    
    let mainRow = `
      <tr>
        <td><strong>${prefix}${line.ledgerName}</strong></td>
        <td align="center">${line.hsnSac || '—'}</td>
        <td align="right" class="amount">${isDr ? formatPaise(line.amountPaise) : ''}</td>
        <td align="right" class="amount">${!isDr ? formatPaise(line.amountPaise) : ''}</td>
      </tr>
    `;

    const gstRows = (line.taxes || []).map((tax: any) => {
      const taxName = `&nbsp;&nbsp;&nbsp;&nbsp;${tax.type.toUpperCase()} @ ${tax.rate}%`;
      return `
        <tr style="color: #555555; font-size: 9px;">
          <td style="padding-left: 20px; font-style: italic;">${taxName}</td>
          <td align="center">${line.hsnSac || '—'}</td>
          <td align="right" class="amount">${isDr ? formatPaise(tax.amountPaise) : ''}</td>
          <td align="right" class="amount">${!isDr ? formatPaise(tax.amountPaise) : ''}</td>
        </tr>
      `;
    }).join('');

    return mainRow + gstRows;
  }).join('');

  const cancelledStamp = voucher.isCancelled
    ? `
      <div style="
        position: absolute;
        top: 30%;
        left: 15%;
        right: 15%;
        border: 6px solid rgba(217, 83, 79, 0.25);
        border-radius: 12px;
        padding: 18px;
        text-align: center;
        transform: rotate(-15deg);
        background-color: transparent;
        pointer-events: none;
        z-index: 9999;
      ">
        <span style="font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: bold; font-size: 54px; color: rgba(217, 83, 79, 0.25); letter-spacing: 6px;">CANCELLED</span>
      </div>
    `
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${vchTypeStr} Voucher</title>
        <style>
          body {
            font-family: 'Georgia', 'Times New Roman', serif;
            color: #1a1a1a;
            background-color: #ffffff;
            margin: 0;
            padding: 20px;
            font-size: 11px;
            line-height: 1.4;
            position: relative;
          }
          .header-box {
            text-align: center;
            border-bottom: 2px solid #000000;
            padding-bottom: 10px;
            margin-bottom: 15px;
          }
          .header-box h1 {
            font-size: 18px;
            margin: 0 0 4px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .header-box p {
            margin: 2px 0 0 0;
            color: #555555;
            font-size: 10px;
          }
          .voucher-title {
            text-align: center;
            font-size: 13px;
            font-weight: bold;
            margin: 10px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
            text-decoration: underline;
          }
          .meta-table {
            width: 100%;
            margin-bottom: 15px;
            font-size: 10.5px;
          }
          .meta-table td {
            padding: 3px 0;
          }
          .report-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 10.5px;
          }
          .report-table th, .report-table td {
            border: 1px solid #000000;
            padding: 6px 8px;
            vertical-align: top;
          }
          .report-table th {
            background-color: #f7f7f7;
            font-weight: bold;
            border-bottom: 2px solid #000000;
          }
          .total-row td {
            font-weight: bold;
            border-top: 2px solid #000000;
            border-bottom: 4px double #000000;
            background-color: #f0f0f0 !important;
          }
          .amount {
            font-family: 'Courier New', monospace;
            font-weight: 500;
          }
          .narration-box {
            margin-top: 15px;
            padding: 10px;
            border: 1px solid #000000;
            background-color: #fafafa;
            font-size: 10px;
          }
        </style>
      </head>
      <body>
        ${cancelledStamp}
        <div class="header-box">
          <h1>${entity.name}</h1>
          <p>${entity.address || 'Address not registered'}</p>
          ${
            entity.gstin
              ? `<p style="margin-top: 4px; font-weight: bold;">GSTIN: ${entity.gstin} | PAN: ${entity.pan || '—'}</p>`
              : ''
          }
        </div>
        
        <div class="voucher-title">${vchTypeStr} VOUCHER</div>

        <table class="meta-table">
          <tr>
            <td width="35%">Voucher No: <strong>${voucher.number}</strong></td>
            <td width="30%" align="center">Date: <strong>${dateStr}</strong></td>
            <td width="35%" align="right">${voucher.refNumber ? `Ref No: <strong>${voucher.refNumber}</strong>` : ''}</td>
          </tr>
        </table>

        <table class="report-table">
          <thead>
            <tr>
              <th align="left" width="55%">Particulars</th>
              <th align="center" width="15%">HSN/SAC</th>
              <th align="right" width="15%">Debit (₹)</th>
              <th align="right" width="15%">Credit (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
            <tr class="total-row">
              <td>TOTALS</td>
              <td></td>
              <td align="right" class="amount">${formatPaise(totalDr)}</td>
              <td align="right" class="amount">${formatPaise(totalCr)}</td>
            </tr>
          </tbody>
        </table>

        <div class="narration-box">
          <strong>Narration / Remarks:</strong><br/>
          <span style="font-style: italic;">${voucher.narration || 'No remarks recorded.'}</span>
        </div>
      </body>
    </html>
  `;

  const printToFileResult = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(printToFileResult.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Voucher_${voucher.number}`,
      UTI: 'com.adobe.pdf',
    });
  }
}

export async function exportLedgerToPdf(
  ledger: any,
  group: any,
  entity: Entity,
  auditLines: any[],
  totalDr: number,
  totalCr: number,
  closingBalance: number,
  closingDrCr: string
) {
  const ledgerName = ledger.name;
  const groupName = group.name;
  const natureStr = group.nature.toUpperCase();

  const linesHtml = auditLines.map((line) => {
    const isDr = line.drCr === 'Dr';
    const amountStr = formatPaise(line.amountPaise);
    
    return `
      <tr>
        <td>${formatDateShort(line.date)}</td>
        <td>
          <strong>${VOUCHER_TYPE_LABELS[line.voucherType as keyof typeof VOUCHER_TYPE_LABELS] || line.voucherType}</strong>
          <span style="color: #2b8a3e; font-weight: bold; font-size: 8.5px; margin-left: 5px;">#${line.number}</span>
          ${line.narration ? `<br/><small style="color: #666666; font-style: italic;">"${line.narration}"</small>` : ''}
        </td>
        <td align="right" class="amount">${isDr ? amountStr : '—'}</td>
        <td align="right" class="amount">${!isDr ? amountStr : '—'}</td>
        <td align="right" class="amount">${formatPaise(line.runningBalancePaise)} ${line.runningBalanceDrCr}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Ledger Statement - ${ledgerName}</title>
        <style>
          body {
            font-family: 'Georgia', 'Times New Roman', serif;
            color: #1a1a1a;
            background-color: #ffffff;
            margin: 0;
            padding: 20px;
            font-size: 11px;
            line-height: 1.4;
          }
          .header-box {
            text-align: center;
            border-bottom: 2px solid #000000;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .header-box h1 {
            font-size: 18px;
            margin: 0 0 6px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .header-box p {
            margin: 2px 0 0 0;
            color: #555555;
            font-size: 10px;
          }
          .statement-title {
            text-align: center;
            font-size: 13px;
            font-weight: bold;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
            text-decoration: underline;
          }
          .ledger-meta {
            width: 100%;
            margin-bottom: 15px;
            font-size: 10.5px;
            border-collapse: collapse;
          }
          .ledger-meta td {
            padding: 4px 6px;
            border: 1px solid #d3d3d3;
          }
          .report-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
            font-size: 10px;
          }
          .report-table th, .report-table td {
            border: 1px solid #d3d3d3;
            padding: 7px 9px;
            vertical-align: top;
          }
          .report-table th {
            background-color: #f7f7f7;
            font-weight: bold;
            border-bottom: 2px solid #000000;
          }
          .total-row td {
            font-weight: bold;
            border-top: 2px solid #000000;
            border-bottom: 4px double #000000;
            background-color: #f0f0f0 !important;
          }
          .subtotal-row td {
            font-weight: bold;
            border-top: 1px solid #000000;
            border-bottom: 1px solid #000000;
            background-color: #fcfcfc !important;
          }
          .amount {
            font-family: 'Courier New', monospace;
            font-weight: 500;
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <h1>${entity.name}</h1>
          <p>${entity.address || 'Address not registered'}</p>
          ${
            entity.gstin
              ? `<p style="margin-top: 4px; font-weight: bold;">GSTIN: ${entity.gstin} | PAN: ${entity.pan || '—'}</p>`
              : ''
          }
        </div>
        
        <div class="statement-title">Ledger Account Statement</div>

        <table class="ledger-meta">
          <tr>
            <td width="20%"><strong>Account Name:</strong></td>
            <td width="30%"><strong>${ledgerName}</strong></td>
            <td width="20%"><strong>Account Group:</strong></td>
            <td width="30%">${groupName} (${natureStr})</td>
          </tr>
          <tr>
            <td><strong>Opening Balance:</strong></td>
            <td>${formatPaise(ledger.openingBalancePaise)} ${ledger.openingBalanceDrCr}</td>
            <td><strong>Closing Balance:</strong></td>
            <td><strong>${formatPaise(closingBalance)} ${closingDrCr}</strong></td>
          </tr>
        </table>

        <table class="report-table">
          <thead>
            <tr>
              <th align="left" width="12%">Date</th>
              <th align="left" width="43%">Particulars</th>
              <th align="right" width="15%">Debit (₹)</th>
              <th align="right" width="15%">Credit (₹)</th>
              <th align="right" width="15%">Balance (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td></td>
              <td><strong>Opening Balance</strong></td>
              <td align="right">—</td>
              <td align="right">—</td>
              <td align="right" class="amount"><strong>${formatPaise(ledger.openingBalancePaise)} ${ledger.openingBalanceDrCr}</strong></td>
            </tr>
            ${linesHtml}
            <tr class="total-row">
              <td>TOTALS</td>
              <td>Transactions Total</td>
              <td align="right" class="amount">${formatPaise(totalDr)}</td>
              <td align="right" class="amount">${formatPaise(totalCr)}</td>
              <td></td>
            </tr>
            <tr class="subtotal-row">
              <td><strong>Closing</strong></td>
              <td><strong>Closing Balance</strong></td>
              <td align="right">—</td>
              <td align="right">—</td>
              <td align="right" class="amount"><strong>${formatPaise(closingBalance)} ${closingDrCr}</strong></td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

  const printToFileResult = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(printToFileResult.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Ledger_${ledgerName.replace(/\s+/g, '_')}_Statement`,
      UTI: 'com.adobe.pdf',
    });
  }
}

