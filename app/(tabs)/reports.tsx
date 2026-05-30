/**
 * TallyTracker — Financial Reports Screen
 *
 * Implements:
 * 1. Date Range filters (Today, Yesterday, Week, Month, Custom).
 * 2. Multi-Tab Report Selector:
 *    - Trial Balance (Opening, Dr/Cr changes, Closing, Balanced Check banner)
 *    - Trading A/c & Profit & Loss statement (Gross Profit, Net Profit/Loss)
 *    - Balance Sheet (Fixed/Current Assets vs Capital/Loans/Liabilities, balanced check)
 *    - GST Summaries (GSTR-1 HSN details, GSTR-3B tax computation)
 * 3. Simulated CSV export using built-in React Native Sharing sheet.
 * 4. Responsive columnar UI with theme-based nature accent badges.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { Entity, Voucher, VoucherLine, Ledger, AccountGroup } from '@/db';
import { TABLE_NAMES, VOUCHER_TYPE_LABELS, VoucherType, DrCr } from '@/utils/constants';
import { formatPaise } from '@/utils/money';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useEntityStore } from '@/stores/entityStore';
import { useAuthStore } from '@/stores/authStore';
import { exportReportToPdf, shareCsvFile } from '@/services/pdf';
import {
  getFYStartDate,
  getFYEndDate,
  isDateInRange,
  today,
  startOfDay,
  endOfDay,
  subDays,
  formatDateIndian,
  parseDateIndian,
  formatDateShort,
  toISODateString,
} from '@/utils/date';

type ReportTab = 'trial' | 'pl' | 'bs' | 'gst' | 'salesReg' | 'purchaseReg' | 'receivables' | 'payables' | 'cashflow' | 'ratios';
type GstSubTab = 'gstr1' | 'gstr3b';

interface LedgerBalance {
  id: string;
  name: string;
  groupName: string;
  nature: string;
  openingPaise: number; // Dr positive, Cr negative
  openingDrCr: DrCr;
  periodDrPaise: number;
  periodCrPaise: number;
  closingPaise: number; // Dr positive, Cr negative
  closingDrCr: DrCr;
}

interface HsnGstSummary {
  hsnSac: string;
  rate: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export default function ReportsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const { activeEntityId } = useEntityStore();
  const { isPremium } = useAuthStore();
  const [activeEntity, setActiveEntity] = useState<Entity | null>(null);

  // Layout tabs state
  const [activeTab, setActiveTab] = useState<ReportTab>('trial');
  const [gstSubTab, setGstSubTab] = useState<GstSubTab>('gstr1');

  // Date filters state
  const [dateRangeType, setDateRangeType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('month');
  const [startDate, setStartDate] = useState<Date>(subDays(today(), 30));
  const [endDate, setEndDate] = useState<Date>(endOfDay(new Date()));
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);
  const [customStartStr, setCustomStartStr] = useState(formatDateIndian(subDays(today(), 30)));
  const [customEndStr, setCustomEndStr] = useState(formatDateIndian(new Date()));

  // Financial aggregates state
  const [ledgerBalances, setLedgerBalances] = useState<LedgerBalance[]>([]);
  const [vouchersList, setVouchersList] = useState<Voucher[]>([]);
  const [linesList, setLinesList] = useState<VoucherLine[]>([]);
  const [ledgerMapState, setLedgerMapState] = useState<Map<string, Ledger>>(new Map());

  const triggerHaptic = (style = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  // Load Active Entity
  useEffect(() => {
    if (activeEntityId) {
      database
        .get<Entity>(TABLE_NAMES.ENTITIES)
        .find(activeEntityId)
        .then(setActiveEntity)
        .catch(() => setActiveEntity(null));
    }
  }, [activeEntityId]);

  // Handle Preset Date selection updates
  useEffect(() => {
    const now = new Date();
    if (dateRangeType === 'today') {
      setStartDate(startOfDay(now));
      setEndDate(endOfDay(now));
    } else if (dateRangeType === 'yesterday') {
      const yest = subDays(now, 1);
      setStartDate(startOfDay(yest));
      setEndDate(endOfDay(yest));
    } else if (dateRangeType === 'week') {
      const weekStart = subDays(now, 7);
      setStartDate(startOfDay(weekStart));
      setEndDate(endOfDay(now));
    } else if (dateRangeType === 'month') {
      const monthStart = subDays(now, 30);
      setStartDate(startOfDay(monthStart));
      setEndDate(endOfDay(now));
    }
  }, [dateRangeType]);

  // Load core logs and run balance calculations
  const calculateFinancialStatements = async () => {
    if (!activeEntityId) return;

    try {
      // 1. Fetch ledgers and groups mapping
      const groups = await database.get<AccountGroup>(TABLE_NAMES.ACCOUNT_GROUPS).query().fetch();
      const entityGroups = groups.filter((g) => g.entityId === activeEntityId);
      const groupMap = new Map(entityGroups.map((g) => [g.id, g]));

      const ledgers = await database.get<Ledger>(TABLE_NAMES.LEDGERS).query().fetch();
      const entityLedgers = ledgers.filter((l) => l.entityId === activeEntityId && !l.isArchived);
      const ledgerMap = new Map(entityLedgers.map((l) => [l.id, l]));
      setLedgerMapState(ledgerMap);

      // 2. Fetch all vouchers and lines for this entity
      const allVouchers = await database.get<Voucher>(TABLE_NAMES.VOUCHERS).query().fetch();
      const entityVouchers = allVouchers.filter((v) => v.entityId === activeEntityId);
      setVouchersList(entityVouchers);

      const activeVouchers = entityVouchers.filter(
        (v) => !v.isCancelled && v.voucherType !== 'sales_order' && v.voucherType !== 'purchase_order'
      );
      const activeVoucherIds = new Set(activeVouchers.map((v) => v.id));
      const activeVoucherMap = new Map(activeVouchers.map((v) => [v.id, v]));

      const allLines = await database.get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES).query().fetch();
      const entityLines = allLines.filter((l) => activeVoucherIds.has(l.voucherId));
      setLinesList(entityLines);

      // 3. For each ledger, compute opening balance, period changes, and closing balance
      const balances: LedgerBalance[] = entityLedgers.map((ledger) => {
        const group = groupMap.get(ledger.groupId);
        const groupName = group ? group.name : 'Unknown Group';
        const nature = group ? group.nature : 'asset';

        // Base opening balance (INR)
        const opVal = ledger.openingBalancePaise || 0;
        let runningSum = ledger.openingBalanceDrCr === 'Dr' ? opVal : -opVal;

        // Sum changes prior to period start date (to find actual opening balance of the period)
        let periodDr = 0;
        let periodCr = 0;

        entityLines.forEach((line) => {
          if (line.ledgerId === ledger.id) {
            const v = activeVoucherMap.get(line.voucherId);
            if (!v) return;
            const t = startOfDay(v.date).getTime();
            const startT = startOfDay(startDate).getTime();
            const endT = endOfDay(endDate).getTime();

            if (t < startT) {
              // Transactions before start date affect period opening balance
              if (line.drCr === 'Dr') {
                runningSum += line.amountPaise;
              } else {
                runningSum -= line.amountPaise;
              }
            } else if (t >= startT && t <= endT) {
              // Transactions in period affect period changes
              if (line.drCr === 'Dr') {
                periodDr += line.amountPaise;
              } else {
                periodCr += line.amountPaise;
              }
            }
          }
        });

        // Closing Balance
        const closingSum = runningSum + periodDr - periodCr;

        return {
          id: ledger.id,
          name: ledger.name,
          groupName,
          nature,
          openingPaise: Math.abs(runningSum),
          openingDrCr: runningSum >= 0 ? 'Dr' : 'Cr',
          periodDrPaise: periodDr,
          periodCrPaise: periodCr,
          closingPaise: Math.abs(closingSum),
          closingDrCr: closingSum >= 0 ? 'Dr' : 'Cr',
        };
      });

      setLedgerBalances(balances);

    } catch (e) {
      console.error('Failed to compute financial summaries:', e);
    }
  };

  // Recalculate when active tab/entity or start/end date changes inside current screen lifecycle
  useEffect(() => {
    calculateFinancialStatements();
  }, [activeEntityId, startDate, endDate]);

  useFocusEffect(
    React.useCallback(() => {
      calculateFinancialStatements();
    }, [activeEntityId, startDate, endDate])
  );

  const handleApplyCustomDates = () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(customStartStr) || !dateRegex.test(customEndStr)) {
      Alert.alert('Invalid Date', 'Please enter dates in DD/MM/YYYY format.');
      return;
    }

    try {
      const s = startOfDay(parseDateIndian(customStartStr));
      const e = endOfDay(parseDateIndian(customEndStr));

      if (s.getTime() > e.getTime()) {
        Alert.alert('Invalid Range', 'Start date must be before or equal to End date.');
        return;
      }

      setStartDate(s);
      setEndDate(e);
      setShowCustomDateModal(false);
    } catch {
      Alert.alert('Error parsing dates');
    }
  };

  // ─── REPORT EXPORTERS ──────────────────────────────────────────
  const handleExportCSV = async () => {
    if (!activeEntity) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    if (activeTab === 'ratios') {
      Alert.alert(
        'Export Unavailable',
        'Ratio Analysis is a real-time dynamic dashboard and cannot be exported to CSV.'
      );
      return;
    }

    try {
      let csv = `Client: ${activeEntity.name}\n`;
      csv += `Period: ${formatDateShort(startDate)} to ${formatDateShort(endDate)}\n\n`;

      if (activeTab === 'trial') {
        csv += `Trial Balance Report\n`;
        csv += `Ledger,Group,Nature,Opening,Opening Type,Debit,Credit,Closing,Closing Type\n`;
        ledgerBalances.forEach((b) => {
          csv += `"${b.name}","${b.groupName}",${b.nature},${(b.openingPaise / 100).toFixed(2)},${b.openingDrCr},${(b.periodDrPaise / 100).toFixed(2)},${(b.periodCrPaise / 100).toFixed(2)},${(b.closingPaise / 100).toFixed(2)},${b.closingDrCr}\n`;
        });
      } else if (activeTab === 'pl') {
        csv += `Profit & Loss Statement\n`;
        const { directIncomes, directExpenses, grossProfit, indirectIncomes, indirectExpenses, netProfit } = getPLMetrics();
        csv += `Revenue / Sales Incomes:\n`;
        directIncomes.forEach((i) => csv += `,"${i.name}",${(i.amount / 100).toFixed(2)}\n`);
        csv += `Total Direct Incomes,,${(sumOfPLItems(directIncomes) / 100).toFixed(2)}\n`;
        csv += `Direct Expenses:\n`;
        directExpenses.forEach((e) => csv += `,"${e.name}",${(e.amount / 100).toFixed(2)}\n`);
        csv += `Total Direct Expenses,,${(sumOfPLItems(directExpenses) / 100).toFixed(2)}\n`;
        csv += `Gross Profit / Loss,,${(grossProfit / 100).toFixed(2)}\n\n`;
        csv += `Indirect Incomes:\n`;
        indirectIncomes.forEach((i) => csv += `,"${i.name}",${(i.amount / 100).toFixed(2)}\n`);
        csv += `Indirect Expenses:\n`;
        indirectExpenses.forEach((e) => csv += `,"${e.name}",${(e.amount / 100).toFixed(2)}\n`);
        csv += `Net Profit / Loss,,${(netProfit / 100).toFixed(2)}\n`;
      } else if (activeTab === 'bs') {
        csv += `Balance Sheet\n`;
        const { assetsList, liabilitiesList, totalAssets, totalLiab } = getBSMetrics();
        csv += `ASSETS,Amount (INR),LIABILITIES & CAPITAL,Amount (INR)\n`;
        const maxLen = Math.max(assetsList.length, liabilitiesList.length);
        for (let i = 0; i < maxLen; i++) {
          const a = assetsList[i];
          const l = liabilitiesList[i];
          const aStr = a ? `"${a.name}",${(a.amount / 100).toFixed(2)}` : ',';
          const lStr = l ? `"${l.name}",${(l.amount / 100).toFixed(2)}` : ',';
          csv += `${aStr},${lStr}\n`;
        }
        csv += `TOTAL ASSETS,${(totalAssets / 100).toFixed(2)},TOTAL LIABILITIES,${(totalLiab / 100).toFixed(2)}\n`;
      } else if (activeTab === 'gst') {
        if (gstSubTab === 'gstr1') {
          csv += `GSTR-1 Outward Supplies Summary\n`;
          csv += `HSN/SAC,Tax Rate (%),Taxable Value (INR),CGST (INR),SGST (INR),IGST (INR)\n`;
          const records = getGstr1Records();
          records.forEach((r) => {
            csv += `"${r.hsnSac}",${r.rate},${(r.taxableValuePaise / 100).toFixed(2)},${(r.cgstPaise / 100).toFixed(2)},${(r.sgstPaise / 100).toFixed(2)},${(r.igstPaise / 100).toFixed(2)}\n`;
          });
        } else {
          csv += `GSTR-3B Filing summary\n`;
          const { outward31, eligible4, netPayable } = getGstr3bMetrics();
          csv += `,Taxable Value,Integrated Tax (IGST),Central Tax (CGST),State Tax (SGST)\n`;
          csv += `3.1 Outward Taxable Supplies,${(outward31.value / 100).toFixed(2)},${(outward31.igst / 100).toFixed(2)},${(outward31.cgst / 100).toFixed(2)},${(outward31.sgst / 100).toFixed(2)}\n`;
          csv += `4 Eligible Input Tax Credit (ITC),0.00,${(eligible4.igst / 100).toFixed(2)},${(eligible4.cgst / 100).toFixed(2)},${(eligible4.sgst / 100).toFixed(2)}\n`;
          csv += `Net Tax Liability Payable,,${(netPayable.igst / 100).toFixed(2)},${(netPayable.cgst / 100).toFixed(2)},${(netPayable.sgst / 100).toFixed(2)}\n`;
        }
      } else if (activeTab === 'salesReg' || activeTab === 'purchaseReg') {
        const type = activeTab === 'salesReg' ? 'sales' : 'purchase';
        const regs = getRegisterMetrics(type);
        csv += `${activeTab === 'salesReg' ? 'Sales' : 'Purchase'} Register\n`;
        csv += `Date,Voucher No,Ref No,Party Name,Taxable Value,CGST,SGST,IGST,Total Value\n`;
        regs.forEach((r) => {
          csv += `${formatDateShort(r.date)},${r.number},${r.refNumber},"${r.partyName}",${(r.taxablePaise/100).toFixed(2)},${(r.cgstPaise/100).toFixed(2)},${(r.sgstPaise/100).toFixed(2)},${(r.igstPaise/100).toFixed(2)},${(r.totalPaise/100).toFixed(2)}\n`;
        });
      } else if (activeTab === 'receivables' || activeTab === 'payables') {
        const type = activeTab === 'receivables' ? 'receivables' : 'payables';
        const outs = getOutstandingMetrics(type);
        csv += `Outstanding ${activeTab === 'receivables' ? 'Receivables' : 'Payables'} Statement\n`;
        csv += `Party/Ledger,Total Outstanding,0-30 Days,31-60 Days,61-90 Days,90+ Days\n`;
        outs.forEach((r) => {
          csv += `"${r.partyName}",${(r.totalOutstandingPaise/100).toFixed(2)},${(r.bucket0_30/100).toFixed(2)},${(r.bucket31_60/100).toFixed(2)},${(r.bucket61_90/100).toFixed(2)},${(r.bucket90_plus/100).toFixed(2)}\n`;
        });
      } else if (activeTab === 'cashflow') {
        const data = getCashFlowMetrics();
        csv += `Cash Flow Statement\n`;
        csv += `Operating Activities:\n`;
        csv += `Net Profit Before Tax,,${(data.netProfit/100).toFixed(2)}\n`;
        csv += `Change in Debtors,,${(-data.changeInDebtors/100).toFixed(2)}\n`;
        csv += `Change in Creditors,,${(data.changeInCreditors/100).toFixed(2)}\n`;
        csv += `Net Cash from Operating Activities,,${(data.operatingCashFlow/100).toFixed(2)}\n`;
        csv += `Investing Activities:\n`;
        csv += `Net Change in Fixed Assets,,${(-data.changeInFixedAssets/100).toFixed(2)}\n`;
        csv += `Net Cash from Investing Activities,,${(data.investingCashFlow/100).toFixed(2)}\n`;
        csv += `Financing Activities:\n`;
        csv += `Infusion/Drawings of Capital,,${(-data.changeInCapital/100).toFixed(2)}\n`;
        csv += `Net Loans,,${(-data.changeInLoans/100).toFixed(2)}\n`;
        csv += `Net Cash from Financing Activities,,${(data.financingCashFlow/100).toFixed(2)}\n`;
        csv += `NET CASH FLOW,,${(data.netCashFlow/100).toFixed(2)}\n`;
        csv += `Opening Cash & Bank,,${(data.openingCashBank/100).toFixed(2)}\n`;
        csv += `Closing Cash & Bank,,${(data.closingCashBank/100).toFixed(2)}\n`;
      }

      const fileName = `${activeEntity.name.replace(/\s+/g, '_')}_${activeTab.toUpperCase()}_Report_${formatDateShort(startDate).replace(/\//g, '-')}_to_${formatDateShort(endDate).replace(/\//g, '-')}.csv`;
      await shareCsvFile(csv, fileName);

    } catch (e: any) {
      Alert.alert('CSV Export Failed', e.message);
    }
  };

  const handleExportPDF = async () => {
    if (!activeEntity) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    if (activeTab === 'ratios') {
      Alert.alert(
        'Export Unavailable',
        'Ratio Analysis is a real-time dynamic dashboard and cannot be exported to PDF.'
      );
      return;
    }

    if (!isPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(
        'Pro Feature Locked',
        'Print-ready Georgia serif PDF statements export is a Pro-only feature. Upgrade to customize and print accounting sheets!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade to Pro', onPress: () => router.push('/premium') }
        ]
      );
      return;
    }

    try {
      let dataPayload: any = {};
      if (activeTab === 'trial') {
        dataPayload = {
          ledgerBalances,
          totals: trialTotals,
        };
      } else if (activeTab === 'pl') {
        const { directIncomes, directExpenses, grossProfit, indirectIncomes, indirectExpenses, netProfit } = getPLMetrics();
        dataPayload = {
          directIncomes,
          directExpenses,
          grossProfit,
          indirectIncomes,
          indirectExpenses,
          netProfit,
        };
      } else if (activeTab === 'bs') {
        const { assetsList, liabilitiesList, totalAssets, totalLiab, isBalanced } = getBSMetrics();
        dataPayload = {
          assetsList,
          liabilitiesList,
          totalAssets,
          totalLiab,
          isBalanced,
        };
      } else if (activeTab === 'gst') {
        if (gstSubTab === 'gstr1') {
          dataPayload = {
            records: getGstr1Records(),
          };
        } else {
          const { outward31, eligible4, netPayable } = getGstr3bMetrics();
          dataPayload = {
            outward31,
            eligible4,
            netPayable,
          };
        }
      } else if (activeTab === 'salesReg' || activeTab === 'purchaseReg') {
        const type = activeTab === 'salesReg' ? 'sales' : 'purchase';
        const regs = getRegisterMetrics(type);
        const taxableSum = regs.reduce((sum, r) => sum + r.taxablePaise, 0);
        const cgstSum = regs.reduce((sum, r) => sum + r.cgstPaise, 0);
        const sgstSum = regs.reduce((sum, r) => sum + r.sgstPaise, 0);
        const igstSum = regs.reduce((sum, r) => sum + r.igstPaise, 0);
        const totalSum = regs.reduce((sum, r) => sum + r.totalPaise, 0);

        dataPayload = {
          registers: regs,
          totals: {
            taxableSum,
            cgstSum,
            sgstSum,
            igstSum,
            totalSum,
          },
        };
      } else if (activeTab === 'receivables' || activeTab === 'payables') {
        const type = activeTab === 'receivables' ? 'receivables' : 'payables';
        const outs = getOutstandingMetrics(type);
        const outstandingSum = outs.reduce((sum, r) => sum + r.totalOutstandingPaise, 0);
        const sum0_30 = outs.reduce((sum, r) => sum + r.bucket0_30, 0);
        const sum31_60 = outs.reduce((sum, r) => sum + r.bucket31_60, 0);
        const sum61_90 = outs.reduce((sum, r) => sum + r.bucket61_90, 0);
        const sum90_plus = outs.reduce((sum, r) => sum + r.bucket90_plus, 0);

        dataPayload = {
          outstandings: outs,
          totals: {
            outstandingSum,
            sum0_30,
            sum31_60,
            sum61_90,
            sum90_plus,
          },
        };
      } else if (activeTab === 'cashflow') {
        dataPayload = getCashFlowMetrics();
      }

      await exportReportToPdf(activeEntity as any, activeTab === 'gst' ? gstSubTab : activeTab, startDate, endDate, dataPayload);
    } catch (e: any) {
      Alert.alert('PDF Export Failed', e.message || 'Error occurred compiling report PDF.');
    }
  };

  // ─── TRIAL BALANCE LOGIC ───────────────────────────────────────
  const getTrialBalanceTotals = () => {
    let drSum = 0;
    let crSum = 0;

    ledgerBalances.forEach((b) => {
      if (b.closingDrCr === 'Dr') {
        drSum += b.closingPaise;
      } else {
        crSum += b.closingPaise;
      }
    });

    return {
      drSum,
      crSum,
      isBalanced: drSum === crSum,
    };
  };

  const trialTotals = getTrialBalanceTotals();

  // ─── REGISTERS LOGIC (SALES & PURCHASE) ───────────────────────
  const getRegisterMetrics = (type: 'sales' | 'purchase') => {
    const registers: {
      voucherId: string;
      date: Date;
      number: string;
      refNumber: string;
      partyName: string;
      taxablePaise: number;
      cgstPaise: number;
      sgstPaise: number;
      igstPaise: number;
      totalPaise: number;
    }[] = [];

    // Filter active vouchers of this type within date range
    const activeVouchers = vouchersList.filter(
      (v) =>
        v.voucherType === type &&
        !v.isCancelled &&
        isDateInRange(v.date, startDate, endDate)
    );

    // Sort chronologically
    activeVouchers.sort((a, b) => a.date.getTime() - b.date.getTime());

    activeVouchers.forEach((v) => {
      const vLines = linesList.filter((l) => l.voucherId === v.id);
      
      let cgst = 0;
      let sgst = 0;
      let igst = 0;
      let grossVal = 0;

      // In sales, gross value is the sum of Dr lines. In purchase, it is the sum of Cr lines.
      const targetDrCr = type === 'sales' ? 'Dr' : 'Cr';
      vLines.forEach((l) => {
        cgst += l.cgstPaise || 0;
        sgst += l.sgstPaise || 0;
        igst += l.igstPaise || 0;
        if (l.drCr === targetDrCr) {
          grossVal += l.amountPaise;
        }
      });

      // Find party name
      // The party line has the targetDrCr of the sales/purchase voucher (customer/vendor)
      const partyLine = vLines.find((l) => l.drCr === targetDrCr);
      const partyLedgerId = partyLine ? partyLine.ledgerId : '';
      const ledgerRecord = ledgerMapState.get(partyLedgerId);
      const partyName = ledgerRecord ? ledgerRecord.name : 'Cash/General';

      const totalTax = cgst + sgst + igst;
      const taxable = grossVal - totalTax;

      registers.push({
        voucherId: v.id,
        date: v.date,
        number: v.number,
        refNumber: v.refNumber || '',
        partyName,
        taxablePaise: taxable,
        cgstPaise: cgst,
        sgstPaise: sgst,
        igstPaise: igst,
        totalPaise: grossVal,
      });
    });

    return registers;
  };

  // ─── OUTSTANDINGS & AGING ANALYSIS ─────────────────────────────
  interface OutstandingItem {
    ledgerId: string;
    partyName: string;
    totalOutstandingPaise: number;
    bucket0_30: number;
    bucket31_60: number;
    bucket61_90: number;
    bucket90_plus: number;
  }

  const getOutstandingMetrics = (type: 'receivables' | 'payables') => {
    const outstandings: OutstandingItem[] = [];
    
    // Sundry Debtors are of nature 'asset' (or groupName contains Debtors)
    // Sundry Creditors are of nature 'liability' (or groupName contains Creditors)
    const targetLedgers = ledgerBalances.filter((b) => {
      const gName = b.groupName.toLowerCase();
      if (type === 'receivables') {
        return (gName.includes('debtor') || b.name.toLowerCase().includes('debtor') || (b.nature === 'asset' && b.closingDrCr === 'Dr')) && b.closingPaise > 0;
      } else {
        return (gName.includes('creditor') || b.name.toLowerCase().includes('creditor') || (b.nature === 'liability' && b.closingDrCr === 'Cr')) && b.closingPaise > 0;
      }
    });

    const activeVouchers = vouchersList.filter((v) => !v.isCancelled);
    const vMap = new Map(activeVouchers.map((v) => [v.id, v]));
    const msInDay = 24 * 60 * 60 * 1000;
    const now = new Date().getTime();

    targetLedgers.forEach((ledger) => {
      const ledLines = linesList.filter((l) => l.ledgerId === ledger.id);
      
      const charges: { date: Date; amount: number }[] = [];
      let totalPayments = 0;

      ledLines.forEach((l) => {
        const v = vMap.get(l.voucherId);
        if (v) {
          // For receivables: Debit increases balance (charge), Credit decreases balance (payment)
          // For payables: Credit increases balance (charge), Debit decreases balance (payment)
          const isCharge = type === 'receivables' ? l.drCr === 'Dr' : l.drCr === 'Cr';
          if (isCharge) {
            charges.push({ date: v.date, amount: l.amountPaise });
          } else {
            totalPayments += l.amountPaise;
          }
        }
      });

      // Sort charges chronologically (oldest first)
      charges.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Apply payments to oldest charges first (FIFO)
      let remainingPayments = totalPayments;
      const unpaidCharges = charges.map((c) => {
        if (remainingPayments >= c.amount) {
          remainingPayments -= c.amount;
          return { ...c, amount: 0 };
        } else {
          const unpaid = c.amount - remainingPayments;
          remainingPayments = 0;
          return { ...c, amount: unpaid };
        }
      }).filter((c) => c.amount > 0);

      let b0_30 = 0;
      let b31_60 = 0;
      let b61_90 = 0;
      let b90_plus = 0;

      unpaidCharges.forEach((c) => {
        const ageDays = Math.floor((now - c.date.getTime()) / msInDay);
        if (ageDays <= 30) {
          b0_30 += c.amount;
        } else if (ageDays <= 60) {
          b31_60 += c.amount;
        } else if (ageDays <= 90) {
          b61_90 += c.amount;
        } else {
          b90_plus += c.amount;
        }
      });

      // Fallback in case FIFO calculation yields zero due to opening balances
      const totalOutstanding = ledger.closingPaise;
      if (b0_30 + b31_60 + b61_90 + b90_plus === 0 && totalOutstanding > 0) {
        b0_30 = totalOutstanding;
      }

      outstandings.push({
        ledgerId: ledger.id,
        partyName: ledger.name,
        totalOutstandingPaise: totalOutstanding,
        bucket0_30: b0_30,
        bucket31_60: b31_60,
        bucket61_90: b61_90,
        bucket90_plus: b90_plus,
      });
    });

    return outstandings;
  };

  // ─── CASH FLOW LOGIC ──────────────────────────────────────────
  const getCashFlowMetrics = () => {
    const { netProfit } = getPLMetrics();

    let changeInDebtors = 0;
    let changeInCreditors = 0;
    let changeInFixedAssets = 0;
    let changeInCapital = 0;
    let changeInLoans = 0;

    let openingCashBank = 0;
    let closingCashBank = 0;

    ledgerBalances.forEach((b) => {
      const gName = b.groupName.toLowerCase();
      
      const isCashOrBankLedger =
        b.name.toLowerCase().includes('cash') ||
        b.name.toLowerCase().includes('bank') ||
        b.name.toLowerCase().includes('wallet') ||
        gName.includes('cash') ||
        gName.includes('bank');

      if (isCashOrBankLedger) {
        openingCashBank += b.openingPaise * (b.openingDrCr === 'Dr' ? 1 : -1);
        closingCashBank += b.closingPaise * (b.closingDrCr === 'Dr' ? 1 : -1);
      } else {
        const netChange = b.periodDrPaise - b.periodCrPaise; // Dr - Cr

        if (gName.includes('debtor') || b.name.toLowerCase().includes('debtor')) {
          changeInDebtors += netChange;
        } else if (gName.includes('creditor') || b.name.toLowerCase().includes('creditor')) {
          changeInCreditors += netChange;
        } else if (gName.includes('fixed asset')) {
          changeInFixedAssets += netChange;
        } else if (gName.includes('capital')) {
          changeInCapital += netChange;
        } else if (gName.includes('loan')) {
          changeInLoans += netChange;
        }
      }
    });

    const operatingCashFlow = netProfit - changeInDebtors - changeInCreditors; // Subtract debtor increase (outflow), subtract creditor decrease (which is positive netChange decrease)
    const investingCashFlow = -changeInFixedAssets; // Asset increase is outflow
    const financingCashFlow = -changeInCapital - changeInLoans; // Liability decrease is outflow

    const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

    return {
      netProfit,
      changeInDebtors,
      changeInCreditors,
      changeInFixedAssets,
      changeInCapital,
      changeInLoans,
      operatingCashFlow,
      investingCashFlow,
      financingCashFlow,
      netCashFlow,
      openingCashBank,
      closingCashBank,
    };
  };

  // ─── P&L CALCULATION LOGIC ─────────────────────────────────────
  interface PLItem {
    id: string;
    name: string;
    amount: number; // positive represents normal nature value
  }

  const getPLMetrics = () => {
    const directIncomes: PLItem[] = [];
    const directExpenses: PLItem[] = [];
    const indirectIncomes: PLItem[] = [];
    const indirectExpenses: PLItem[] = [];

    ledgerBalances.forEach((b) => {
      // Net change for this period = Dr changes - Cr changes
      // Since Income is Cr-nature, we do (Cr - Dr)
      // Since Expense is Dr-nature, we do (Dr - Cr)
      const gName = b.groupName.toLowerCase();
      const isDirectInc =
        gName.includes('direct income') ||
        gName.includes('sales') ||
        gName.includes('income (direct)') ||
        gName.includes('income from dues');
      const isIndirectInc =
        gName.includes('indirect income') ||
        gName.includes('income (indirect)');
      const isDirectExp =
        gName.includes('direct expense') ||
        gName.includes('purchase') ||
        gName.includes('expenses (direct)');
      const isIndirectExp =
        gName.includes('indirect expense') ||
        gName.includes('expenses (indirect)');

      const netIncome = b.periodCrPaise - b.periodDrPaise;
      const netExpense = b.periodDrPaise - b.periodCrPaise;

      if (b.nature === 'income') {
        if (isDirectInc && netIncome !== 0) {
          directIncomes.push({ id: b.id, name: b.name, amount: netIncome });
        } else if (isIndirectInc && netIncome !== 0) {
          indirectIncomes.push({ id: b.id, name: b.name, amount: netIncome });
        }
      } else if (b.nature === 'expense') {
        if (isDirectExp && netExpense !== 0) {
          directExpenses.push({ id: b.id, name: b.name, amount: netExpense });
        } else if (isIndirectExp && netExpense !== 0) {
          indirectExpenses.push({ id: b.id, name: b.name, amount: netExpense });
        }
      }
    });

    const directInTotal = directIncomes.reduce((sum, item) => sum + item.amount, 0);
    const directExTotal = directExpenses.reduce((sum, item) => sum + item.amount, 0);
    const grossProfit = directInTotal - directExTotal;

    const indirectInTotal = indirectIncomes.reduce((sum, item) => sum + item.amount, 0);
    const indirectExTotal = indirectExpenses.reduce((sum, item) => sum + item.amount, 0);
    const netProfit = grossProfit + indirectInTotal - indirectExTotal;

    return {
      directIncomes,
      directExpenses,
      grossProfit,
      indirectIncomes,
      indirectExpenses,
      netProfit,
    };
  };

  const sumOfPLItems = (arr: PLItem[]) => arr.reduce((s, x) => s + x.amount, 0);

  const getRatioMetrics = () => {
    const { liabilitiesList } = getBSMetrics();
    const { netProfit, grossProfit } = getPLMetrics();

    let currentAssets = 0;
    let currentLiabilities = 0;
    let stockInHand = 0;
    let totalDebt = 0;
    let totalEquity = 0;
    let totalRevenue = 0;

    ledgerBalances.forEach((b) => {
      const gName = b.groupName.toLowerCase();
      const lName = b.name.toLowerCase();
      let netBal = b.closingPaise;
      if (b.closingDrCr === 'Cr') netBal = -netBal; // Dr positive, Cr negative

      const isSalesLedger = b.nature === 'income' && (
        gName.includes('direct income') ||
        gName.includes('sales') ||
        gName.includes('income (direct)') ||
        gName.includes('income from dues')
      );
      if (isSalesLedger) {
        totalRevenue += (b.periodCrPaise - b.periodDrPaise);
      }

      if (b.nature === 'asset') {
        const isCurrentAsset =
          gName.includes('bank') || gName.includes('cash') || gName.includes('debtor') || gName.includes('stock') || gName.includes('current asset') ||
          lName.includes('bank') || lName.includes('cash') || lName.includes('debtor') || lName.includes('stock') || lName.includes('current asset');
        
        if (isCurrentAsset) {
          currentAssets += Math.max(0, netBal);
        }
        if (gName.includes('stock') || lName.includes('stock') || gName.includes('inventory') || lName.includes('inventory')) {
          stockInHand += Math.max(0, netBal);
        }
      } else if (b.nature === 'liability') {
        const isCurrentLiab =
          gName.includes('creditor') || gName.includes('tax') || gName.includes('provision') || gName.includes('current liability') ||
          lName.includes('creditor') || lName.includes('tax') || lName.includes('provision') || lName.includes('current liability');
        
        if (isCurrentLiab) {
          currentLiabilities += Math.max(0, -netBal);
        }

        const isDebt =
          gName.includes('loan') ||
          gName.includes('bank od') ||
          gName.includes('bank occ') ||
          lName.includes('loan') ||
          gName.includes('borrowing') ||
          lName.includes('borrowing');
        if (isDebt) {
          totalDebt += Math.max(0, -netBal);
        }
      } else if (b.nature === 'equity') {
        totalEquity += Math.max(0, -netBal);
      }
    });

    const retainedEarnings = liabilitiesList.find(x => x.name.includes('Retained Earnings'))?.amount || 0;
    totalEquity += retainedEarnings;

    const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : currentAssets > 0 ? 999 : 0;
    const quickRatio = currentLiabilities > 0 ? (currentAssets - stockInHand) / currentLiabilities : (currentAssets - stockInHand) > 0 ? 999 : 0;
    const debtToEquity = totalEquity > 0 ? totalDebt / totalEquity : totalDebt > 0 ? 999 : 0;
    
    const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const grossProfitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const returnOnEquity = totalEquity > 0 ? (netProfit / totalEquity) * 100 : 0;

    return {
      currentRatio,
      quickRatio,
      debtToEquity,
      netProfitMargin,
      grossProfitMargin,
      returnOnEquity,
      currentAssets,
      currentLiabilities,
      stockInHand,
      totalDebt,
      totalEquity,
      totalRevenue,
      netProfit,
    };
  };


  // ─── BALANCE SHEET CALCULATION LOGIC ────────────────────────────
  interface BSItem {
    id?: string;
    name: string;
    amount: number;
  }

  const getBSMetrics = () => {
    const assetsList: BSItem[] = [];
    const liabilitiesList: BSItem[] = [];

    // Cumulative net profit from P&L up to endDate
    // P&L calculation above uses only period changes. But for Balance Sheet,
    // we need Net Profit from inception of company up to endDate.
    let cumulativeNetProfit = 0;
    
    // Calculate cumulative Net Profit from all vouchers up to endDate
    let totalDirectInc = 0;
    let totalDirectExp = 0;
    let totalIndirectInc = 0;
    let totalIndirectExp = 0;

    ledgerBalances.forEach((b) => {
      // Calculate cumulative Dr and Cr totals up to endDate
      // which is: configured opening + all Dr/Cr changes in period and pre-period
      let cumDr = b.periodDrPaise;
      let cumCr = b.periodCrPaise;

      // Add pre-period changes (we can compute it using b.openingPaise)
      if (b.openingPaise > 0) {
        if (b.openingDrCr === 'Dr') {
          cumDr += b.openingPaise;
        } else {
          cumCr += b.openingPaise;
        }
      }

      const gName = b.groupName.toLowerCase();
      const isDirectInc =
        gName.includes('direct income') ||
        gName.includes('sales') ||
        gName.includes('income (direct)') ||
        gName.includes('income from dues');
      const isIndirectInc =
        gName.includes('indirect income') ||
        gName.includes('income (indirect)');
      const isDirectExp =
        gName.includes('direct expense') ||
        gName.includes('purchase') ||
        gName.includes('expenses (direct)');
      const isIndirectExp =
        gName.includes('indirect expense') ||
        gName.includes('expenses (indirect)');

      if (b.nature === 'income') {
        const netInc = cumCr - cumDr;
        if (isDirectInc) totalDirectInc += netInc;
        if (isIndirectInc) totalIndirectInc += netInc;
      } else if (b.nature === 'expense') {
        const netExp = cumDr - cumCr;
        if (isDirectExp) totalDirectExp += netExp;
        if (isIndirectExp) totalIndirectExp += netExp;
      }
    });

    const cumGross = totalDirectInc - totalDirectExp;
    cumulativeNetProfit = cumGross + totalIndirectInc - totalIndirectExp;

    ledgerBalances.forEach((b) => {
      // Cumulative balance
      let netBal = b.closingPaise;
      if (b.closingDrCr === 'Cr') netBal = -netBal; // Dr is positive, Cr is negative

      if (b.nature === 'asset') {
        // Assets are normally Dr (positive)
        if (netBal !== 0) {
          assetsList.push({ id: b.id, name: b.name, amount: netBal });
        }
      } else if (b.nature === 'liability') {
        // Liabilities are normally Cr (negative)
        if (netBal !== 0) {
          liabilitiesList.push({ id: b.id, name: b.name, amount: -netBal });
        }
      } else if (b.nature === 'equity') {
        // Capital / Equity normally Cr (negative)
        if (netBal !== 0) {
          liabilitiesList.push({ id: b.id, name: b.name, amount: -netBal });
        }
      }
    });

    // Add Net Profit row under liabilities
    if (cumulativeNetProfit !== 0) {
      liabilitiesList.push({
        name: 'Profit & Loss A/c (Retained Earnings)',
        amount: cumulativeNetProfit,
      });
    }

    const totalAssets = assetsList.reduce((s, x) => s + x.amount, 0);
    const totalLiab = liabilitiesList.reduce((s, x) => s + x.amount, 0);

    return {
      assetsList,
      liabilitiesList,
      totalAssets,
      totalLiab,
      isBalanced: totalAssets === totalLiab,
    };
  };

  // ─── GSTR REPORT CALCULATION LOGIC ──────────────────────────────
  const getGstr1Records = (): HsnGstSummary[] => {
    // Outward Supplies grouped by HSN and GST Rate
    const hsnMap = new Map<string, HsnGstSummary>();

    // Vouchers in date range of type 'sales'
    const activeSalesVouchers = vouchersList.filter(
      (v) => v.voucherType === 'sales' && !v.isCancelled && isDateInRange(v.date, startDate, endDate)
    );

    const salesVoucherIds = new Set(activeSalesVouchers.map((v) => v.id));
    const salesLines = linesList.filter((l) => salesVoucherIds.has(l.voucherId) && l.drCr === 'Cr');

    salesLines.forEach((line) => {
      // Find GST components details
      const rate = line.cgstPaise > 0 ? (line.cgstPaise + line.sgstPaise) / line.amountPaise * 100 : line.igstPaise / line.amountPaise * 100;
      // Round to nearest integer percentage rate (e.g. 5, 12, 18, 28)
      const gstRatePercent = Math.round(rate) || 0;
      
      const cgst = line.cgstPaise || 0;
      const sgst = line.sgstPaise || 0;
      const igst = line.igstPaise || 0;
      
      const key = `${line.ledgerId}_${gstRatePercent}`;

      // Retrieve ledger HSN
      const ledger = ledgerMapState.get(line.ledgerId);
      const hsn = ledger ? ledger.hsnSac || '' : '';

      const current = hsnMap.get(key);
      if (current) {
        current.taxableValuePaise += line.amountPaise;
        current.cgstPaise += cgst;
        current.sgstPaise += sgst;
        current.igstPaise += igst;
      } else {
        hsnMap.set(key, {
          hsnSac: hsn || 'Exempt Supplies',
          rate: gstRatePercent,
          taxableValuePaise: line.amountPaise,
          cgstPaise: cgst,
          sgstPaise: sgst,
          igstPaise: igst,
        });
      }
    });

    return Array.from(hsnMap.values());
  };

  const getGstr3bMetrics = () => {
    let outwardVal = 0;
    let outwardCgst = 0;
    let outwardSgst = 0;
    let outwardIgst = 0;

    let inwardCgst = 0;
    let inwardSgst = 0;
    let inwardIgst = 0;

    const periodVouchers = vouchersList.filter(
      (v) => !v.isCancelled && isDateInRange(v.date, startDate, endDate)
    );

    const vIds = new Set(periodVouchers.map((v) => v.id));
    const periodLines = linesList.filter((l) => vIds.has(l.voucherId));
    const periodVoucherMap = new Map(periodVouchers.map((v) => [v.id, v]));

    periodLines.forEach((line) => {
      const v = periodVoucherMap.get(line.voucherId);
      if (!v) return;
      const cgst = line.cgstPaise || 0;
      const sgst = line.sgstPaise || 0;
      const igst = line.igstPaise || 0;

      if (v.voucherType === 'sales') {
        if (line.drCr === 'Cr') {
          outwardVal += line.amountPaise;
        }
        outwardCgst += cgst;
        outwardSgst += sgst;
        outwardIgst += igst;
      } else if (v.voucherType === 'purchase') {
        inwardCgst += cgst;
        inwardSgst += sgst;
        inwardIgst += igst;
      }
    });

    return {
      outward31: {
        value: outwardVal,
        cgst: outwardCgst,
        sgst: outwardSgst,
        igst: outwardIgst,
      },
      eligible4: {
        cgst: inwardCgst,
        sgst: inwardSgst,
        igst: inwardIgst,
      },
      netPayable: {
        cgst: Math.max(0, outwardCgst - inwardCgst),
        sgst: Math.max(0, outwardSgst - inwardSgst),
        igst: Math.max(0, outwardIgst - inwardIgst),
      },
    };
  };

  if (!activeEntity) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Select a Client Entity to view reports...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{activeEntity.name}</Text>
          <Text style={styles.headerSubtitle}>Periodical Financial Statements</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.shareBtn} onPress={handleExportCSV}>
            <Ionicons name="share-social-outline" size={16} color={colors.primary} />
            <Text style={styles.shareBtnText}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.shareBtn, { marginLeft: 8 }]} onPress={handleExportPDF}>
            <Ionicons name={isPremium ? "document-text-outline" : "lock-closed-outline"} size={14} color={isPremium ? colors.primary : colors.textMuted} />
            <Text style={[styles.shareBtnText, !isPremium && { color: colors.textMuted }]}>PDF</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBarContainer}
        contentContainerStyle={styles.tabBar}
      >
        {([
          { key: 'trial', label: 'Trial Bal' },
          { key: 'pl', label: 'P&L Statement' },
          { key: 'bs', label: 'Balance Sheet' },
          { key: 'gst', label: 'GST Filings' },
          { key: 'salesReg', label: 'Sales Reg' },
          { key: 'purchaseReg', label: 'Purchase Reg' },
          { key: 'receivables', label: 'Receivables' },
          { key: 'payables', label: 'Payables' },
          { key: 'cashflow', label: 'Cash Flow' },
          { key: 'ratios', label: 'Ratios' },
        ] as const).map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => {
                triggerHaptic();
                setActiveTab(tab.key);
              }}
            >
              <Text style={[styles.tabItemText, isActive && styles.tabItemTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Preset date selector row */}
      <View style={styles.pillRow}>
        {([
          { key: 'today', label: 'Today' },
          { key: 'yesterday', label: 'Yesterday' },
          { key: 'week', label: 'Week' },
          { key: 'month', label: 'Month' },
          { key: 'custom', label: 'Custom...' },
        ] as const).map((preset) => {
          const isActive = dateRangeType === preset.key;
          return (
            <TouchableOpacity
              key={preset.key}
              style={[styles.pillBtn, isActive && styles.pillBtnActive]}
              onPress={() => {
                triggerHaptic();
                if (preset.key === 'custom') {
                  setCustomStartStr(formatDateIndian(startDate));
                  setCustomEndStr(formatDateIndian(endDate));
                  setShowCustomDateModal(true);
                } else {
                  setDateRangeType(preset.key);
                }
              }}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Active Period Label */}
      <View style={styles.periodRow}>
        <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
        <Text style={styles.periodText}>
          Period: {formatDateShort(startDate)} - {formatDateShort(endDate)}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 1. TRIAL BALANCE SCREEN */}
        {activeTab === 'trial' && (
          <View style={styles.reportContainer}>
            {/* Balanced Status Banner */}
            <View style={[styles.statusBanner, trialTotals.isBalanced ? styles.bannerSuccess : styles.bannerError]}>
              <Ionicons
                name={trialTotals.isBalanced ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                size={18}
                color="#FFFFFF"
              />
              <Text style={styles.bannerText}>
                {trialTotals.isBalanced ? 'Trial Balance is Balanced' : 'Trial Balance Out of Balance!'}
              </Text>
            </View>

            {/* Trial Balance Table */}
            <View style={styles.tableCard}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.columnHeader, styles.colParticulars]}>Ledger Account</Text>
                <Text style={[styles.columnHeader, styles.colAmount, { textAlign: 'right' }]}>Debit (₹)</Text>
                <Text style={[styles.columnHeader, styles.colAmount, { textAlign: 'right' }]}>Credit (₹)</Text>
              </View>

              {ledgerBalances.map((b) => {
                const isDr = b.closingDrCr === 'Dr';
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.tableRow}
                    onPress={() => {
                      triggerHaptic();
                      router.push(`/ledger/${b.id}`);
                    }}
                  >
                    <View style={styles.colParticulars}>
                      <Text style={styles.cellParticularText}>{b.name}</Text>
                      <Text style={styles.cellGroupText}>{b.groupName}</Text>
                    </View>
                    <Text style={[styles.cellText, styles.colAmount, styles.amountText]}>
                      {isDr && b.closingPaise > 0 ? formatPaise(b.closingPaise) : '—'}
                    </Text>
                    <Text style={[styles.cellText, styles.colAmount, styles.amountText]}>
                      {!isDr && b.closingPaise > 0 ? formatPaise(b.closingPaise) : '—'}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <View style={styles.tableFooterRow}>
                <Text style={[styles.footerText, styles.colParticulars]}>TOTALS</Text>
                <Text style={[styles.footerText, styles.colAmount, styles.amountText]}>
                  {formatPaise(trialTotals.drSum)}
                </Text>
                <Text style={[styles.footerText, styles.colAmount, styles.amountText]}>
                  {formatPaise(trialTotals.crSum)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 2. PROFIT & LOSS STATEMENT */}
        {activeTab === 'pl' && (() => {
          const { directIncomes, directExpenses, grossProfit, indirectIncomes, indirectExpenses, netProfit } = getPLMetrics();
          return (
            <View style={styles.reportContainer}>
              {/* Gross Profit Block */}
              <View style={styles.tableCard}>
                <Text style={styles.statementSectionTitle}>Trading Account (Direct)</Text>
                
                {/* Revenue Incomes */}
                <Text style={styles.plSectionLabel}>Direct Income (Revenues)</Text>
                {directIncomes.length === 0 ? (
                  <Text style={styles.plEmptyText}>— No direct revenues in period —</Text>
                ) : (
                  directIncomes.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.plItemRow}
                      onPress={() => {
                        triggerHaptic();
                        router.push(`/ledger/${item.id}`);
                      }}
                    >
                      <Text style={styles.plItemName}>{item.name}</Text>
                      <Text style={styles.plItemVal}>{formatPaise(item.amount)}</Text>
                    </TouchableOpacity>
                  ))
                )}
                <View style={styles.plSubtotalRow}>
                  <Text style={styles.plSubtotalText}>Total Revenue (A)</Text>
                  <Text style={styles.plSubtotalVal}>{formatPaise(sumOfPLItems(directIncomes))}</Text>
                </View>

                {/* Direct Expenses */}
                <Text style={[styles.plSectionLabel, { marginTop: 12 }]}>Direct Expenses (COGS)</Text>
                {directExpenses.length === 0 ? (
                  <Text style={styles.plEmptyText}>— No direct expenses in period —</Text>
                ) : (
                  directExpenses.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.plItemRow}
                      onPress={() => {
                        triggerHaptic();
                        router.push(`/ledger/${item.id}`);
                      }}
                    >
                      <Text style={styles.plItemName}>{item.name}</Text>
                      <Text style={styles.plItemVal}>{formatPaise(item.amount)}</Text>
                    </TouchableOpacity>
                  ))
                )}
                <View style={styles.plSubtotalRow}>
                  <Text style={styles.plSubtotalText}>Total Direct Costs (B)</Text>
                  <Text style={styles.plSubtotalVal}>{formatPaise(sumOfPLItems(directExpenses))}</Text>
                </View>

                {/* Gross Margin */}
                <View style={styles.plTotalRow}>
                  <Text style={styles.plTotalText}>GROSS PROFIT (A - B)</Text>
                  <Text style={[styles.plTotalVal, { color: grossProfit >= 0 ? colors.success : colors.danger }]}>
                    {formatPaise(Math.abs(grossProfit))} {grossProfit >= 0 ? 'Cr' : 'Dr'}
                  </Text>
                </View>
              </View>

              {/* Net Profit Block */}
              <View style={[styles.tableCard, { marginTop: 16 }]}>
                <Text style={styles.statementSectionTitle}>Profit & Loss Statement (Indirect)</Text>

                {/* Indirect Income */}
                <Text style={styles.plSectionLabel}>Indirect Incomes</Text>
                {indirectIncomes.length === 0 ? (
                  <Text style={styles.plEmptyText}>— No indirect incomes in period —</Text>
                ) : (
                  indirectIncomes.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.plItemRow}
                      onPress={() => {
                        triggerHaptic();
                        router.push(`/ledger/${item.id}`);
                      }}
                    >
                      <Text style={styles.plItemName}>{item.name}</Text>
                      <Text style={styles.plItemVal}>{formatPaise(item.amount)}</Text>
                    </TouchableOpacity>
                  ))
                )}
                <View style={styles.plSubtotalRow}>
                  <Text style={styles.plSubtotalText}>Total Indirect Incomes (C)</Text>
                  <Text style={styles.plSubtotalVal}>{formatPaise(sumOfPLItems(indirectIncomes))}</Text>
                </View>

                {/* Indirect Expenses */}
                <Text style={[styles.plSectionLabel, { marginTop: 12 }]}>Indirect Expenses</Text>
                {indirectExpenses.length === 0 ? (
                  <Text style={styles.plEmptyText}>— No indirect expenses in period —</Text>
                ) : (
                  indirectExpenses.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.plItemRow}
                      onPress={() => {
                        triggerHaptic();
                        router.push(`/ledger/${item.id}`);
                      }}
                    >
                      <Text style={styles.plItemName}>{item.name}</Text>
                      <Text style={styles.plItemVal}>{formatPaise(item.amount)}</Text>
                    </TouchableOpacity>
                  ))
                )}
                <View style={styles.plSubtotalRow}>
                  <Text style={styles.plSubtotalText}>Total Indirect Expenses (D)</Text>
                  <Text style={styles.plSubtotalVal}>{formatPaise(sumOfPLItems(indirectExpenses))}</Text>
                </View>

                {/* Net Income Summary */}
                <View style={styles.plTotalRow}>
                  <Text style={styles.plTotalText}>NET PROFIT / LOSS</Text>
                  <Text style={[styles.plTotalVal, { color: netProfit >= 0 ? colors.success : colors.danger }]}>
                    {formatPaise(Math.abs(netProfit))} {netProfit >= 0 ? 'Cr (Profit)' : 'Dr (Loss)'}
                  </Text>
                </View>
              </View>
            </View>
          );
        })()}

        {/* 3. BALANCE SHEET SCREEN */}
        {activeTab === 'bs' && (() => {
          const { assetsList, liabilitiesList, totalAssets, totalLiab } = getBSMetrics();
          const isBalanced = totalAssets === totalLiab;

          return (
            <View style={styles.reportContainer}>
              <View style={[styles.statusBanner, isBalanced ? styles.bannerSuccess : styles.bannerError]}>
                <Ionicons
                  name={isBalanced ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={styles.bannerText}>
                  {isBalanced ? 'Balance Sheet is Balanced' : 'Assets & Liabilities Mismatch!'}
                </Text>
              </View>

              <View style={styles.bsContainer}>
                {/* Left Side: Liabilities */}
                <View style={styles.bsSideCard}>
                  <Text style={styles.bsSideTitle}>Liabilities & Capital</Text>
                  <View style={styles.bsList}>
                    {liabilitiesList.length === 0 ? (
                      <Text style={styles.plEmptyText}>No liabilities recorded</Text>
                    ) : (
                      liabilitiesList.map((item, idx) => {
                        const content = (
                          <View style={styles.plItemRow}>
                            <Text style={styles.bsItemName} numberOfLines={2}>{item.name}</Text>
                            <Text style={styles.bsItemVal}>{formatPaise(item.amount)}</Text>
                          </View>
                        );
                        if (item.id) {
                          return (
                            <TouchableOpacity
                              key={idx}
                              onPress={() => {
                                triggerHaptic();
                                router.push(`/ledger/${item.id}`);
                              }}
                            >
                              {content}
                            </TouchableOpacity>
                          );
                        }
                        return <View key={idx}>{content}</View>;
                      })
                    )}
                  </View>
                  <View style={styles.bsTotalBox}>
                    <Text style={styles.bsTotalText}>Total</Text>
                    <Text style={styles.bsTotalVal}>{formatPaise(totalLiab)}</Text>
                  </View>
                </View>

                {/* Right Side: Assets */}
                <View style={styles.bsSideCard}>
                  <Text style={styles.bsSideTitle}>Assets</Text>
                  <View style={styles.bsList}>
                    {assetsList.length === 0 ? (
                      <Text style={styles.plEmptyText}>No assets recorded</Text>
                    ) : (
                      assetsList.map((item, idx) => {
                        const content = (
                          <View style={styles.plItemRow}>
                            <Text style={styles.bsItemName} numberOfLines={2}>{item.name}</Text>
                            <Text style={styles.bsItemVal}>{formatPaise(item.amount)}</Text>
                          </View>
                        );
                        if (item.id) {
                          return (
                            <TouchableOpacity
                              key={idx}
                              onPress={() => {
                                triggerHaptic();
                                router.push(`/ledger/${item.id}`);
                              }}
                            >
                              {content}
                            </TouchableOpacity>
                          );
                        }
                        return <View key={idx}>{content}</View>;
                      })
                    )}
                  </View>
                  <View style={styles.bsTotalBox}>
                    <Text style={styles.bsTotalText}>Total</Text>
                    <Text style={styles.bsTotalVal}>{formatPaise(totalAssets)}</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })()}

        {/* 4. GST TAX SUMMARY FILINGS */}
        {activeTab === 'gst' && (
          <View style={styles.reportContainer}>
            {/* GST Sub tabs */}
            <View style={styles.subTabBar}>
              <TouchableOpacity
                style={[styles.subTabItem, gstSubTab === 'gstr1' && styles.subTabActive]}
                onPress={() => { triggerHaptic(); setGstSubTab('gstr1'); }}
              >
                <Text style={[styles.subTabText, gstSubTab === 'gstr1' && styles.subTabTextActive]}>
                  GSTR-1 Outward Supplies
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTabItem, gstSubTab === 'gstr3b' && styles.subTabActive]}
                onPress={() => { triggerHaptic(); setGstSubTab('gstr3b'); }}
              >
                <Text style={[styles.subTabText, gstSubTab === 'gstr3b' && styles.subTabTextActive]}>
                  GSTR-3B Tax Filing
                </Text>
              </TouchableOpacity>
            </View>

            {/* GSTR-1 View */}
            {gstSubTab === 'gstr1' && (() => {
              const records = getGstr1Records();
              return (
                <View style={styles.tableCard}>
                  <Text style={styles.statementSectionTitle}>HSN/SAC Wise Taxable Sales</Text>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.columnHeader, { flex: 1 }]}>HSN/SAC</Text>
                    <Text style={[styles.columnHeader, { flex: 0.6, textAlign: 'center' }]}>Rate</Text>
                    <Text style={[styles.columnHeader, { flex: 1.2, textAlign: 'right' }]}>Taxable (₹)</Text>
                    <Text style={[styles.columnHeader, { flex: 1.2, textAlign: 'right' }]}>IGST/CGST/SGST</Text>
                  </View>

                  {records.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>No taxable sales recorded in period</Text>
                    </View>
                  ) : (
                    records.map((r, idx) => {
                      const totalTax = r.cgstPaise + r.sgstPaise + r.igstPaise;
                      return (
                        <View key={idx} style={styles.tableRow}>
                          <Text style={[styles.cellParticularText, { flex: 1 }]}>{r.hsnSac}</Text>
                          <Text style={[styles.cellText, { flex: 0.6, textAlign: 'center' }]}>{r.rate}%</Text>
                          <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right' }]}>
                            {formatPaise(r.taxableValuePaise)}
                          </Text>
                          <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right' }]}>
                            {formatPaise(totalTax)}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>
              );
            })()}

            {/* GSTR-3B View */}
            {gstSubTab === 'gstr3b' && (() => {
              const { outward31, eligible4, netPayable } = getGstr3bMetrics();
              return (
                <View style={styles.tableCard}>
                  <Text style={styles.statementSectionTitle}>GSTR-3B Form Summary Values</Text>
                  
                  {/* Outward supplies */}
                  <View style={styles.g3bSection}>
                    <Text style={styles.g3bSectionTitle}>3.1 Details of Outward Taxable Supplies</Text>
                    <View style={styles.g3bRow}>
                      <Text style={styles.g3bLabel}>Total Taxable Value:</Text>
                      <Text style={styles.g3bVal}>{formatPaise(outward31.value)}</Text>
                    </View>
                    <View style={styles.g3bRow}>
                      <Text style={styles.g3bLabel}>Integrated Tax (IGST):</Text>
                      <Text style={styles.g3bVal}>{formatPaise(outward31.igst)}</Text>
                    </View>
                    <View style={styles.g3bRow}>
                      <Text style={styles.g3bLabel}>Central Tax (CGST):</Text>
                      <Text style={styles.g3bVal}>{formatPaise(outward31.cgst)}</Text>
                    </View>
                    <View style={styles.g3bRow}>
                      <Text style={styles.g3bLabel}>State Tax (SGST):</Text>
                      <Text style={styles.g3bVal}>{formatPaise(outward31.sgst)}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {/* Input Tax Credits */}
                  <View style={styles.g3bSection}>
                    <Text style={styles.g3bSectionTitle}>4 Eligible Input Tax Credit (ITC)</Text>
                    <View style={styles.g3bRow}>
                      <Text style={styles.g3bLabel}>Eligible IGST Credit:</Text>
                      <Text style={[styles.g3bVal, { color: colors.primary }]}>{formatPaise(eligible4.igst)}</Text>
                    </View>
                    <View style={styles.g3bRow}>
                      <Text style={styles.g3bLabel}>Eligible CGST Credit:</Text>
                      <Text style={[styles.g3bVal, { color: colors.primary }]}>{formatPaise(eligible4.cgst)}</Text>
                    </View>
                    <View style={styles.g3bRow}>
                      <Text style={styles.g3bLabel}>Eligible SGST Credit:</Text>
                      <Text style={[styles.g3bVal, { color: colors.primary }]}>{formatPaise(eligible4.sgst)}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {/* Net Payable */}
                  <View style={styles.g3bSection}>
                    <Text style={[styles.g3bSectionTitle, { color: colors.danger }]}>Net GST Payable (Output - ITC)</Text>
                    <View style={styles.g3bRow}>
                      <Text style={styles.g3bLabel}>Integrated Tax (IGST):</Text>
                      <Text style={[styles.g3bVal, { fontFamily: 'PlusJakartaSans_800ExtraBold' }]}>
                        {formatPaise(netPayable.igst)}
                      </Text>
                    </View>
                    <View style={styles.g3bRow}>
                      <Text style={styles.g3bLabel}>Central Tax (CGST):</Text>
                      <Text style={[styles.g3bVal, { fontFamily: 'PlusJakartaSans_800ExtraBold' }]}>
                        {formatPaise(netPayable.cgst)}
                      </Text>
                    </View>
                    <View style={styles.g3bRow}>
                      <Text style={styles.g3bLabel}>State Tax (SGST):</Text>
                      <Text style={[styles.g3bVal, { fontFamily: 'PlusJakartaSans_800ExtraBold' }]}>
                        {formatPaise(netPayable.sgst)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })()}
          </View>
        )}

        {/* 5. SALES & PURCHASE REGISTER */}
        {(activeTab === 'salesReg' || activeTab === 'purchaseReg') && (() => {
          const type = activeTab === 'salesReg' ? 'sales' : 'purchase';
          const records = getRegisterMetrics(type);
          const totals = {
            taxableSum: records.reduce((s, r) => s + r.taxablePaise, 0),
            cgstSum: records.reduce((s, r) => s + r.cgstPaise, 0),
            sgstSum: records.reduce((s, r) => s + r.sgstPaise, 0),
            igstSum: records.reduce((s, r) => s + r.igstPaise, 0),
            totalSum: records.reduce((s, r) => s + r.totalPaise, 0),
          };

          return (
            <View style={styles.reportContainer}>
              <View style={styles.tableCard}>
                <Text style={styles.statementSectionTitle}>
                  {activeTab === 'salesReg' ? 'Sales Register Book' : 'Purchase Register Book'}
                </Text>
                
                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={{ minWidth: 650 }}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.columnHeader, { width: 75 }]}>Date</Text>
                      <Text style={[styles.columnHeader, { width: 90 }]}>Voucher No</Text>
                      <Text style={[styles.columnHeader, { width: 120 }]}>Particulars</Text>
                      <Text style={[styles.columnHeader, { width: 90, textAlign: 'right' }]}>Taxable (₹)</Text>
                      <Text style={[styles.columnHeader, { width: 70, textAlign: 'right' }]}>CGST (₹)</Text>
                      <Text style={[styles.columnHeader, { width: 70, textAlign: 'right' }]}>SGST (₹)</Text>
                      <Text style={[styles.columnHeader, { width: 70, textAlign: 'right' }]}>IGST (₹)</Text>
                      <Text style={[styles.columnHeader, { width: 90, textAlign: 'right' }]}>Gross (₹)</Text>
                    </View>

                    {records.length === 0 ? (
                      <Text style={styles.plEmptyText}>— No transactions recorded —</Text>
                    ) : (
                      records.map((r, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.tableRow}
                          onPress={() => {
                            triggerHaptic();
                            router.push(`/(screens)/voucher/${r.voucherId}`);
                          }}
                        >
                          <Text style={[styles.cellText, { width: 75 }]}>{formatDateShort(r.date)}</Text>
                          <Text style={[styles.cellParticularText, { width: 90 }]} numberOfLines={1}>{r.number}</Text>
                          <Text style={[styles.cellText, { width: 120 }]} numberOfLines={1}>{r.partyName}</Text>
                          <Text style={[styles.cellText, { width: 90, textAlign: 'right' }]}>{formatPaise(r.taxablePaise)}</Text>
                          <Text style={[styles.cellText, { width: 70, textAlign: 'right' }]}>{r.cgstPaise > 0 ? formatPaise(r.cgstPaise) : '—'}</Text>
                          <Text style={[styles.cellText, { width: 70, textAlign: 'right' }]}>{r.sgstPaise > 0 ? formatPaise(r.sgstPaise) : '—'}</Text>
                          <Text style={[styles.cellText, { width: 70, textAlign: 'right' }]}>{r.igstPaise > 0 ? formatPaise(r.igstPaise) : '—'}</Text>
                          <Text style={[styles.cellParticularText, { width: 90, textAlign: 'right' }]}>{formatPaise(r.totalPaise)}</Text>
                        </TouchableOpacity>
                      ))
                    )}

                    <View style={styles.tableFooterRow}>
                      <Text style={[styles.footerText, { width: 285 }]}>TOTALS</Text>
                      <Text style={[styles.footerText, { width: 90, textAlign: 'right' }]}>{formatPaise(totals.taxableSum)}</Text>
                      <Text style={[styles.footerText, { width: 70, textAlign: 'right' }]}>{formatPaise(totals.cgstSum)}</Text>
                      <Text style={[styles.footerText, { width: 70, textAlign: 'right' }]}>{formatPaise(totals.sgstSum)}</Text>
                      <Text style={[styles.footerText, { width: 70, textAlign: 'right' }]}>{formatPaise(totals.igstSum)}</Text>
                      <Text style={[styles.footerText, { width: 90, textAlign: 'right' }]}>{formatPaise(totals.totalSum)}</Text>
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>
          );
        })()}

        {/* 6. OUTSTANDING RECEIVABLES & PAYABLES (AGING ANALYSIS) */}
        {(activeTab === 'receivables' || activeTab === 'payables') && (() => {
          const type = activeTab === 'receivables' ? 'receivables' : 'payables';
          const records = getOutstandingMetrics(type);
          const totals = {
            outstandingSum: records.reduce((s, r) => s + r.totalOutstandingPaise, 0),
            sum0_30: records.reduce((s, r) => s + r.bucket0_30, 0),
            sum31_60: records.reduce((s, r) => s + r.bucket31_60, 0),
            sum61_90: records.reduce((s, r) => s + r.bucket61_90, 0),
            sum90_plus: records.reduce((s, r) => s + r.bucket90_plus, 0),
          };

          return (
            <View style={styles.reportContainer}>
              <View style={styles.tableCard}>
                <Text style={styles.statementSectionTitle}>
                  {activeTab === 'receivables' ? 'Bills Receivable Aging Statement' : 'Bills Payable Aging Statement'}
                </Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={{ minWidth: 600 }}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.columnHeader, { width: 140 }]}>Party Ledger Name</Text>
                      <Text style={[styles.columnHeader, { width: 90, textAlign: 'right' }]}>Total O/S (₹)</Text>
                      <Text style={[styles.columnHeader, { width: 70, textAlign: 'right' }]}>0-30 Days</Text>
                      <Text style={[styles.columnHeader, { width: 70, textAlign: 'right' }]}>31-60 Days</Text>
                      <Text style={[styles.columnHeader, { width: 70, textAlign: 'right' }]}>61-90 Days</Text>
                      <Text style={[styles.columnHeader, { width: 80, textAlign: 'right' }]}>90+ Days</Text>
                    </View>

                    {records.length === 0 ? (
                      <Text style={styles.plEmptyText}>— No outstanding bills recorded —</Text>
                    ) : (
                      records.map((r, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.tableRow}
                          onPress={() => {
                            triggerHaptic();
                            router.push(`/ledger/${r.ledgerId}`);
                          }}
                        >
                          <Text style={[styles.cellParticularText, { width: 140 }]} numberOfLines={1}>{r.partyName}</Text>
                          <Text style={[styles.cellParticularText, { width: 90, textAlign: 'right', color: colors.primary }]}>
                            {formatPaise(r.totalOutstandingPaise)}
                          </Text>
                          <Text style={[styles.cellText, { width: 70, textAlign: 'right' }]}>{r.bucket0_30 > 0 ? formatPaise(r.bucket0_30) : '—'}</Text>
                          <Text style={[styles.cellText, { width: 70, textAlign: 'right' }]}>{r.bucket31_60 > 0 ? formatPaise(r.bucket31_60) : '—'}</Text>
                          <Text style={[styles.cellText, { width: 70, textAlign: 'right' }]}>{r.bucket61_90 > 0 ? formatPaise(r.bucket61_90) : '—'}</Text>
                          <Text style={[styles.cellText, { width: 80, textAlign: 'right', color: colors.danger }]}>
                            {r.bucket90_plus > 0 ? formatPaise(r.bucket90_plus) : '—'}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}

                    <View style={styles.tableFooterRow}>
                      <Text style={[styles.footerText, { width: 140 }]}>TOTALS</Text>
                      <Text style={[styles.footerText, { width: 90, textAlign: 'right' }]}>{formatPaise(totals.outstandingSum)}</Text>
                      <Text style={[styles.footerText, { width: 70, textAlign: 'right' }]}>{formatPaise(totals.sum0_30)}</Text>
                      <Text style={[styles.footerText, { width: 70, textAlign: 'right' }]}>{formatPaise(totals.sum31_60)}</Text>
                      <Text style={[styles.footerText, { width: 70, textAlign: 'right' }]}>{formatPaise(totals.sum61_90)}</Text>
                      <Text style={[styles.footerText, { width: 80, textAlign: 'right' }]}>{formatPaise(totals.sum90_plus)}</Text>
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>
          );
        })()}

        {/* 7. CASH FLOW STATEMENT */}
        {activeTab === 'cashflow' && (() => {
          const data = getCashFlowMetrics();
          return (
            <View style={styles.reportContainer}>
              <View style={styles.tableCard}>
                <Text style={styles.statementSectionTitle}>Statement of Cash Flows (Indirect Method)</Text>
                
                {/* Operating */}
                <Text style={styles.plSectionLabel}>A. Operating Activities</Text>
                <View style={styles.plItemRow}>
                  <Text style={styles.plItemName}>Net Profit Before Tax</Text>
                  <Text style={styles.plItemVal}>{formatPaise(data.netProfit)}</Text>
                </View>
                <View style={styles.plItemRow}>
                  <Text style={[styles.plItemName, { paddingLeft: 12 }]}>Change in Sundry Debtors (Receivables)</Text>
                  <Text style={styles.plItemVal}>{formatPaise(-data.changeInDebtors)}</Text>
                </View>
                <View style={styles.plItemRow}>
                  <Text style={[styles.plItemName, { paddingLeft: 12 }]}>Change in Sundry Creditors (Payables)</Text>
                  <Text style={styles.plItemVal}>{formatPaise(data.changeInCreditors)}</Text>
                </View>
                <View style={styles.plSubtotalRow}>
                  <Text style={styles.plSubtotalText}>Net Cash from Operating Activities</Text>
                  <Text style={[styles.plSubtotalVal, { fontFamily: 'PlusJakartaSans_700Bold' }]}>{formatPaise(data.operatingCashFlow)}</Text>
                </View>

                {/* Investing */}
                <Text style={[styles.plSectionLabel, { marginTop: 12 }]}>B. Investing Activities</Text>
                <View style={styles.plItemRow}>
                  <Text style={styles.plItemName}>Purchase / Sale of Fixed Assets</Text>
                  <Text style={styles.plItemVal}>{formatPaise(-data.changeInFixedAssets)}</Text>
                </View>
                <View style={styles.plSubtotalRow}>
                  <Text style={styles.plSubtotalText}>Net Cash used in Investing Activities</Text>
                  <Text style={[styles.plSubtotalVal, { fontFamily: 'PlusJakartaSans_700Bold' }]}>{formatPaise(data.investingCashFlow)}</Text>
                </View>

                {/* Financing */}
                <Text style={[styles.plSectionLabel, { marginTop: 12 }]}>C. Financing Activities</Text>
                <View style={styles.plItemRow}>
                  <Text style={styles.plItemName}>Capital Contribution / Drawings</Text>
                  <Text style={styles.plItemVal}>{formatPaise(-data.changeInCapital)}</Text>
                </View>
                <View style={styles.plItemRow}>
                  <Text style={styles.plItemName}>Loans Net Infusion / Repayment</Text>
                  <Text style={styles.plItemVal}>{formatPaise(-data.changeInLoans)}</Text>
                </View>
                <View style={styles.plSubtotalRow}>
                  <Text style={styles.plSubtotalText}>Net Cash from Financing Activities</Text>
                  <Text style={[styles.plSubtotalVal, { fontFamily: 'PlusJakartaSans_700Bold' }]}>{formatPaise(data.financingCashFlow)}</Text>
                </View>

                {/* Net Change */}
                <View style={styles.plTotalRow}>
                  <Text style={styles.plTotalText}>Net Cash Flow (A + B + C)</Text>
                  <Text style={[styles.plTotalVal, { color: data.netCashFlow >= 0 ? colors.success : colors.danger }]}>
                    {formatPaise(data.netCashFlow)}
                  </Text>
                </View>

                {/* Closing reconciliation */}
                <View style={[styles.plItemRow, { marginTop: 12 }]}>
                  <Text style={styles.plItemName}>Opening Cash & Bank Balances</Text>
                  <Text style={styles.plItemVal}>{formatPaise(data.openingCashBank)}</Text>
                </View>
                <View style={[styles.plItemRow, { borderBottomWidth: 2, borderBottomColor: colors.text, paddingBottom: 8 }]}>
                  <Text style={[styles.plItemName, { fontFamily: 'PlusJakartaSans_700Bold' }]}>Closing Cash & Bank Balances</Text>
                  <Text style={[styles.plItemVal, { fontFamily: 'PlusJakartaSans_700Bold' }]}>{formatPaise(data.closingCashBank)}</Text>
                </View>
              </View>
            </View>
          );
        })()}

        {/* 6. RATIO ANALYSIS REPORT */}
        {activeTab === 'ratios' && (() => {
          const metrics = getRatioMetrics();
          
          const getCurrentRatioStatus = (r: number) => {
            if (r >= 1.5) return { label: 'HEALTHY', color: colors.success, bg: colors.success + '10' };
            if (r >= 1.0) return { label: 'ACCEPTABLE', color: '#D97706', bg: '#D9770610' };
            return { label: 'CRITICAL', color: colors.danger, bg: colors.danger + '10' };
          };

          const getQuickRatioStatus = (r: number) => {
            if (r >= 1.0) return { label: 'HEALTHY', color: colors.success, bg: colors.success + '10' };
            return { label: 'CRITICAL', color: colors.danger, bg: colors.danger + '10' };
          };

          const getDebtToEquityStatus = (r: number) => {
            if (r <= 1.0) return { label: 'SAFE', color: colors.success, bg: colors.success + '10' };
            if (r <= 2.0) return { label: 'MODERATE', color: '#D97706', bg: '#D9770610' };
            return { label: 'HIGH LEVERAGE', color: colors.danger, bg: colors.danger + '10' };
          };

          const crStatus = getCurrentRatioStatus(metrics.currentRatio);
          const qrStatus = getQuickRatioStatus(metrics.quickRatio);
          const deStatus = getDebtToEquityStatus(metrics.debtToEquity);

          return (
            <View style={styles.reportContainer}>
              <View style={styles.ratioGrid}>
                {/* 1. Current Ratio */}
                <View style={styles.ratioCard}>
                  <View style={styles.ratioCardHeader}>
                    <Text style={styles.ratioTitle} numberOfLines={1}>Current Ratio</Text>
                    <View style={[styles.statusBadge, { backgroundColor: crStatus.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: crStatus.color }]}>{crStatus.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.ratioVal}>{metrics.currentRatio.toFixed(2)}:1</Text>
                  <Text style={styles.ratioFormula}>Current Assets / Current Liabilities</Text>
                  <View style={styles.ratioBarBg}>
                    <View style={[styles.ratioBarFill, { width: `${Math.min(100, metrics.currentRatio * 40)}%`, backgroundColor: crStatus.color }]} />
                  </View>
                  <View style={styles.ratioBreakdown}>
                    <Text style={styles.ratioBreakdownText}>CA: {formatPaise(metrics.currentAssets)}</Text>
                    <Text style={styles.ratioBreakdownText}>CL: {formatPaise(metrics.currentLiabilities)}</Text>
                  </View>
                </View>

                {/* 2. Quick Ratio */}
                <View style={styles.ratioCard}>
                  <View style={styles.ratioCardHeader}>
                    <Text style={styles.ratioTitle} numberOfLines={1}>Quick Ratio</Text>
                    <View style={[styles.statusBadge, { backgroundColor: qrStatus.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: qrStatus.color }]}>{qrStatus.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.ratioVal}>{metrics.quickRatio.toFixed(2)}:1</Text>
                  <Text style={styles.ratioFormula}>(Current Assets - Stock) / CL</Text>
                  <View style={styles.ratioBarBg}>
                    <View style={[styles.ratioBarFill, { width: `${Math.min(100, metrics.quickRatio * 60)}%`, backgroundColor: qrStatus.color }]} />
                  </View>
                  <View style={styles.ratioBreakdown}>
                    <Text style={styles.ratioBreakdownText}>Quick: {formatPaise(metrics.currentAssets - metrics.stockInHand)}</Text>
                    <Text style={styles.ratioBreakdownText}>CL: {formatPaise(metrics.currentLiabilities)}</Text>
                  </View>
                </View>

                {/* 3. Debt to Equity */}
                <View style={styles.ratioCard}>
                  <View style={styles.ratioCardHeader}>
                    <Text style={styles.ratioTitle} numberOfLines={1}>Debt to Equity</Text>
                    <View style={[styles.statusBadge, { backgroundColor: deStatus.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: deStatus.color }]}>{deStatus.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.ratioVal}>{metrics.debtToEquity.toFixed(2)}</Text>
                  <Text style={styles.ratioFormula}>Total Loan Debt / Equity</Text>
                  <View style={styles.ratioBarBg}>
                    <View style={[styles.ratioBarFill, { width: `${Math.min(100, metrics.debtToEquity * 50)}%`, backgroundColor: deStatus.color }]} />
                  </View>
                  <View style={styles.ratioBreakdown}>
                    <Text style={styles.ratioBreakdownText}>Debt: {formatPaise(metrics.totalDebt)}</Text>
                    <Text style={styles.ratioBreakdownText}>Equity: {formatPaise(metrics.totalEquity)}</Text>
                  </View>
                </View>

                {/* 4. Gross Profit Margin */}
                <View style={styles.ratioCard}>
                  <View style={styles.ratioCardHeader}>
                    <Text style={styles.ratioTitle} numberOfLines={1}>Gross Margin</Text>
                  </View>
                  <Text style={[styles.ratioVal, { color: metrics.grossProfitMargin >= 0 ? colors.success : colors.danger }]}>
                    {metrics.grossProfitMargin.toFixed(1)}%
                  </Text>
                  <Text style={styles.ratioFormula}>Gross Profit / Net Revenue * 100</Text>
                  <View style={styles.ratioBarBg}>
                    <View style={[styles.ratioBarFill, { width: `${Math.min(100, Math.max(0, metrics.grossProfitMargin))}%`, backgroundColor: colors.success }]} />
                  </View>
                  <View style={styles.ratioBreakdown}>
                    <Text style={styles.ratioBreakdownText}>Revenue: {formatPaise(metrics.totalRevenue)}</Text>
                  </View>
                </View>

                {/* 5. Net Profit Margin */}
                <View style={styles.ratioCard}>
                  <View style={styles.ratioCardHeader}>
                    <Text style={styles.ratioTitle} numberOfLines={1}>Net Margin</Text>
                  </View>
                  <Text style={[styles.ratioVal, { color: metrics.netProfitMargin >= 0 ? colors.success : colors.danger }]}>
                    {metrics.netProfitMargin.toFixed(1)}%
                  </Text>
                  <Text style={styles.ratioFormula}>Net Profit / Net Revenue * 100</Text>
                  <View style={styles.ratioBarBg}>
                    <View style={[styles.ratioBarFill, { width: `${Math.min(100, Math.max(0, metrics.netProfitMargin))}%`, backgroundColor: colors.primary }]} />
                  </View>
                  <View style={styles.ratioBreakdown}>
                    <Text style={styles.ratioBreakdownText}>Net Profit: {formatPaise(metrics.netProfit)}</Text>
                  </View>
                </View>

                {/* 6. Return on Equity */}
                <View style={styles.ratioCard}>
                  <View style={styles.ratioCardHeader}>
                    <Text style={styles.ratioTitle} numberOfLines={1}>ROE</Text>
                  </View>
                  <Text style={[styles.ratioVal, { color: metrics.returnOnEquity >= 0 ? colors.success : colors.danger }]}>
                    {metrics.returnOnEquity.toFixed(1)}%
                  </Text>
                  <Text style={styles.ratioFormula}>Net Profit / Equity * 100</Text>
                  <View style={styles.ratioBarBg}>
                    <View style={[styles.ratioBarFill, { width: `${Math.min(100, Math.max(0, metrics.returnOnEquity))}%`, backgroundColor: colors.success }]} />
                  </View>
                  <View style={styles.ratioBreakdown}>
                    <Text style={styles.ratioBreakdownText}>Equity: {formatPaise(metrics.totalEquity)}</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })()}
      </ScrollView>

      {/* Custom Date Modal */}
      <Modal
        visible={showCustomDateModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowCustomDateModal(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoidingView}
          >
            <View style={styles.dateModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Set Custom Period</Text>
                <TouchableOpacity onPress={() => setShowCustomDateModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Start Date (DD/MM/YYYY)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 01/04/2026"
                placeholderTextColor={colors.textMuted}
                value={customStartStr}
                onChangeText={setCustomStartStr}
                maxLength={10}
              />

              <Text style={styles.fieldLabel}>End Date (DD/MM/YYYY)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 30/04/2026"
                placeholderTextColor={colors.textMuted}
                value={customEndStr}
                onChangeText={setCustomEndStr}
                maxLength={10}
              />

              <TouchableOpacity style={styles.applyBtn} onPress={handleApplyCustomDates}>
                <Text style={styles.applyBtnText}>Apply Period</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: colors.text,
  },
  headerSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  shareBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10.5,
    color: colors.primary,
  },
  tabBarContainer: {
    backgroundColor: colors.surface,
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    alignItems: 'center',
    height: '100%',
  },
  tabItem: {
    paddingHorizontal: 16,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: colors.primary,
  },
  tabItemText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12.5,
    color: colors.textMuted,
  },
  tabItemTextActive: {
    color: colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  pillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  pillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillBtnActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  pillText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginTop: 10,
    gap: 6,
  },
  periodText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11.5,
    color: colors.textMuted,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  reportContainer: {
    width: '100%',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  bannerSuccess: {
    backgroundColor: '#10B981',
  },
  bannerError: {
    backgroundColor: '#EF4444',
  },
  bannerText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
    color: '#FFFFFF',
  },
  tableCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: colors.text,
    paddingBottom: 8,
    marginBottom: 8,
  },
  columnHeader: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: colors.text,
  },
  colParticulars: {
    flex: 1.8,
  },
  colAmount: {
    flex: 1.1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight + '40',
  },
  cellParticularText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.text,
  },
  cellGroupText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  cellText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  amountText: {
    textAlign: 'right',
  },
  tableFooterRow: {
    flexDirection: 'row',
    borderTopWidth: 2,
    borderTopColor: colors.text,
    borderBottomWidth: 2,
    borderBottomColor: colors.text,
    paddingVertical: 10,
    marginTop: 12,
  },
  footerText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 12,
    color: colors.text,
  },
  statementSectionTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 15,
    color: colors.text,
    marginBottom: 10,
  },
  plSectionLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: colors.primary,
    marginTop: 8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  plItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  plItemName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.text,
  },
  plItemVal: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  plSubtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingVertical: 6,
    marginTop: 2,
  },
  plSubtotalText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  plSubtotalVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
    color: colors.text,
  },
  plTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    borderTopColor: colors.text,
    borderBottomWidth: 2,
    borderBottomColor: colors.text,
    paddingVertical: 10,
    marginTop: 10,
  },
  plTotalText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 13.5,
    color: colors.text,
  },
  plTotalVal: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 13.5,
  },
  plEmptyText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 8,
  },
  bsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  bsSideCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
    justifyContent: 'space-between',
  },
  bsSideTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 13.5,
    color: colors.text,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.text,
    paddingBottom: 6,
    marginBottom: 8,
  },
  bsList: {
    gap: 4,
    flex: 1,
    paddingBottom: 16,
  },
  bsItemName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.text,
    flex: 1.2,
  },
  bsItemVal: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
    flex: 0.8,
    textAlign: 'right',
  },
  bsTotalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    borderTopColor: colors.text,
    paddingTop: 8,
    marginTop: 8,
  },
  bsTotalText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 12.5,
    color: colors.text,
  },
  bsTotalVal: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 12.5,
    color: colors.text,
  },
  subTabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
    marginBottom: 12,
  },
  subTabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  subTabActive: {
    backgroundColor: colors.primary + '10',
  },
  subTabText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textMuted,
  },
  subTabTextActive: {
    color: colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.textMuted,
  },
  g3bSection: {
    marginVertical: 4,
  },
  g3bSectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
    color: colors.primary,
    marginBottom: 8,
  },
  g3bRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  g3bLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  g3bVal: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12.5,
    color: colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  keyboardAvoidingView: {
    width: '100%',
  },
  dateModalContent: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: colors.text,
  },
  fieldLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.text,
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
  },
  applyBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  applyBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 10,
  },
  ratioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  ratioCard: {
    width: '48%',
    minWidth: 145,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    gap: 6,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  ratioCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  ratioTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 8,
  },
  ratioVal: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: colors.text,
    marginTop: 2,
  },
  ratioFormula: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 9,
    color: colors.textMuted,
  },
  ratioBarBg: {
    height: 5,
    backgroundColor: colors.background,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 2,
  },
  ratioBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  ratioBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  ratioBreakdownText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 8.5,
    color: colors.textMuted,
  },
});
