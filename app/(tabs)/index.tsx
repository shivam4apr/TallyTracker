/**
 * TallyTracker — Dashboard (Home) Screen & Day Book
 *
 * Provides:
 * 1. Active Client (Entity) context and Entity switcher
 * 2. Real-time accounting summaries computed from database:
 *    - Cash & Bank Balance (lifetime balance including opening)
 *    - Net GST Liability (Output tax minus Input tax for the selected range)
 *    - Total Sales (revenue of Direct Income ledgers for active Financial Year)
 * 3. Day Book: All vouchers in chronological order for active client and date range
 * 4. Filters: search by number/narration/ledger, filter by voucher type, date range switcher (Today, Yesterday, This Week, This Month, Custom)
 * 5. Tap-through to Agenda Calendar screen and Voucher Detail screen
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { Entity, Voucher, VoucherLine, Ledger, AccountGroup } from '@/db';
import { TABLE_NAMES, VOUCHER_TYPE_LABELS, VoucherType } from '@/utils/constants';
import { reconcileEntityGroups } from '@/db/seed';
import { formatPaise } from '@/utils/money';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useEntityStore } from '@/stores/entityStore';
import { useAuthStore } from '@/stores/authStore';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { VOUCHER_TYPE_COLORS } from '@/theme/tokens';
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
} from '@/utils/date';

interface ProcessedVoucher {
  id: string;
  number: string;
  date: Date;
  voucherType: VoucherType;
  narration: string;
  refNumber: string;
  isCancelled: boolean;
  amountPaise: number;
  primaryPair: string;
  ledgerNames: string;
}

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();

  const { caUserId } = useAuthStore();
  const { activeEntityId, setActiveEntity } = useEntityStore();

  const [activeEntity, setActiveEntityRecord] = useState<Entity | null>(null);
  const [entitiesList, setEntitiesList] = useState<Entity[]>([]);
  const [showSwitcher, setShowSwitcher] = useState(false);

  const [vouchersList, setVouchersList] = useState<ProcessedVoucher[]>([]);
  const [stats, setStats] = useState({
    cashBalance: 0,
    gstLiability: 0,
    totalSales: 0,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVoucherType, setSelectedVoucherType] = useState<VoucherType | 'all'>('all');
  const [dateRangeType, setDateRangeType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  
  const [startDate, setStartDate] = useState<Date>(today());
  const [endDate, setEndDate] = useState<Date>(endOfDay(new Date()));
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);
  const [customStartStr, setCustomStartStr] = useState(formatDateIndian(new Date()));
  const [customEndStr, setCustomEndStr] = useState(formatDateIndian(new Date()));

  const isHindi = i18n.language === 'hi';
  const getLabel = (enStr: string, hiStr: string) => (isHindi ? hiStr : enStr);

  const triggerHaptic = (style = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  useEffect(() => {
    if (!caUserId) return;
    database
      .get<Entity>(TABLE_NAMES.ENTITIES)
      .query()
      .fetch()
      .then((records) => {
        const plain = records.map((r) => ({
          id: r.id,
          name: r.name,
        }));
        setEntitiesList(plain as any);
      })
      .catch(() => setEntitiesList([]));
  }, [caUserId, activeEntityId]);

  useEffect(() => {
    if (activeEntityId) {
      database
        .get<Entity>(TABLE_NAMES.ENTITIES)
        .find(activeEntityId)
        .then(setActiveEntityRecord)
        .catch(() => setActiveEntityRecord(null));
    } else {
      setActiveEntityRecord(null);
    }
  }, [activeEntityId]);

  useEffect(() => {
    if (params.date) {
      const parsed = new Date(params.date);
      if (!isNaN(parsed.getTime())) {
        setDateRangeType('custom');
        setStartDate(startOfDay(parsed));
        setEndDate(endOfDay(parsed));
        setCustomStartStr(formatDateIndian(parsed));
        setCustomEndStr(formatDateIndian(parsed));
      }
    }
  }, [params.date]);

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

  const loadDashboardData = async () => {
    if (!activeEntityId) return;

    try {
      try {
        await reconcileEntityGroups(database, activeEntityId);
      } catch (reconcileErr) {
        console.error('Reconcile groups failed, continuing dashboard load:', reconcileErr);
      }
      const groups = await database.get<AccountGroup>(TABLE_NAMES.ACCOUNT_GROUPS).query().fetch();
      const entityGroups = groups.filter((g) => g.entityId === activeEntityId);
      const groupMap = new Map(entityGroups.map((g) => [g.id, g]));

      const ledgers = await database.get<Ledger>(TABLE_NAMES.LEDGERS).query().fetch();
      const entityLedgers = ledgers.filter((l) => l.entityId === activeEntityId && !l.isArchived);
      const ledgerMap = new Map(entityLedgers.map((l) => [l.id, l]));

      const cashBankLedgerIds = new Set<string>();
      let cashBankOpeningSum = 0;

      entityLedgers.forEach((l) => {
        const group = groupMap.get(l.groupId);
        const groupName = group ? group.name.toLowerCase() : '';
        const lName = l.name.toLowerCase();

        const isCashOrBankGroup =
          groupName.includes('cash-in-hand') ||
          groupName.includes('bank accounts') ||
          groupName.includes('bank od');

        if (isCashOrBankGroup || lName.includes('cash') || lName.includes('bank') || lName.includes('wallet') || lName.includes('od a/c')) {
          cashBankLedgerIds.add(l.id);
          const op = l.openingBalancePaise || 0;
          cashBankOpeningSum += l.openingBalanceDrCr === 'Dr' ? op : -op;
        }
      });

      const vouchers = await database.get<Voucher>(TABLE_NAMES.VOUCHERS).query().fetch();
      const entityVouchers = vouchers.filter((v) => v.entityId === activeEntityId);
      const activeVouchers = entityVouchers.filter((v) => !v.isCancelled);

      const lines = await database.get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES).query().fetch();
      const activeVoucherIds = new Set(activeVouchers.map((v) => v.id));
      const entityLines = lines.filter((l) => activeVoucherIds.has(l.voucherId));

      let cashBankChange = 0;
      entityLines.forEach((line) => {
        if (cashBankLedgerIds.has(line.ledgerId)) {
          if (line.drCr === 'Dr') {
            cashBankChange += line.amountPaise;
          } else {
            cashBankChange -= line.amountPaise;
          }
        }
      });
      const cashBalance = cashBankOpeningSum + cashBankChange;

      let outputGst = 0;
      let inputGst = 0;
      entityLines.forEach((line) => {
        const v = activeVouchers.find((x) => x.id === line.voucherId);
        if (v && isDateInRange(v.date, startDate, endDate)) {
          const lineGst = (line.cgstPaise || 0) + (line.sgstPaise || 0) + (line.igstPaise || 0);
          if (v.voucherType === 'sales') {
            outputGst += lineGst;
          } else if (v.voucherType === 'purchase') {
            inputGst += lineGst;
          }
        }
      });
      const gstLiability = outputGst - inputGst;

      const currentFyStart = getFYStartDate(new Date(), activeEntity?.financialYearStart || 4);
      const currentFyEnd = getFYEndDate(new Date(), activeEntity?.financialYearStart || 4);
      let totalSalesPaise = 0;
      entityLines.forEach((line) => {
        const v = activeVouchers.find((x) => x.id === line.voucherId);
        if (v && v.voucherType === 'sales' && isDateInRange(v.date, currentFyStart, currentFyEnd)) {
          if (line.drCr === 'Cr') {
            totalSalesPaise += line.amountPaise;
          }
        }
      });

      setStats({
        cashBalance,
        gstLiability,
        totalSales: totalSalesPaise,
      });

      const filteredVouchers = entityVouchers.filter((v) => {
        const matchesDate = isDateInRange(v.date, startDate, endDate);
        const matchesType = selectedVoucherType === 'all' || v.voucherType === selectedVoucherType;
        return matchesDate && matchesType;
      });

      const processed: ProcessedVoucher[] = filteredVouchers.map((v) => {
        const vLines = lines.filter((l) => l.voucherId === v.id);
        const drLines = vLines.filter((l) => l.drCr === 'Dr');
        const crLines = vLines.filter((l) => l.drCr === 'Cr');

        const totalAmount = drLines.reduce((sum, l) => sum + l.amountPaise, 0);

        const firstDr = drLines[0]?.ledgerId;
        const firstCr = crLines[0]?.ledgerId;
        let primaryPair = '';

        if (firstDr && firstCr) {
          const drName = ledgerMap.get(firstDr)?.name || 'Unknown A/c';
          const crName = ledgerMap.get(firstCr)?.name || 'Unknown A/c';
          primaryPair = `${drName} ⇄ ${crName}`;
        } else if (firstDr) {
          primaryPair = `${ledgerMap.get(firstDr)?.name || 'Unknown A/c'} ⇄ —`;
        } else if (firstCr) {
          primaryPair = `— ⇄ ${ledgerMap.get(firstCr)?.name || 'Unknown A/c'}`;
        }

        return {
          id: v.id,
          number: v.number,
          date: v.date,
          voucherType: v.voucherType,
          narration: v.narration || '',
          refNumber: v.refNumber || '',
          isCancelled: v.isCancelled,
          amountPaise: totalAmount,
          primaryPair,
          ledgerNames: vLines.map((l) => ledgerMap.get(l.ledgerId)?.name || '').join(' ').toLowerCase(),
        };
      });

      const query = searchQuery.toLowerCase().trim();
      let finalVouchers = processed;
      if (query.length > 0) {
        finalVouchers = processed.filter(
          (v) =>
            v.number.toLowerCase().includes(query) ||
            v.narration.toLowerCase().includes(query) ||
            v.refNumber.toLowerCase().includes(query) ||
            v.primaryPair.toLowerCase().includes(query) ||
            v.ledgerNames.includes(query)
        );
      }

      finalVouchers.sort((a, b) => {
        const diffDate = b.date.getTime() - a.date.getTime();
        if (diffDate !== 0) return diffDate;
        return b.number.localeCompare(a.number);
      });

      setVouchersList(finalVouchers);
    } catch (e) {
      console.error('Failed to load real dashboard stats:', e);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadDashboardData();
    }, [activeEntityId, activeEntity, dateRangeType, startDate, endDate, selectedVoucherType, searchQuery, params.date])
  );

  const handleSwitchEntity = (entityId: string) => {
    triggerHaptic();
    setActiveEntity(entityId);
    setShowSwitcher(false);
  };

  const handleApplyCustomDates = () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(customStartStr) || !dateRegex.test(customEndStr)) {
      Alert.alert(
        getLabel('Invalid Date', 'अमान्य तारीख'),
        getLabel('Please enter dates in DD/MM/YYYY format.', 'कृपया तारीखें DD/MM/YYYY प्रारूप में दर्ज करें।')
      );
      return;
    }

    try {
      const sDate = startOfDay(parseDateIndian(customStartStr));
      const eDate = endOfDay(parseDateIndian(customEndStr));

      if (sDate.getTime() > eDate.getTime()) {
        Alert.alert(
          getLabel('Invalid Range', 'अमान्य सीमा'),
          getLabel('Start date must be before or equal to End date.', 'प्रारंभ तिथि अंतिम तिथि से पहले या उसके बराबर होनी चाहिए।')
        );
        return;
      }

      setStartDate(sDate);
      setEndDate(eDate);
      setShowCustomDateModal(false);
    } catch (err) {
      Alert.alert('Error parsing dates');
    }
  };

  const dayBookTotal = vouchersList.reduce(
    (sum, v) => sum + (v.isCancelled ? 0 : v.amountPaise),
    0
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSubtitle}>{t('dashboard.active_client')}</Text>
          <TouchableOpacity
            style={styles.entitySelector}
            onPress={() => {
              triggerHaptic();
              setShowSwitcher(true);
            }}
          >
            <Text style={styles.headerTitle} numberOfLines={1}>
              {activeEntity ? activeEntity.name : 'Select Client...'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              triggerHaptic();
              router.push('/agenda');
            }}
          >
            <Ionicons name="calendar" size={24} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => router.push('/(tabs)/more')}
          >
            <Ionicons name="person-circle-outline" size={32} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.kpiContainer}>
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <Ionicons name="wallet-outline" size={20} color={colors.success} />
              <Text style={styles.kpiTitle} numberOfLines={1}>Cash & Bank</Text>
            </View>
            <Text style={styles.kpiAmount} numberOfLines={1}>
              {formatPaise(stats.cashBalance)}
            </Text>
          </View>

          <View style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <Ionicons name="calculator-outline" size={20} color={colors.danger} />
              <Text style={styles.kpiTitle} numberOfLines={1}>GST Net (Period)</Text>
            </View>
            <Text
              style={[
                styles.kpiAmount,
                { color: stats.gstLiability < 0 ? colors.success : colors.danger },
              ]}
              numberOfLines={1}
            >
              {formatPaise(stats.gstLiability)}
            </Text>
          </View>
        </View>

        <View style={[styles.kpiCard, { width: '100%', marginTop: 12 }]}>
          <View style={styles.kpiHeader}>
            <Ionicons name="trending-up-outline" size={20} color={colors.primary} />
            <Text style={styles.kpiTitle}>Total Revenue / Sales (FY)</Text>
          </View>
          <Text style={[styles.kpiAmount, { fontSize: 24 }]} numberOfLines={1}>
            {formatPaise(stats.totalSales)}
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Day Book (Audit Trail)</Text>
          <Text style={styles.dateLabel}>{formatDateShort(startDate)} - {formatDateShort(endDate)}</Text>
        </View>

        <View style={styles.pillRow}>
          {([
            { key: 'today', en: 'Today', hi: 'आज' },
            { key: 'yesterday', en: 'Yesterday', hi: 'कल' },
            { key: 'week', en: 'This Week', hi: 'इस सप्ताह' },
            { key: 'month', en: 'This Month', hi: 'इस महीने' },
            { key: 'custom', en: 'Custom...', hi: 'कस्टम...' },
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
                  {getLabel(preset.en, preset.hi)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={getLabel('Search number, narration or ledger...', 'नंबर, विवरण या खाता खोजें...')}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.typeFilterContainer}
        >
          {([{ key: 'all', label: 'All Vouchers' },
            { key: 'payment', label: 'Payments' },
            { key: 'receipt', label: 'Receipts' },
            { key: 'contra', label: 'Contras' },
            { key: 'journal', label: 'Journals' },
            { key: 'sales', label: 'Sales' },
            { key: 'purchase', label: 'Purchases' }] as const).map((type) => {
            const isActive = selectedVoucherType === type.key;
            return (
              <TouchableOpacity
                key={type.key}
                style={[
                  styles.typePill,
                  isActive && {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  },
                ]}
                onPress={() => {
                  triggerHaptic();
                  setSelectedVoucherType(type.key);
                }}
              >
                <Text style={[styles.typePillText, isActive && { color: '#FFFFFF' }]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Total Transaction Volume ({vouchersList.length} items):</Text>
          <Text style={styles.summaryValue}>{formatPaise(dayBookTotal)}</Text>
        </View>

        {vouchersList.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('dashboard.no_vouchers')}</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {vouchersList.map((item) => {
              const typeColorObj = VOUCHER_TYPE_COLORS[item.voucherType];
              const primaryColor = typeColorObj ? typeColorObj.primary : colors.primary;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.voucherItem, item.isCancelled && styles.cancelledItem]}
                  onPress={() => {
                    triggerHaptic();
                    router.push(`/voucher/${item.id}`);
                  }}
                >
                  <View style={styles.voucherLeft}>
                    <View style={styles.vHeaderRow}>
                      <Text
                        style={[
                          styles.voucherTypeBadge,
                          { backgroundColor: primaryColor + '15', color: primaryColor },
                        ]}
                      >
                        {VOUCHER_TYPE_LABELS[item.voucherType].toUpperCase()}
                      </Text>
                      <Text style={[styles.voucherNum, item.isCancelled && styles.cancelledText]}>
                        {item.number}
                      </Text>
                    </View>
                    <Text style={styles.primaryPair} numberOfLines={1}>{item.primaryPair}</Text>
                    {item.narration ? (
                      <Text style={styles.narrationSnippet} numberOfLines={1}>
                        "{item.narration}"
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.voucherRight}>
                    <Text style={[styles.voucherAmount, item.isCancelled && styles.cancelledText]}>
                      {formatPaise(item.amountPaise)}
                    </Text>
                    <Text style={styles.voucherDate}>{formatDateShort(item.date)}</Text>
                    {item.isCancelled && (
                      <View style={styles.cancelledBadge}>
                        <Text style={styles.cancelledBadgeText}>CANCELLED</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showSwitcher}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSwitcher(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Switch Client</Text>
              <TouchableOpacity onPress={() => setShowSwitcher(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={entitiesList}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.entityItem,
                    item.id === activeEntityId && styles.entityItemActive,
                  ]}
                  onPress={() => handleSwitchEntity(item.id)}
                >
                  <Text
                    style={[
                      styles.entityItemText,
                      item.id === activeEntityId && styles.entityItemTextActive,
                    ]}
                  >
                    {item.name}
                  </Text>
                  {item.id === activeEntityId && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity
              style={styles.manageClientsBtn}
              onPress={() => {
                triggerHaptic();
                setShowSwitcher(false);
                router.push('/entities');
              }}
            >
              <Ionicons name="settings-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.manageClientsBtnText}>Manage Clients</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  entitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    maxWidth: '85%',
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: colors.text,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileBtn: {
    padding: 2,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 80,
  },
  kpiContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  kpiCard: {
    flex: 1,
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
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  kpiTitle: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
  },
  kpiAmount: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 17,
    color: colors.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: colors.text,
  },
  dateLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.primary,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  pillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
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
    fontSize: 12,
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.text,
    paddingVertical: 0,
  },
  typeFilterContainer: {
    gap: 8,
    paddingBottom: 4,
    marginBottom: 12,
  },
  typePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typePillText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  summaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  summaryLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textMuted,
  },
  summaryValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.text,
  },
  voucherItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.01,
    shadowRadius: 4,
    elevation: 0.5,
  },
  cancelledItem: {
    opacity: 0.5,
    backgroundColor: colors.background,
  },
  voucherLeft: {
    flex: 1,
    marginRight: 12,
  },
  vHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voucherTypeBadge: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 9,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  voucherNum: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.text,
  },
  primaryPair: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12.5,
    color: colors.textSecondary,
    marginTop: 6,
  },
  narrationSnippet: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  voucherRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  voucherAmount: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 15,
    color: colors.text,
  },
  voucherDate: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  cancelledBadge: {
    backgroundColor: '#EF444415',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  cancelledBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 8,
    color: '#EF4444',
  },
  cancelledText: {
    textDecorationLine: 'line-through',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: colors.textMuted,
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
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    maxHeight: '60%',
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
  entityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entityItemActive: {
    borderBottomColor: colors.primary + '30',
  },
  entityItemText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: colors.text,
  },
  entityItemTextActive: {
    color: colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  manageClientsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    backgroundColor: colors.primary + '05',
  },
  manageClientsBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.primary,
  },
});
