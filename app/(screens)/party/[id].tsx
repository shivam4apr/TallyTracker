/**
 * TallyTracker — Party Detail & Statement Screen
 *
 * Implements:
 * 1. Detailed profile view of the Party (GSTIN, PAN, Phone, Email, addresses, credit limits)
 * 2. Visual card for credit period and limits remaining
 * 3. Full chronological ledger transaction statement linked to this party's ledger
 * 4. Running balances and audit details
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { Entity, Voucher, VoucherLine, Ledger, AccountGroup, Party } from '@/db';
import { TABLE_NAMES, VOUCHER_TYPE_LABELS, VoucherType } from '@/utils/constants';
import { Q } from '@nozbe/watermelondb';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { formatPaise } from '@/utils/money';
import { formatDateShort } from '@/utils/date';
import { shareCsvFile, exportLedgerToPdf } from '@/services/pdf';

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

export default function PartyDetailScreen() {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { id: partyId } = useLocalSearchParams<{ id: string }>();

  // Database Records state
  const [party, setParty] = useState<Party | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [group, setGroup] = useState<AccountGroup | null>(null);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [auditLines, setAuditLines] = useState<AuditLine[]>([]);
  const [totalDr, setTotalDr] = useState(0);
  const [totalCr, setTotalCr] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const isHindi = i18n.language === 'hi';
  const getLabel = (enStr: string, hiStr: string) => (isHindi ? hiStr : enStr);

  const triggerHaptic = (style = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  const loadData = async () => {
    if (!partyId) return;
    setIsLoading(true);

    try {
      // 1. Fetch Party
      const pty = await database.get<Party>('parties').find(partyId);
      setParty(pty);

      // 2. Fetch Entity
      const ent = await database.get<Entity>(TABLE_NAMES.ENTITIES).find(pty.entityId);
      setEntity(ent);

      // 3. Fetch Ledger
      const led = await database.get<Ledger>(TABLE_NAMES.LEDGERS).find(pty.ledgerId);
      setLedger(led);

      // 4. Fetch Group
      const gp = await database.get<AccountGroup>(TABLE_NAMES.ACCOUNT_GROUPS).find(led.groupId);
      setGroup(gp);

      // 5. Fetch all non-cancelled Vouchers for this entity
      const activeVouchers = await database.get<Voucher>(TABLE_NAMES.VOUCHERS)
        .query(
          Q.where('entity_id', led.entityId),
          Q.where('is_cancelled', false)
        )
        .fetch();
      const voucherMap = new Map(activeVouchers.map((v) => [v.id, v]));

      // 6. Fetch VoucherLines for this ledger
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

      // 7. Calculate Running Balance
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

        // Dr increases assets/expenses, Cr decreases them
        // Dr decreases liabilities/equity/incomes, Cr increases them
        const isAssetOrExpense = gp.nature === 'asset' || gp.nature === 'expense';
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
          voucherType: v.voucherType as VoucherType,
          refNumber: v.refNumber,
          narration: v.narration,
          drCr: line.drCr as 'Dr' | 'Cr',
          amountPaise: line.amountPaise,
          runningBalancePaise: currentBal,
          runningBalanceDrCr: currentDrCr,
        };
      });

      setAuditLines(linesList);
      setTotalDr(drSum);
      setTotalCr(crSum);
    } catch (e) {
      console.error('Failed to load party details & history:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [partyId]);

  const handleCall = () => {
    if (!party?.phone) return;
    triggerHaptic();
    Linking.openURL(`tel:${party.phone}`).catch(() => {
      Alert.alert('Error', 'Unable to initiate phone call.');
    });
  };

  const handleEmail = () => {
    if (!party?.email) return;
    triggerHaptic();
    Linking.openURL(`mailto:${party.email}`).catch(() => {
      Alert.alert('Error', 'Unable to open mail client.');
    });
  };

  const handleExportCSV = async () => {
    if (!ledger || !entity) return;
    triggerHaptic();
    
    // Format headers and rows
    const headers = ['Date', 'Voucher No', 'Voucher Type', 'Ref No', 'Debit (Dr)', 'Credit (Cr)', 'Running Balance'];
    const rows = auditLines.map((line) => [
      formatDateShort(line.date),
      line.number,
      VOUCHER_TYPE_LABELS[line.voucherType],
      line.refNumber || '',
      line.drCr === 'Dr' ? (line.amountPaise / 100).toFixed(2) : '',
      line.drCr === 'Cr' ? (line.amountPaise / 100).toFixed(2) : '',
      `${(line.runningBalancePaise / 100).toFixed(2)} ${line.runningBalanceDrCr}`,
    ]);

    const title = `${party?.name || ledger.name} Statement`;
    const subtitle = `State: ${party?.stateCode || 'N/A'} | GSTIN: ${party?.gstin || 'N/A'}`;

    // Compile into standard CSV format string
    let csvContent = `"${title}"\n"${subtitle}"\n\n`;
    csvContent += headers.map(h => `"${h}"`).join(',') + '\n';
    rows.forEach((row) => {
      csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    const fileName = `${(party?.name || ledger.name).replace(/\s+/g, '_')}_Statement.csv`;
    await shareCsvFile(csvContent, fileName);
  };

  const handleExportPDF = async () => {
    if (!ledger || !entity || !group) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    await exportLedgerToPdf(
      ledger,
      group,
      entity,
      auditLines,
      totalDr,
      totalCr,
      closingBalance.runningBalancePaise || 0,
      closingBalance.runningBalanceDrCr || 'Dr'
    );
  };


  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{getLabel('Loading Party statement...', 'पार्टी विवरण लोड हो रहा है...')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!party || !ledger) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{getLabel('Party profile not found.', 'पार्टी प्रोफ़ाइल नहीं मिली।')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Calculate closing balance
  const closingBalance = auditLines.length > 0
    ? auditLines[auditLines.length - 1]!
    : { runningBalancePaise: ledger.openingBalancePaise, runningBalanceDrCr: ledger.openingBalanceDrCr };

  const isCustomer = group?.nature === 'asset' || group?.name.toLowerCase().includes('debtor');

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {party.name}
          </Text>
          <Text style={styles.headerSubtitle}>
            {isCustomer ? getLabel('Customer (Sundry Debtor)', 'ग्राहक') : getLabel('Supplier (Sundry Creditor)', 'आपूर्तिकर्ता')}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerActionBtn} onPress={handleExportCSV}>
            <Ionicons name="share-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerActionBtn} onPress={handleExportPDF}>
            <Ionicons name="document-text-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Contact Quick Bar */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {party.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileDetails}>
            <Text style={styles.profileName}>{party.name}</Text>
            <View style={styles.quickContactRow}>
              {party.phone ? (
                <TouchableOpacity style={styles.contactChip} onPress={handleCall}>
                  <Ionicons name="call" size={14} color={colors.primary} />
                  <Text style={styles.contactChipText}>{party.phone}</Text>
                </TouchableOpacity>
              ) : null}
              {party.email ? (
                <TouchableOpacity style={styles.contactChip} onPress={handleEmail}>
                  <Ionicons name="mail" size={14} color={colors.primary} />
                  <Text style={styles.contactChipText} numberOfLines={1}>{party.email}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        {/* Balance Card */}
        <View style={styles.statsCard}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{getLabel('Outstanding Balance', 'बकाया शेष राशि')}</Text>
            <Text style={[styles.statValue, { color: closingBalance.runningBalanceDrCr === 'Dr' ? colors.primary : colors.success }]}>
              {formatPaise(closingBalance.runningBalancePaise)} {closingBalance.runningBalanceDrCr}
            </Text>
          </View>
          {party.creditDays > 0 ? (
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{getLabel('Credit Period / Limit', 'उधार अवधि / सीमा')}</Text>
              <Text style={styles.statValueSub}>
                {party.creditDays} Days | {party.creditLimitPaise > 0 ? formatPaise(party.creditLimitPaise) : 'No Limit'}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Mailing & Tax details */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>{getLabel('Tax & Registration Details', 'कर एवं पंजीकरण विवरण')}</Text>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{getLabel('GSTIN / Tax ID', 'जीएसटी नंबर')}</Text>
            <Text style={styles.detailValue}>{party.gstin || 'Unregistered / None'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{getLabel('PAN / Income Tax ID', 'पैन नंबर')}</Text>
            <Text style={styles.detailValue}>{party.pan || 'N/A'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{getLabel('GST State Code', 'जीएसटी राज्य कोड')}</Text>
            <Text style={styles.detailValue}>{party.stateCode || 'N/A'}</Text>
          </View>

          {party.billingAddress ? (
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>{getLabel('Billing Address', 'बिलिंग पता')}</Text>
              <Text style={styles.addressText}>{party.billingAddress}</Text>
            </View>
          ) : null}

          {party.shippingAddress ? (
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>{getLabel('Shipping Address', 'शिपिंग पता')}</Text>
              <Text style={styles.addressText}>{party.shippingAddress}</Text>
            </View>
          ) : null}
        </View>

        {/* Transaction History statement */}
        <View style={styles.statementSection}>
          <Text style={styles.sectionTitle}>{getLabel('Transactional History Statement', 'लेनदेन का विवरण')}</Text>

          <View style={styles.statementHeaderRow}>
            <Text style={[styles.stmtCol, { width: 55 }]}>Date</Text>
            <Text style={[styles.stmtCol, { flex: 1 }]}>Voucher</Text>
            <Text style={[styles.stmtCol, { width: 65, textAlign: 'right' }]}>Amount</Text>
            <Text style={[styles.stmtCol, { width: 85, textAlign: 'right' }]}>Balance</Text>
          </View>

          {auditLines.length === 0 ? (
            <Text style={styles.emptyStatementText}>
              {getLabel('No transactions recorded for this party.', 'इस पार्टी के लिए कोई लेनदेन दर्ज नहीं किया गया है।')}
            </Text>
          ) : (
            auditLines.map((line) => (
              <TouchableOpacity
                key={line.id}
                style={styles.stmtRow}
                onPress={() => router.push(`/(screens)/voucher/${line.voucherId}`)}
              >
                <Text style={[styles.stmtTextCol, { width: 55, fontSize: 11.5 }]}>
                  {formatDateShort(line.date)}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stmtVoucherNo} numberOfLines={1}>{line.number}</Text>
                  <Text style={styles.stmtVoucherType}>{VOUCHER_TYPE_LABELS[line.voucherType]}</Text>
                </View>
                <Text style={[styles.stmtAmount, { width: 65, color: line.drCr === 'Dr' ? colors.primary : colors.success }]}>
                  {formatPaise(line.amountPaise)} {line.drCr}
                </Text>
                <Text style={[styles.stmtBalance, { width: 85 }]}>
                  {formatPaise(line.runningBalancePaise)} {line.runningBalanceDrCr}
                </Text>
              </TouchableOpacity>
            ))
          )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: 4,
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
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
    gap: 12,
  },
  headerActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 20,
  },
  profileCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 20,
    color: colors.primary,
  },
  profileDetails: {
    flex: 1,
  },
  profileName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: colors.text,
  },
  quickContactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  contactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.borderLight + '30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    maxWidth: 150,
  },
  contactChipText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: colors.textSecondary,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  statBox: {
    flex: 1,
    justifyContent: 'center',
  },
  statLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  statValue: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    marginTop: 4,
  },
  statValueSub: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  detailsSection: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12.5,
    color: colors.textMuted,
  },
  detailValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.text,
  },
  detailBlock: {
    gap: 6,
    marginTop: 4,
  },
  addressText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    backgroundColor: colors.background,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statementSection: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  statementHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
    marginBottom: 8,
  },
  stmtCol: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: colors.textMuted,
  },
  stmtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  stmtTextCol: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textSecondary,
  },
  stmtVoucherNo: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
    color: colors.text,
  },
  stmtVoucherType: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  stmtAmount: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    textAlign: 'right',
  },
  stmtBalance: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    textAlign: 'right',
    color: colors.textSecondary,
  },
  emptyStatementText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
