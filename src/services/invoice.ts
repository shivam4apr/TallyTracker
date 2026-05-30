/**
 * TallyTracker — Invoice PDF Generation Service
 *
 * Generates a professional, beautiful, and GST-compliant Tax Invoice PDF.
 * Formatted perfectly to fit A4 paper margins and matches high-quality Indian corporate standards:
 * - Proper serif columns, neat tables, GST rate splits, and authorized signatory footers.
 * - Dynamic buyer & consignee billing card display.
 * - Real-time Indian currency-to-words translation.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Entity, Party, VoucherLine } from '@/db';
import { formatPaise } from '@/utils/money';
import { formatDateShort } from '@/utils/date';
import { VOUCHER_TYPE_LABELS } from '@/utils/constants';

interface InvoiceLineItem {
  sNo: number;
  description: string;
  hsnSac: string;
  taxableValuePaise: number;
  gstRate: number;
  cgstRate: number;
  cgstPaise: number;
  sgstRate: number;
  sgstPaise: number;
  igstRate: number;
  igstPaise: number;
  totalPaise: number;
  stockItemName?: string;
  stockQty?: number;
  discountPercent?: number;
}

const STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh'
};

/**
 * Converts numeric Paise values into standard Indian numbering system words.
 * Handles Crores, Lakhs, Thousands, Hundreds, and decimal Paise.
 */
