/**
 * TallyTracker — Financial Year Closing Screen
 *
 * Implements standard year-end closing:
 * 1. Checks transactional balance invariants.
 * 2. Displays cumulative Retained Earnings (Net Profit/Loss).
 * 3. Selector picker for Capital Account (Equity ledgers).
 * 4. Generates a closing Journal Voucher transferring profit/loss to selected Capital account.
 * 5. Appends the locked year to Entity's closed_fy_years JSON record.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { Entity, Ledger, AccountGroup, Voucher, VoucherLine } from '@/db';
import { TABLE_NAMES } from '@/utils/constants';
import { Q } from '@nozbe/watermelondb';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useEntityStore } from '@/stores/entityStore';
import { formatPaise } from '@/utils/money';
import { formatDateShort } from '@/utils/date';
import LedgerPicker from '@/components/LedgerPicker';

export default function FYCloseScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const { activeEntityId } = useEntityStore();
  const [entity, setEntity] = useState<Entity | null>(null);

  // Closing configuration state
  const [equityLedgers, setEquityLedgers] = useState<Ledger[]>([]);
  const [selectedCapitalLedger, setSelectedCapitalLedger] = useState<Ledger | null>(null);
  const [showLedgerPicker, setShowLedgerPicker] = useState(false);

  // Invariant validation checks
  const [vouchersBalanced, setVouchersBalanced] = useState(true);
  const [netProfitPaise, setNetProfitPaise] = useState(0);
  const [lockedYears, setLockedYears] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const triggerHaptic = (style = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  const loadData = async () => {
    if (!activeEntityId) return;
    setIsLoading(true);

    try {
      // 1. Fetch active entity details
      const ent = await database.get<Entity>(TABLE_NAMES.ENTITIES).find(activeEntityId);
      setEntity(ent);

      const closed = ent.closedFyYears ? JSON.parse(ent.closedFyYears) : [];
      setLockedYears(closed);

      // 2. Fetch Equity/Capital Ledgers
      const groups = await database.get<AccountGroup>(TABLE_NAMES.ACCOUNT_GROUPS).query().fetch();
      const equityGroupIds = new Set(
        groups
          .filter((g) => g.entityId === activeEntityId && (g.nature === 'equity' || g.name.toLowerCase().includes('capital')))
          .map((g) => g.id)
      );

      const ledgers = await database.get<Ledger>(TABLE_NAMES.LEDGERS).query().fetch();
      const eqLedgers = ledgers.filter((l) => l.entityId === activeEntityId && equityGroupIds.has(l.groupId) && !l.isArchived);
      setEquityLedgers(eqLedgers);

      // Pre-select first Capital Account if available
      if (eqLedgers.length > 0) {
        setSelectedCapitalLedger(eqLedgers[0]!);
      }

      // 3. Verify Vouchers double-entry balancing invariant
      const vouchers = await database.get<Voucher>(TABLE_NAMES.VOUCHERS)
        .query(
          Q.where('entity_id', activeEntityId),
          Q.where('is_cancelled', false)
        )
        .fetch();
      const voucherIds = vouchers.map((v) => v.id);

      const lines = voucherIds.length > 0
        ? await database
            .get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES)
            .query(Q.where('voucher_id', Q.oneOf(voucherIds)))
            .fetch()
        : [];

      let drSum = 0;
      let crSum = 0;
      lines.forEach((line) => {
        if (line.drCr === 'Dr') drSum += line.amountPaise;
        else crSum += line.amountPaise;
      });

      setVouchersBalanced(drSum === crSum);

      // 4. Calculate Net Profit/Loss (inception to date)
      let totalSales = 0;
      let totalExpenses = 0;

      const groupMap = new Map(groups.map((g) => [g.id, g]));

      ledgers.forEach((b) => {
        if (b.entityId !== activeEntityId || b.isArchived) return;

        const ledgerLines = lines.filter((l) => l.ledgerId === b.id);
        let periodDr = 0;
        let periodCr = 0;
        ledgerLines.forEach((l) => {
          if (l.drCr === 'Dr') periodDr += l.amountPaise;
          else periodCr += l.amountPaise;
        });

        // Add opening balance
        if (b.openingBalancePaise > 0) {
          if (b.openingBalanceDrCr === 'Dr') periodDr += b.openingBalancePaise;
          else periodCr += b.openingBalancePaise;
        }

        const grp = groupMap.get(b.groupId);
        if (!grp) return;

        if (grp.nature === 'income') {
          totalSales += (periodCr - periodDr);
        } else if (grp.nature === 'expense') {
          totalExpenses += (periodDr - periodCr);
        }
      });

      setNetProfitPaise(totalSales - totalExpenses);
    } catch (e) {
      console.error('Failed to compute closing invariants:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeEntityId]);

  // 5. Close Year Execution Trigger
  const handleCloseFinancialYear = async () => {
    if (!entity || !selectedCapitalLedger) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    if (!vouchersBalanced) {
      Alert.alert(
        'Closing Blocked',
        'Vouchers are out of balance! Please review Trial Balance statements before closing.'
      );
      return;
    }

    // Determine target year to close
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentFY = `${currentYear - 1}-${currentYear.toString().substring(2)}`;

    if (lockedYears.includes(currentFY)) {
      Alert.alert('Closing Blocked', `Financial Year ${currentFY} has already been closed and locked!`);
      return;
    }

    Alert.alert(
      'Confirm Close Financial Year',
      `Close Financial Year ${currentFY}? This will transfer ${netProfitPaise >= 0 ? 'Profit' : 'Loss'} of ${formatPaise(Math.abs(netProfitPaise))} to Capital Account ${selectedCapitalLedger.name} and LOCK the period from further entries.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Close',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await database.write(async () => {
                const batchOps: any[] = [];

                // 1. Resolve or Create Closing Transfer A/c
                const ledgers = await database.get<Ledger>(TABLE_NAMES.LEDGERS).query().fetch();
                const groups = await database.get<AccountGroup>(TABLE_NAMES.ACCOUNT_GROUPS).query().fetch();
                
                let transferLedger = ledgers.find(
                  (l) => l.entityId === activeEntityId && l.name === 'P&L Transfer A/c' && !l.isArchived
                );

                if (!transferLedger) {
                  const closingGroup = groups.find((g) => g.entityId === activeEntityId && g.nature === 'income');
                  transferLedger = await database.get<Ledger>(TABLE_NAMES.LEDGERS).create((record: any) => {
                    record.entityId = activeEntityId;
                    record.groupId = closingGroup ? closingGroup.id : groups[0]!.id;
                    record.name = 'P&L Transfer A/c';
                    record.gstRate = 0;
                    record.isSystem = true;
                    record.affectsStock = false;
                    record.isArchived = false;
                    record.openingBalanceDrCr = 'Dr';
                    record.openingBalancePaise = 0;
                  });
                }

                // 2. Create Closing Journal Voucher
                const newVoucher = await database.get<Voucher>(TABLE_NAMES.VOUCHERS).create((record: any) => {
                  record.entityId = activeEntityId;
                  record.voucherType = 'journal';
                  record.number = `JRN/FY-CLOSE/${currentYear}`;
                  record.date = now.getTime();
                  record.narration = `Transfer Retained Earnings for year end closing. Net Profit: ${formatPaise(netProfitPaise)}`;
                  record.refNumber = `FY-CLOSE-${currentFY}`;
                  record.isCancelled = false;
                });

                // 3. Line 1: Capital Account Line
                const capitalLine = database.get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES).prepareCreate((record: any) => {
                  record.voucherId = newVoucher.id;
                  record.ledgerId = selectedCapitalLedger.id;
                  // Profit increases capital (Cr), Loss decreases capital (Dr)
                  record.drCr = netProfitPaise >= 0 ? 'Cr' : 'Dr';
                  record.amountPaise = Math.abs(netProfitPaise);
                  record.gstType = '';
                  record.cgstPaise = 0;
                  record.sgstPaise = 0;
                  record.igstPaise = 0;
                  record.lineOrder = 1;
                });
                batchOps.push(capitalLine);

                // 4. Line 2: P&L closing balancing line
                const transferLine = database.get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES).prepareCreate((record: any) => {
                  record.voucherId = newVoucher.id;
                  record.ledgerId = transferLedger.id;
                  // Profit debits closing account (Dr), Loss credits closing account (Cr)
                  record.drCr = netProfitPaise >= 0 ? 'Dr' : 'Cr';
                  record.amountPaise = Math.abs(netProfitPaise);
                  record.gstType = '';
                  record.cgstPaise = 0;
                  record.sgstPaise = 0;
                  record.igstPaise = 0;
                  record.lineOrder = 2;
                });
                batchOps.push(transferLine);

                // 5. Update Entity locked years list
                const updatedYears = [...lockedYears, currentFY];
                const entityRecord = await database.get<Entity>(TABLE_NAMES.ENTITIES).find(activeEntityId!);
                const entityUpdate = entityRecord.prepareUpdate((record: any) => {
                  record.closedFyYears = JSON.stringify(updatedYears);
                });
                batchOps.push(entityUpdate);

                await database.batch(...batchOps);
              });

              triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
              Alert.alert(
                'Financial Year Closed',
                `Financial Year ${currentFY} has been closed successfully. Profit balances transferred to Capital A/c. Period is now LOCKED.`,
                [{ text: 'OK', onPress: () => router.replace('/(tabs)/more') }]
              );
            } catch (e: any) {
              Alert.alert('Closing Failed', e.message || 'Error occurred closing period.');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Verifying operational invariants...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!entity) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Entity not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentYearVal = new Date().getFullYear();
  const activeFYString = `${currentYearVal - 1}-${currentYearVal.toString().substring(2)}`;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Financial Year Close</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Info panel */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{entity.name}</Text>
          <Text style={styles.infoSubtitle}>Active accounting books statement</Text>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Active Period</Text>
            <Text style={styles.infoValue}>FY {activeFYString}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Base Currency</Text>
            <Text style={styles.infoValue}>{entity.baseCurrency || 'INR (₹)'}</Text>
          </View>
        </View>

        {/* Validation Checks */}
        <View style={styles.checkCard}>
          <Text style={styles.sectionTitle}>Transactional Integrity Checks</Text>

          <View style={styles.checkRow}>
            <View style={styles.checkText}>
              <Ionicons
                name={vouchersBalanced ? 'checkmark-circle' : 'alert-circle'}
                size={20}
                color={vouchersBalanced ? colors.success : colors.danger}
              />
              <Text style={styles.checkLabel}>Vouchers Double-Entry Balance</Text>
            </View>
            <Text style={[styles.checkStatus, { color: vouchersBalanced ? colors.success : colors.danger }]}>
              {vouchersBalanced ? 'PASSED' : 'FAILED'}
            </Text>
          </View>

          <View style={styles.checkRow}>
            <View style={styles.checkText}>
              <Ionicons name="trending-up" size={20} color={colors.primary} />
              <Text style={styles.checkLabel}>Cumulative Retained Profit</Text>
            </View>
            <Text style={[styles.checkStatus, { color: netProfitPaise >= 0 ? colors.success : colors.danger }]}>
              {formatPaise(netProfitPaise)}
            </Text>
          </View>
        </View>

        {/* Equity Transfer Destination */}
        <View style={styles.pickerCard}>
          <Text style={styles.sectionTitle}>Profit Capitalization ledger</Text>
          <Text style={styles.pickerDesc}>
            Select the Capital Account or Partner Equity ledger to receive transfer of cumulative Retained Profit/Loss.
          </Text>
          <TouchableOpacity
            style={styles.pickerBtn}
            onPress={() => setShowLedgerPicker(true)}
          >
            <Ionicons name="business" size={18} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={[styles.pickerText, !selectedCapitalLedger && { color: colors.textMuted }]}>
              {selectedCapitalLedger ? selectedCapitalLedger.name : 'Select Capital Account...'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Locked Years Timeline */}
        <View style={styles.timelineCard}>
          <Text style={styles.sectionTitle}>Locked Historical Years</Text>
          {lockedYears.length === 0 ? (
            <Text style={styles.timelineEmptyText}>No years locked yet. Fresh books!</Text>
          ) : (
            lockedYears.map((year, idx) => (
              <View key={idx} style={styles.timelineItem}>
                <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
                <Text style={styles.timelineText}>FY {year} (Accounting Closed)</Text>
              </View>
            ))
          )}
        </View>

        {/* Execute Close button */}
        <TouchableOpacity
          style={[styles.closeBtn, isSubmitting && { opacity: 0.8 }]}
          onPress={handleCloseFinancialYear}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="lock-closed" size={18} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.closeBtnText}>Close & Lock Financial Year</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Ledger picker restricted to Equity / Capital accounts */}
      <LedgerPicker
        visible={showLedgerPicker}
        entityId={activeEntityId || ''}
        onClose={() => setShowLedgerPicker(false)}
        onSelect={(led) => {
          setSelectedCapitalLedger(led);
          setShowLedgerPicker(false);
        }}
      />
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
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: colors.text,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  infoTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: colors.text,
  },
  infoSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.textMuted,
  },
  infoValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.text,
  },
  checkCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13.5,
    color: colors.text,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border,
    paddingBottom: 8,
    marginBottom: 4,
  },
  checkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  checkStatus: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 13,
  },
  pickerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  pickerDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 16,
    marginBottom: 4,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  pickerText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13.5,
    color: colors.text,
  },
  timelineCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  timelineEmptyText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    color: colors.textMuted,
    paddingVertical: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  timelineText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  closeBtn: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  closeBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
});
