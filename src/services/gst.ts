/**
 * TallyTracker — GST Calculation Service
 *
 * Enforces integer arithmetic (paise) for tax computation.
 * Intrastate: split evenly between CGST and SGST.
 * Interstate: full rate applied to IGST.
 * Exempt: 0 tax.
 */

import { SupplyType } from '../utils/constants';

export interface GstResult {
  cgst: number;
  sgst: number;
  igst: number;
}

/**
 * Computes CGST, SGST, and IGST in paise.
 *
 * @param amountPaise - The base amount in paise.
 * @param ratePercent - The total GST rate percentage (e.g. 18 for 18%).
 * @param supplyType - 'intrastate' | 'interstate' | 'exempt'
 */
export function computeGST(
  amountPaise: number,
  ratePercent: number,
  supplyType: SupplyType
): GstResult {
  if (supplyType === 'exempt' || ratePercent === 0 || amountPaise <= 0) {
    return { cgst: 0, sgst: 0, igst: 0 };
  }

  if (supplyType === 'intrastate') {
    const halfRate = ratePercent / 2;
    const cgst = Math.round((amountPaise * halfRate) / 100);
    const sgst = cgst;
    return { cgst, sgst, igst: 0 };
  }

  if (supplyType === 'interstate') {
    const igst = Math.round((amountPaise * ratePercent) / 100);
    return { cgst: 0, sgst: 0, igst };
  }

  return { cgst: 0, sgst: 0, igst: 0 };
}