export function amountToWords(amountPaise: number): string {
  const amountRupees = Math.floor(amountPaise / 100);
  if (amountRupees === 0 && amountPaise % 100 === 0) return 'Zero Rupees Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];

  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  function convertLessThanThousand(num: number): string {
    if (num === 0) return '';
    let str = '';
    if (num >= 100) {
      str += ones[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }
    if (num >= 20) {
      str += tens[Math.floor(num / 10)] + ' ';
      num %= 10;
    }
    if (num > 0) {
      str += ones[num] + ' ';
    }
    return str.trim();
  }

  let temp = amountRupees;
  let words = '';

  const crore = Math.floor(temp / 10000000);
  temp %= 10000000;

  const lakh = Math.floor(temp / 100000);
  temp %= 100000;

  const thousand = Math.floor(temp / 1000);
  temp %= 1000;

  if (crore > 0) {
    words += convertLessThanThousand(crore) + ' Crore ';
  }
  if (lakh > 0) {
    words += convertLessThanThousand(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    words += convertLessThanThousand(thousand) + ' Thousand ';
  }
  if (temp > 0) {
    words += convertLessThanThousand(temp) + ' ';
  }

  const paise = amountPaise % 100;
  let paiseWords = '';
  if (paise > 0) {
    paiseWords = ' and ' + convertLessThanThousand(paise) + ' Paise';
  }

  return 'Rupees ' + (words.trim() || 'Zero') + paiseWords + ' Only';
}

/**
 * Compiles a GST sales voucher into a structured HTML template and initiates native printing/sharing.
 */
export async function generateInvoicePdf(
  entity: Entity,
  voucher: any,
  vLines: VoucherLine[],
  printableLines: any[],
  party: Party | null
) {
  const dateStr = formatDateShort(voucher.date);
  const invoiceNo = voucher.number;
  const refNo = voucher.refNumber || '—';

  // 1. Compute totals and separate line items
  let totalTaxablePaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;
  let totalInvoicePaise = 0;

  const items: InvoiceLineItem[] = [];
  let sNoCounter = 1;

  printableLines.forEach((line) => {
    // In TallyTracker Sales vouchers:
    // - Dr lines are customer debit accounts (gross receivable).
    // - Cr lines are sales revenue accounts (carrying base taxable value & taxes).
    if (line.drCr === 'Cr') {
      const taxable = line.amountPaise;
      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      line.taxes.forEach((tax: any) => {
        if (tax.type === 'cgst') cgst += tax.amountPaise;
        if (tax.type === 'sgst') sgst += tax.amountPaise;
        if (tax.type === 'igst') igst += tax.amountPaise;
      });

      const lineTotal = taxable + cgst + sgst + igst;

      totalTaxablePaise += taxable;
      totalCgstPaise += cgst;
      totalSgstPaise += sgst;
      totalIgstPaise += igst;
      totalInvoicePaise += lineTotal;

      const halfRate = line.gstRate / 2;

      items.push({
        sNo: sNoCounter++,
        description: line.ledgerName,
        hsnSac: line.hsnSac || '—',
        taxableValuePaise: taxable,
        gstRate: line.gstRate,
        cgstRate: line.gstType === 'intrastate' ? halfRate : 0,
        cgstPaise: cgst,
        sgstRate: line.gstType === 'intrastate' ? halfRate : 0,
        sgstPaise: sgst,
        igstRate: line.gstType === 'interstate' ? line.gstRate : 0,
        igstPaise: igst,
        totalPaise: lineTotal,
        stockItemName: line.stockItemName || undefined,
        stockQty: line.stockQty || undefined,
        discountPercent: line.discountPercent || undefined,
      });
    }
  });

  // Fallback: If no Credit lines are configured (unlikely but safe), use Debit sum as Invoice Total
  if (totalInvoicePaise === 0) {
    printableLines.forEach((line) => {
      if (line.drCr === 'Dr') {
        totalInvoicePaise += line.amountPaise;
      }
    });
  }

  // Calculate total savings from item discounts
  let totalSavingsPaise = 0;
  printableLines.forEach((line) => {
    if (line.drCr === 'Cr' && line.discountPercent && line.discountPercent > 0) {
      const disc = line.discountPercent;
      const taxable = line.amountPaise;
      const gross = Math.round(taxable / (1 - disc / 100));
      totalSavingsPaise += (gross - taxable);
    }
  });

  // 2. Build HSN tax summary aggregates
  const hsnMap = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number; rate: number }>();
  items.forEach((item) => {
    const key = `${item.hsnSac}_${item.gstRate}`;
    const exist = hsnMap.get(key) || { taxable: 0, cgst: 0, sgst: 0, igst: 0, rate: item.gstRate };
    exist.taxable += item.taxableValuePaise;
    exist.cgst += item.cgstPaise;
    exist.sgst += item.sgstPaise;
    exist.igst += item.igstPaise;
    hsnMap.set(key, exist);
  });

  // HSN Rows HTML
  const hsnRowsHtml = Array.from(hsnMap.entries()).map(([key, data]) => {
    const parts = key.split('_');
    const hsn = parts[0] || '—';
    const halfRate = data.rate / 2;

    return `
      <tr>
        <td>${hsn}</td>
        <td align="right" class="amount">${formatPaise(data.taxable)}</td>
        ${
          totalIgstPaise === 0
            ? `
              <td align="center">${halfRate}%</td>
              <td align="right" class="amount">${formatPaise(data.cgst)}</td>
              <td align="center">${halfRate}%</td>
              <td align="right" class="amount">${formatPaise(data.sgst)}</td>
            `
            : `
              <td align="center">${data.rate}%</td>
              <td align="right" class="amount">${formatPaise(data.igst)}</td>
            `
        }
        <td align="right" class="amount" style="font-weight: bold;">${formatPaise(data.cgst + data.sgst + data.igst)}</td>
      </tr>
    `;
  }).join('');

  // 3. Build invoice line item rows
  const lineItemsHtml = items.map((item) => {
    return `
      <tr class="item-row">
        <td align="center" style="padding-top: 10px; padding-bottom: 10px;">${item.sNo}</td>
        <td>
          <strong>${item.description}</strong>
          ${item.stockItemName ? `<br/><small style="color: #555;">Linked Item: ${item.stockItemName} (Qty: ${item.stockQty || 1})</small>` : ''}
          ${item.discountPercent !== undefined && item.discountPercent > 0 ? `<br/><small style="color: #059669; font-weight: bold;">Discount: ${item.discountPercent}%</small>` : ''}
        </td>
        <td align="center">${item.hsnSac}</td>
        <td align="right" class="amount">${formatPaise(item.taxableValuePaise)}</td>
        ${
          totalIgstPaise === 0
            ? `
              <td align="right" class="amount">${item.cgstPaise > 0 ? `${item.cgstRate}%<br/><small style="color: #666;">${formatPaise(item.cgstPaise)}</small>` : '—'}</td>
              <td align="right" class="amount">${item.sgstPaise > 0 ? `${item.sgstRate}%<br/><small style="color: #666;">${formatPaise(item.sgstPaise)}</small>` : '—'}</td>
            `
            : `
              <td align="right" class="amount">${item.igstPaise > 0 ? `${item.igstRate}%<br/><small style="color: #666;">${formatPaise(item.igstPaise)}</small>` : '—'}</td>
            `
        }
        <td align="right" class="amount" style="font-weight: bold; padding-top: 10px; padding-bottom: 10px;">${formatPaise(item.totalPaise)}</td>
      </tr>
    `;
  }).join('');

  const entityStateCode = entity.gstin ? entity.gstin.substring(0, 2) : '07';
  const entityStateName = STATE_CODES[entityStateCode] || 'Delhi';
  const partyStateCode = party && party.gstin ? party.gstin.substring(0, 2) : party && party.stateCode ? party.stateCode : '07';
  const partyStateName = STATE_CODES[partyStateCode] || 'Delhi';

  // Construct dynamic UPI payment URL
  const upiUrl = `upi://pay?pa=pay@tallytracker&pn=${encodeURIComponent(entity.name)}&am=${(totalInvoicePaise / 100).toFixed(2)}&cu=INR`;

  // 4. Construct beautiful GST-compliant markup
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Tax Invoice - ${invoiceNo}</title>
        <style>
          body {
            font-family: 'Georgia', 'Times New Roman', serif;
            color: #1a1a1a;
            background-color: #ffffff;
            margin: 0;
            padding: 10px;
            font-size: 10.5px;
            line-height: 1.35;
          }
          .invoice-box {
            border: 2px solid #000000;
            padding: 0;
            position: relative;
            background: #fff;
          }
          .title-header {
            text-align: center;
            border-bottom: 2px solid #000000;
            background-color: #f5f5f5;
            padding: 6px;
            font-size: 14px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 2px;
          }
          .grid-row {
            display: flex;
            width: 100%;
            border-bottom: 1px solid #000000;
          }
          .grid-col {
            flex: 1;
            padding: 8px;
            border-right: 1px solid #000000;
            box-sizing: border-box;
          }
          .grid-col:last-child {
            border-right: none;
          }
          .label-muted {
            font-size: 8.5px;
            text-transform: uppercase;
            color: #555555;
            font-weight: bold;
            display: block;
            margin-bottom: 4px;
          }
          .company-name {
            font-size: 15px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 0 0 4px 0;
          }
          .party-details {
            font-size: 11px;
            margin-top: 3px;
          }
          .meta-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10.5px;
          }
          .meta-table td {
            padding: 4px 0;
            border: none;
          }
          .main-items-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            border-bottom: 1px solid #000000;
          }
          .main-items-table th, .main-items-table td {
            border-right: 1px solid #000000;
            border-bottom: 1px solid #d3d3d3;
            padding: 6px 8px;
            vertical-align: middle;
          }
          .main-items-table th {
            border-bottom: 2px solid #000000;
            background-color: #f7f7f7;
            font-weight: bold;
            font-size: 9.5px;
            text-transform: uppercase;
          }
          .main-items-table th:last-child, .main-items-table td:last-child {
            border-right: none;
          }
          .main-items-table tr:last-child td {
            border-bottom: none;
          }
          .total-summary-row td {
            font-weight: bold;
            background-color: #fcfcfc !important;
            border-top: 2px solid #000000;
            border-bottom: none;
            padding: 8px;
          }
          .hsn-summary-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.5px;
            margin: 0;
            border-bottom: 1px solid #000000;
          }
          .hsn-summary-table th, .hsn-summary-table td {
            border: 1px solid #000000;
            padding: 5px 6px;
          }
          .hsn-summary-table th {
            background-color: #f7f7f7;
            font-weight: bold;
            text-transform: uppercase;
          }
          .amount {
            font-family: 'Courier New', monospace;
            font-weight: 500;
          }
          .words-declaration {
            padding: 10px;
            font-size: 10px;
            border-bottom: 1px solid #000000;
          }
          .footer-section {
            display: flex;
            width: 100%;
            min-height: 90px;
          }
          .terms-box {
            flex: 1.3;
            padding: 10px;
            border-right: 1px solid #000000;
            font-size: 8.5px;
            color: #555555;
          }
          .signatory-box {
            flex: 1;
            padding: 10px;
            text-align: right;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .stamp-cancelled {
            position: absolute;
            top: 25%;
            left: 20%;
            right: 20%;
            border: 6px solid rgba(217, 83, 79, 0.25);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            transform: rotate(-12deg);
            background-color: transparent;
            pointer-events: none;
            z-index: 9999;
          }
          .stamp-cancelled-text {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            font-weight: bold;
            font-size: 60px;
            color: rgba(217, 83, 79, 0.25);
            letter-spacing: 8px;
          }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          
          ${
            voucher.isCancelled
              ? `<div class="stamp-cancelled">
                  <div class="stamp-cancelled-text">CANCELLED</div>
                 </div>`
              : ''
          }

          <div class="title-header">Tax Invoice</div>

          <!-- Section 1: Seller vs Invoice Details -->
          <div class="grid-row" style="min-height: 120px;">
            <div class="grid-col" style="flex: 1.2;">
              <span class="label-muted">Seller (Supplier)</span>
              <h1 class="company-name">${entity.name}</h1>
              <div class="party-details">
                ${entity.address ? entity.address.replace(/\n/g, '<br/>') : 'Address not registered'}<br/>
                ${entity.gstin ? `<strong>GSTIN:</strong> ${entity.gstin}<br/>` : ''}
                ${entity.pan ? `<strong>PAN:</strong> ${entity.pan}<br/>` : ''}
                <strong>State:</strong> ${entityStateName} (Code: ${entityStateCode})
              </div>
            </div>
            <div class="grid-col">
              <table class="meta-table">
                <tr>
                  <td><span class="label-muted">Invoice No.</span><strong>${invoiceNo}</strong></td>
                  <td><span class="label-muted">Dated</span><strong>${dateStr}</strong></td>
                </tr>
                <tr>
                  <td><span class="label-muted">Ref. No. / Order No.</span>${refNo}</td>
                  <td><span class="label-muted">Place of Supply</span>${party && party.gstin ? (party.billingAddress ? party.billingAddress.split('\n').pop() : 'General') : 'General'}</td>
                </tr>
                <tr>
                  <td colspan="2">
                    <span class="label-muted">Terms of Payment</span>
                    ${party && party.creditDays ? `${party.creditDays} Days Credit` : 'Immediate'}
                  </td>
                </tr>
              </table>
            </div>
          </div>

          <!-- Section 2: Buyer vs Consignee -->
          <div class="grid-row" style="min-height: 110px;">
            <div class="grid-col">
              <span class="label-muted">Buyer (Billed To)</span>
              <div class="party-details" style="font-weight: bold; font-size: 12px; margin-bottom: 2px;">
                ${party ? party.name : printableLines.find(l => l.drCr === 'Dr')?.ledgerName || 'Cash Client / General'}
              </div>
              <div class="party-details">
                ${party && party.billingAddress ? party.billingAddress.replace(/\n/g, '<br/>') : 'Address not recorded'}<br/>
                ${party && party.gstin ? `<strong>GSTIN/UIN:</strong> ${party.gstin}<br/>` : ''}
                ${party && party.pan ? `<strong>PAN:</strong> ${party.pan}<br/>` : ''}
                ${party && party.phone ? `<strong>Phone:</strong> ${party.phone} ` : ''}
                ${party && party.email ? `<strong>Email:</strong> ${party.email}<br/>` : ''}
                <strong>State:</strong> ${partyStateName} (Code: ${partyStateCode})
              </div>
            </div>
            <div class="grid-col">
              <span class="label-muted">Consignee (Shipped To)</span>
              <div class="party-details" style="font-weight: bold; font-size: 12px; margin-bottom: 2px;">
                ${party ? party.name : 'Cash Client / General'}
              </div>
              <div class="party-details">
                ${party && party.shippingAddress ? party.shippingAddress.replace(/\n/g, '<br/>') : party && party.billingAddress ? party.billingAddress.replace(/\n/g, '<br/>') : 'Address not recorded'}<br/>
                ${party && party.gstin ? `<strong>GSTIN/UIN:</strong> ${party.gstin}<br/>` : ''}
                <strong>State:</strong> ${partyStateName} (Code: ${partyStateCode})
              </div>
            </div>
          </div>

          <!-- Section 3: Particulars & Calculations -->
          <table class="main-items-table">
            <thead>
              <tr>
                <th width="5%" align="center">S.No</th>
                <th width="45%" align="left">Description of Goods / Services</th>
                <th width="12%" align="center">HSN/SAC</th>
                <th width="13%" align="right">Taxable Value (₹)</th>
                ${
                  totalIgstPaise === 0
                    ? `
                      <th width="10%" align="right">CGST</th>
                      <th width="10%" align="right">SGST</th>
                    `
                    : `
                      <th width="20%" align="right">IGST</th>
                    `
                }
                <th width="15%" align="right">Total Value (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${lineItemsHtml}
              
              <!-- Total calculations bottom footer row -->
              <tr class="total-summary-row">
                <td></td>
                <td align="left">TOTALS</td>
                <td></td>
                <td align="right" class="amount">${formatPaise(totalTaxablePaise)}</td>
                ${
                  totalIgstPaise === 0
                    ? `
                      <td align="right" class="amount">${formatPaise(totalCgstPaise)}</td>
                      <td align="right" class="amount">${formatPaise(totalSgstPaise)}</td>
                    `
                    : `
                      <td align="right" class="amount">${formatPaise(totalIgstPaise)}</td>
                    `
                }
                <td align="right" class="amount" style="font-size: 11px;">${formatPaise(totalInvoicePaise)}</td>
              </tr>
            </tbody>
          </table>

          <!-- Section 4: Indian Currency Words Aggregate -->
          <div class="words-declaration">
            <span class="label-muted" style="margin-bottom: 2px;">Amount Chargeable (in words)</span>
            <div style="font-weight: bold; font-size: 11.5px; font-style: italic;">
              ${amountToWords(totalInvoicePaise)}
            </div>
          </div>

          ${
            totalSavingsPaise > 0
              ? `
                <div style="margin: 8px 10px; padding: 8px; background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; font-family: sans-serif;">
                  <span style="color: #065f46; font-weight: bold; font-size: 10px;">🎉 PREMIUM CUSTOMER SAVINGS</span>
                  <span style="color: #047857; font-weight: 800; font-size: 11px; font-family: monospace;">Total Savings on this Invoice: ₹${(totalSavingsPaise / 100).toFixed(2)}</span>
                </div>
              `
              : ''
          }

          <!-- Section 5: HSN GST Breakdowns -->
          <div class="words-declaration" style="padding: 0; background-color: #fafafa;">
            <div style="padding: 6px 10px; font-weight: bold; font-size: 8.5px; text-transform: uppercase; color: #555555; border-bottom: 1px solid #000;">
              GST Tax Computation Summary
            </div>
            <table class="hsn-summary-table">
              <thead>
                <tr>
                  <th align="left" width="20%">HSN/SAC</th>
                  <th align="right" width="20%">Taxable Value (₹)</th>
                  ${
                    totalIgstPaise === 0
                      ? `
                        <th align="center" width="10%">CGST Rate</th>
                        <th align="right" width="15%">CGST (₹)</th>
                        <th align="center" width="10%">SGST Rate</th>
                        <th align="right" width="15%">SGST (₹)</th>
                      `
                      : `
                        <th align="center" width="20%">IGST Rate</th>
                        <th align="right" width="30%">IGST (₹)</th>
                      `
                  }
                  <th align="right" width="20%">Total Tax (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${hsnRowsHtml}
                <tr style="font-weight: bold; background-color: #eee;">
                  <td>TOTALS</td>
                  <td align="right" class="amount">${formatPaise(totalTaxablePaise)}</td>
                  ${
                    totalIgstPaise === 0
                      ? `
                        <td></td>
                        <td align="right" class="amount">${formatPaise(totalCgstPaise)}</td>
                        <td></td>
                        <td align="right" class="amount">${formatPaise(totalSgstPaise)}</td>
                      `
                      : `
                        <td></td>
                        <td align="right" class="amount">${formatPaise(totalIgstPaise)}</td>
                      `
                  }
                  <td align="right" class="amount">${formatPaise(totalCgstPaise + totalSgstPaise + totalIgstPaise)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Section 6: Terms and Signatures -->
          <div class="footer-section">
            <div class="terms-box">
              <strong>Declaration / Terms:</strong><br/>
              1. We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.<br/>
              2. Interest @ 18% p.a. will be charged if payment is not received within credit terms.<br/>
              3. All disputes are subject to local state jurisdiction.<br/>
              <br/>
              <span style="font-style: italic; color: #777;">This is a computer generated invoice and requires no physical signature.</span>
            </div>
            <!-- UPI QR CODE -->
            <div style="flex: 0.8; padding: 10px; text-align: center; border-right: 1px solid #000000; border-top: none; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <span class="label-muted" style="margin-bottom: 6px; font-size: 8px;">Scan & Pay UPI</span>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=85x85&data=${encodeURIComponent(upiUrl)}" style="width: 85px; height: 85px; border: 1px solid #ddd; padding: 4px; border-radius: 4px;" />
              <span style="font-size: 8px; color: #666; margin-top: 4px; font-weight: bold; font-family: sans-serif;">pay@tallytracker</span>
            </div>
            <div class="signatory-box">
              <span class="label-muted" style="text-align: right;">For ${entity.name}</span>
              <br/><br/>
              <div style="font-weight: bold; border-top: 1px dashed #000; padding-top: 4px; display: inline-block; width: 80%; align-self: flex-end; font-size: 10px;">
                Authorized Signatory
              </div>
            </div>
          </div>

        </div>
      </body>
    </html>
  `;

  // 5. Build native printable sheet
  const printToFileResult = await Print.printToFileAsync({ html });

  // 6. Share compiled invoice file natively
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(printToFileResult.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Invoice_${invoiceNo.replace(/\//g, '-')}`,
      UTI: 'com.adobe.pdf',
    });
  }
}
