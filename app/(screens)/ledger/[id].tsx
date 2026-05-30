/**
 * TallyTracker — Ledger Statement Screen
 *
 * Implements:
 * 1. Detailed transaction audit log for a single ledger.
 * 2. Real-time chronological sorting of vouchers.
 * 3. Auto-calculated running balance (accounting for ledger nature - Dr/Cr).
 * 4. Printable details click-through to voucher detail screen.
 * 5. Simulated CSV exporter using built-in React Native Sharing.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { Entity, Voucher, VoucherLine, Ledger, AccountGroup } from '@/db';
import { TABLE_NAMES, VOUCHER_TYPE_LABELS, VoucherType, AccountNature } from '@/utils/constants';
import { Q } from '@nozbe/watermelondb';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { formatPaise } from '@/utils/money';
import { formatDateShort } from '@/utils/date';
import { shareCsvFile, exportLedgerToPdf } from '@/services/pdf';
import { useAuthStore } from '@/stores/authStore';

interface AuditLine {
  id: string;
  voucherId: string;
  number: string;
  date: Date;
  voucherType: VoucherType;
  refNumber: string;
  narration: string;
  drCr: 'Dr' | 'Cr';
  amountPaise: number;
  runningBalancePaise: number;
  runningBalanceDrCr: 'Dr' | 'Cr';
}

export default function LedgerStatementScreen() {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { id: ledgerId } = useLocalSearchParams<{ id: string }>();
  const { isPremium } = useAuthStore();

  // Database Records state
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [group, setGroup] = useState<AccountGroup | null>(null);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [auditLines, setAuditLines] = useState<AuditLine[]>([]);
  const [totalDr, setTotalDr] = useState(0);
  const [totalCr, setTotalCr] = useState(0);

  const isHindi = i18n.language === 'hi';
  const getLabel = (enStr: string, hiStr: string) => (isHindi ? hiStr : enStr);

  const triggerHaptic = (style = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  const loadData = async () => {
    if (!ledgerId) return;

    try {
      // 1. Fetch Ledger
      const led = await database.get<Ledger>(TABLE_NAMES.LEDGERS).find(ledgerId);
      setLedger(led);

      // 2. Fetch Group & Entity
      const gp = await database.get<AccountGroup>(TABLE_NAMES.ACCOUNT_GROUPS).find(led.groupId);
      setGroup(gp);

      const ent = await database.get<Entity>(TABLE_NAMES.ENTITIES).find(led.entityId);
      setEntity(ent);

      // 3. Fetch all non-cancelled Vouchers for this entity (filtered at DB level)
      const activeVouchers = await database.get<Voucher>(TABLE_NAMES.VOUCHERS)
        .query(
          Q.where('entity_id', led.entityId),
          Q.where('is_cancelled', false)
        )
        .fetch();
      const voucherMap = new Map(activeVouchers.map((v) => [v.id, v]));

      // 4. Fetch VoucherLines for this ledger (filtered at DB level)
      const ledgerLines = await database.get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES)
        .query(Q.where('ledger_id', led.id))
        .fetch();
      const filteredLines = ledgerLines.filter((l) => voucherMap.has(l.voucherId));

      // Sort lines chronologically
      const sortedLines = filteredLines.sort((a, b) => {
        const vA = voucherMap.get(a.voucherId)!;
        const vB = voucherMap.get(b.voucherId)!;
        const diff = vA.date.getTime() - vB.date.getTime();
        if (diff !== 0) return diff;
        return vA.number.localeCompare(vB.number);
      });

      // 5. Calculate Running Balance
      // Starting balance
      let currentBal = led.openingBalancePaise || 0;
      let currentDrCr = led.openingBalanceDrCr || 'Dr';

      let drSum = 0;
      let crSum = 0;

      const linesList: AuditLine[] = sortedLines.map((line) => {
        const v = voucherMap.get(line.voucherId)!;
        
        if (line.drCr === 'Dr') {
          drSum += line.amountPaise;
        } else {
          crSum += line.amountPaise;
        }

        // Apply change to balance:
        // Dr increases assets/expenses, decreases liabilities/incomes/equity
        // Cr decreases assets/expenses, increases liabilities/incomes/equity
        const isAssetOrExpense = gp.nature === 'asset' || gp.nature === 'expense';
        
        // Convert current balance to signed integer (Dr positive, Cr negative)
        let signedBalance = currentDrCr === 'Dr' ? currentBal : -currentBal;
        
        if (line.drCr === 'Dr') {
          signedBalance += line.amountPaise;
        } else {
          signedBalance -= line.amountPaise;
        }

        currentBal = Math.abs(signedBalance);
        currentDrCr = signedBalance >= 0 ? 'Dr' : 'Cr';

        return {
          id: line.id,
          voucherId: v.id,
          number: v.number,
          date: v.date,
          voucherType: v.voucherType,
          refNumber: v.refNumber || '',
          narration: v.narration || '',
          drCr: line.drCr,
          amountPaise: line.amountPaise,
          runningBalancePaise: currentBal,
          runningBalanceDrCr: currentDrCr,
        };
      });

      setAuditLines(linesList);
      setTotalDr(drSum);
      setTotalCr(crSum);

    } catch (e) {
      console.error('Failed to load ledger statement audit lines:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, [ledgerId]);

  const handleShareCSV = async () => {
    if (!ledger || !group || !entity) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Build CSV String
      let csv = `Ledger Statement: ${ledger.name}\n`;
      csv += `Group: ${group.name} (${group.nature.toUpperCase()})\n`;
      csv += `Client: ${entity.name}\n`;
      csv += `Opening Balance: ${formatPaise(ledger.openingBalancePaise)} ${ledger.openingBalanceDrCr}\n\n`;
      csv += `Date,Voucher Type,Voucher No,Debit (INR),Credit (INR),Balance,Balance Type\n`;

      auditLines.forEach((line) => {
        const drStr = line.drCr === 'Dr' ? (line.amountPaise / 100).toFixed(2) : '0.00';
        const crStr = line.drCr === 'Cr' ? (line.amountPaise / 100).toFixed(2) : '0.00';
        const balStr = (line.runningBalancePaise / 100).toFixed(2);
        
        csv += `${formatDateShort(line.date)},${VOUCHER_TYPE_LABELS[line.voucherType]},${line.number},${drStr},${crStr},${balStr},${line.runningBalanceDrCr}\n`;
      });

      csv += `\nTOTAL,Dr Total: ${(totalDr / 100).toFixed(2)},Cr Total: ${(totalCr / 100).toFixed(2)}\n`;

      const fileName = `${entity.name.replace(/\s+/g, '_')}_Ledger_${ledger.name.replace(/\s+/g, '_')}_Statement.csv`;
      await shareCsvFile(csv, fileName);
    } catch (error: any) {
      Alert.alert('CSV Export Failed', error.message);
    }
  };

  const handleExportPDF = async () => {
    if (!ledger || !group || !entity) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    if (!isPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(
        'Pro Feature Locked',
        'Print-ready Georgia serif Ledger statement book export is a Pro-only feature. Upgrade to customize and print accounting sheets!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade to Pro', onPress: () => router.push('/premium') }
        ]
      );
      return;
    }

    try {
      await exportLedgerToPdf(
        ledger,
        group,
        entity,
        auditLines,
        totalDr,
        totalCr,
        closingBalance,
        closingDrCr
      );
    } catch (error: any) {
      Alert.alert('PDF Export Failed', error.message || 'Error occurred compiling ledger statement PDF.');
    }
  };

  if (!ledger || !group || !entity) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{getLabel('Loading Statement...', 'लोड हो रहा है...')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Final Closing balance calculation for footer
  const isAssetExpense = group.nature === 'asset' || group.nature === 'expense';
  let netOp = ledger.openingBalanceDrCr === 'Dr' ? ledger.openingBalancePaise : -ledger.openingBalancePaise;
  let finalNet = netOp + totalDr - totalCr;
  const closingBalance = Math.abs(finalNet);
  const closingDrCr = finalNet >= 0 ? 'Dr' : 'Cr';

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{ledger.name}</Text>
        
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareCSV}>
            <Ionicons name="share-social-outline" size={14} color={colors.primary} />
            <Text style={styles.shareBtnText}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.shareBtn, { marginLeft: 8 }]} onPress={handleExportPDF}>
            <Ionicons name={isPremium ? "document-text-outline" : "lock-closed-outline"} size={13} color={isPremium ? colors.primary : colors.textMuted} />
            <Text style={[styles.shareBtnText, !isPremium && { color: colors.textMuted }]}>PDF</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Ledger Metadata Card */}
        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaLabel}>{getLabel('Account Group', 'खाता समूह')}</Text>
              <Text style={styles.metaValue}>{group.name}</Text>
            </View>
            <View style={styles.natureBadge}>
              <Text style={styles.natureText}>{group.nature.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.balancesSummaryRow}>
            <View style={styles.balItem}>
              <Text style={styles.metaLabel}>{getLabel('Opening Balance', 'प्रारंभिक शेष')}</Text>
              <Text style={styles.opBalText}>
                {formatPaise(ledger.openingBalancePaise)} {ledger.openingBalanceDrCr}
              </Text>
            </View>

            <View style={[styles.balItem, { alignItems: 'flex-end' }]}>
              <Text style={styles.metaLabel}>{getLabel('Closing Balance', 'अंतिम शेष')}</Text>
              <Text style={[styles.closingBalText, { color: closingDrCr === 'Dr' ? colors.primary : colors.success }]}>
                {formatPaise(closingBalance)} {closingDrCr}
              </Text>
            </View>
          </View>
        </View>

        {/* Ledger Statement Table */}
        <View style={styles.tableCard}>
          <Text style={styles.tableTitle}>Ledger Audit Book</Text>

          {/* Table Headers */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.columnHeader, styles.colDate]}>Date</Text>
            <Text style={[styles.columnHeader, styles.colParticulars]}>Particulars</Text>
            <Text style={[styles.columnHeader, styles.colAmount, { textAlign: 'right' }]}>Debit (₹)</Text>
            <Text style={[styles.columnHeader, styles.colAmount, { textAlign: 'right' }]}>Credit (₹)</Text>
          </View>

          {/* Table Rows */}
          {auditLines.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No ledger lines recorded</Text>
            </View>
          ) : (
            <View style={styles.tableBody}>
              {auditLines.map((line) => {
                const isDr = line.drCr === 'Dr';
                return (
                  <TouchableOpacity
                    key={line.id}
                    style={styles.tableRow}
                    onPress={() => {
                      triggerHaptic();
                      router.push(`/voucher/${line.voucherId}`);
                    }}
                  >
                    <View style={styles.colDate}>
                      <Text style={styles.cellDateText}>{formatDateShort(line.date)}</Text>
                    </View>

                    <View style={styles.colParticulars}>
                      <Text style={styles.cellParticularsText}>
                        {VOUCHER_TYPE_LABELS[line.voucherType]}
                      </Text>
                      <Text style={styles.cellVNumText}>#{line.number}</Text>
                      {line.narration ? (
                        <Text style={styles.cellRemarksText} numberOfLines={1}>
                          "{line.narration}"
                        </Text>
                      ) : null}
                    </View>

                    <Text style={[styles.cellText, styles.colAmount, styles.amountText]}>
                      {isDr ? formatPaise(line.amountPaise) : '—'}
                    </Text>
                    <Text style={[styles.cellText, styles.colAmount, styles.amountText]}>
                      {!isDr ? formatPaise(line.amountPaise) : '—'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Table Footer (Period Totals) */}
          <View style={styles.tableFooterRow}>
            <Text style={[styles.footerText, styles.colDate]}>TOTAL</Text>
            <Text style={[styles.footerText, styles.colParticulars]}>—</Text>
            <Text style={[styles.footerText, styles.colAmount, styles.amountText]}>
              {formatPaise(totalDr)}
            </Text>
            <Text style={[styles.footerText, styles.colAmount, styles.amountText]}>
              {formatPaise(totalCr)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    padding: 4,
  },
  topBarTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 16,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
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
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  metaCard: {
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
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: colors.text,
    marginTop: 4,
  },
  natureBadge: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  natureText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 9,
    color: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 12,
  },
  balancesSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balItem: {
    flex: 1,
  },
  opBalText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  closingBalText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 15,
    marginTop: 4,
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
  tableTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 15,
    color: colors.text,
    marginBottom: 12,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: colors.text,
    paddingBottom: 8,
    marginTop: 8,
  },
  columnHeader: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: colors.text,
  },
  colDate: {
    flex: 1.1,
  },
  colParticulars: {
    flex: 1.9,
  },
  colAmount: {
    flex: 1.1,
  },
  tableBody: {
    marginVertical: 8,
    gap: 12,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight + '40',
  },
  cellDateText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textSecondary,
  },
  cellParticularsText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.text,
  },
  cellVNumText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: colors.primary,
    marginTop: 2,
  },
  cellRemarksText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  cellText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12.5,
    color: colors.text,
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
    paddingVertical: 8,
    marginTop: 12,
  },
  footerText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 12,
    color: colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: colors.textMuted,
  },
  emptyContainer: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.textMuted,
  },
});
