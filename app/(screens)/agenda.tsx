/**
 * TallyTracker — Agenda Calendar Screen
 *
 * Implements:
 * 1. Custom Monthly Calendar grid (prevents package mismatch issues).
 * 2. Multi-row indicator tiles representing month days.
 * 3. Daily activity marker dot showing if a date contains vouchers.
 * 4. selected day list of transactions with click-through details.
 * 5. Day Book redirect linking selected date.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { Voucher, VoucherLine, Ledger } from '@/db';
import { TABLE_NAMES, VOUCHER_TYPE_LABELS, VoucherType } from '@/utils/constants';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useEntityStore } from '@/stores/entityStore';
import { formatPaise } from '@/utils/money';
import { VOUCHER_TYPE_COLORS } from '@/theme/tokens';
import {
  formatDateShort,
  toISODateString,
  startOfDay,
  endOfDay,
  today,
} from '@/utils/date';

interface CalendarDay {
  dayNum: number | null;
  date: Date | null;
  hasActivity: boolean;
  totalDrPaise: number;
}

interface ProcessedVoucher {
  id: string;
  number: string;
  date: Date;
  voucherType: VoucherType;
  narration: string;
  isCancelled: boolean;
  amountPaise: number;
  primaryPair: string;
}

const MONTH_LABELS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_LABELS_HI = [
  'जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
  'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'
];

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_HI = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];

export default function AgendaScreen() {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const { activeEntityId } = useEntityStore();

  // Calendar dates state
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1); // 1-indexed
  const [selectedDate, setSelectedDate] = useState<Date>(today());

  // Vouchers state
  const [vouchersInMonth, setVouchersInMonth] = useState<Voucher[]>([]);
  const [vouchersLines, setVouchersLines] = useState<VoucherLine[]>([]);
  const [ledgersMap, setLedgersMap] = useState<Map<string, Ledger>>(new Map());
  const [selectedDayVouchers, setSelectedDayVouchers] = useState<ProcessedVoucher[]>([]);

  const isHindi = i18n.language === 'hi';
  const getLabel = (enStr: string, hiStr: string) => (isHindi ? hiStr : enStr);

  const triggerHaptic = (style = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  // 1. Fetch all month vouchers and dependencies for calendar markers
  const loadMonthData = async () => {
    if (!activeEntityId) return;

    try {
      const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
      const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

      // Load all entity ledgers
      const ledgers = await database.get<Ledger>(TABLE_NAMES.LEDGERS).query().fetch();
      const entityLedgers = ledgers.filter((l) => l.entityId === activeEntityId);
      setLedgersMap(new Map(entityLedgers.map((l) => [l.id, l])));

      // Load all entity vouchers for this month
      const allVouchers = await database.get<Voucher>(TABLE_NAMES.VOUCHERS).query().fetch();
      const entityMonthVouchers = allVouchers.filter((v) => {
        return (
          v.entityId === activeEntityId &&
          v.date.getTime() >= startOfMonth.getTime() &&
          v.date.getTime() <= endOfMonth.getTime()
        );
      });
      setVouchersInMonth(entityMonthVouchers);

      // Load lines for these vouchers
      const allLines = await database.get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES).query().fetch();
      const monthVoucherIds = new Set(entityMonthVouchers.map((v) => v.id));
      const filteredLines = allLines.filter((l) => monthVoucherIds.has(l.voucherId));
      setVouchersLines(filteredLines);

    } catch (e) {
      console.error('Failed to load month data in agenda:', e);
    }
  };

  useEffect(() => {
    loadMonthData();
  }, [activeEntityId, currentYear, currentMonth]);

  // 2. Refresh the selected date vouchers list
  useEffect(() => {
    if (!activeEntityId) return;

    const startSel = startOfDay(selectedDate).getTime();
    const endSel = endOfDay(selectedDate).getTime();

    // Vouchers on this selected day
    const dayVouchers = vouchersInMonth.filter((v) => {
      const t = v.date.getTime();
      return t >= startSel && t <= endSel;
    });

    const processed: ProcessedVoucher[] = dayVouchers.map((v) => {
      const vLines = vouchersLines.filter((l) => l.voucherId === v.id);
      const drLines = vLines.filter((l) => l.drCr === 'Dr');
      const crLines = vLines.filter((l) => l.drCr === 'Cr');

      // Amount is Dr sum
      const amount = drLines.reduce((sum, l) => sum + l.amountPaise, 0);

      // Ledger labels
      const firstDr = drLines[0]?.ledgerId;
      const firstCr = crLines[0]?.ledgerId;
      let primaryPair = '';

      if (firstDr && firstCr) {
        const drName = ledgersMap.get(firstDr)?.name || 'Unknown A/c';
        const crName = ledgersMap.get(firstCr)?.name || 'Unknown A/c';
        primaryPair = `${drName} ⇄ ${crName}`;
      } else if (firstDr) {
        primaryPair = `${ledgersMap.get(firstDr)?.name || 'Unknown A/c'} ⇄ —`;
      } else if (firstCr) {
        primaryPair = `— ⇄ ${ledgersMap.get(firstCr)?.name || 'Unknown A/c'}`;
      }

      return {
        id: v.id,
        number: v.number,
        date: v.date,
        voucherType: v.voucherType,
        narration: v.narration || '',
        isCancelled: v.isCancelled,
        amountPaise: amount,
        primaryPair,
      };
    });

    // Sort by number
    processed.sort((a, b) => b.number.localeCompare(a.number));
    setSelectedDayVouchers(processed);

  }, [selectedDate, vouchersInMonth, vouchersLines, ledgersMap]);

  // 3. Build Calendar Grid
  const generateMonthGrid = (): CalendarDay[] => {
    const numDays = new Date(currentYear, currentMonth, 0).getDate();
    const startDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 = Sun

    const grid: CalendarDay[] = [];

    // Add empty slots for month offset alignment
    for (let i = 0; i < startDayOfWeek; i++) {
      grid.push({
        dayNum: null,
        date: null,
        hasActivity: false,
        totalDrPaise: 0,
      });
    }

    // Add actual days
    for (let day = 1; day <= numDays; day++) {
      const currentDayDate = new Date(currentYear, currentMonth - 1, day);
      const dayStart = startOfDay(currentDayDate).getTime();
      const dayEnd = endOfDay(currentDayDate).getTime();

      // Check transaction activity
      const dayVouchers = vouchersInMonth.filter((v) => {
        const t = v.date.getTime();
        return t >= dayStart && t <= dayEnd && !v.isCancelled;
      });

      const hasActivity = dayVouchers.length > 0;

      // Sum Debit total
      let totalDr = 0;
      if (hasActivity) {
        const vIds = new Set(dayVouchers.map((v) => v.id));
        const dayLines = vouchersLines.filter((l) => vIds.has(l.voucherId) && l.drCr === 'Dr');
        totalDr = dayLines.reduce((sum, l) => sum + l.amountPaise, 0);
      }

      grid.push({
        dayNum: day,
        date: currentDayDate,
        hasActivity,
        totalDrPaise: totalDr,
      });
    }

    return grid;
  };

  const monthGrid = generateMonthGrid();

  const handlePrevMonth = () => {
    triggerHaptic();
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    triggerHaptic();
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleDaySelect = (day: CalendarDay) => {
    if (!day.date) return;
    triggerHaptic();
    setSelectedDate(day.date);
  };

  const handleOpenInDayBook = () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    router.replace({
      pathname: '/(tabs)',
      params: { date: toISODateString(selectedDate) },
    });
  };

  const monthTitle = isHindi
    ? `${currentYear} ${MONTH_LABELS_HI[currentMonth - 1]}`
    : `${MONTH_LABELS_EN[currentMonth - 1]} ${currentYear}`;

  const weekdaysList = isHindi ? WEEKDAYS_HI : WEEKDAYS_EN;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Agenda Calendar</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Calendar Card Canvas */}
        <View style={styles.calendarCard}>
          {/* Month Controller Header */}
          <View style={styles.monthHeader}>
            <TouchableOpacity style={styles.navBtn} onPress={handlePrevMonth}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.monthTitleText}>{monthTitle}</Text>
            <TouchableOpacity style={styles.navBtn} onPress={handleNextMonth}>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Weekdays row */}
          <View style={styles.weekdaysRow}>
            {weekdaysList.map((day) => (
              <Text key={day} style={styles.weekdayText}>
                {day}
              </Text>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.daysGrid}>
            {monthGrid.map((day, idx) => {
              const isSelected =
                day.date &&
                startOfDay(day.date).getTime() === startOfDay(selectedDate).getTime();
              
              const isToday =
                day.date &&
                startOfDay(day.date).getTime() === startOfDay(new Date()).getTime();

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.dayTile,
                    !day.dayNum && styles.dayTileEmpty,
                    isSelected && styles.dayTileSelected,
                    isToday && !isSelected && styles.dayTileToday,
                  ]}
                  disabled={!day.dayNum}
                  onPress={() => handleDaySelect(day)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isSelected && styles.dayTextSelected,
                      isToday && !isSelected && styles.dayTextToday,
                    ]}
                  >
                    {day.dayNum}
                  </Text>
                  {day.hasActivity && (
                    <View
                      style={[
                        styles.activityDot,
                        isSelected && styles.activityDotSelected,
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Selected date drawer header */}
        <View style={styles.selectedDayHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.selectedDayTitle}>
              {formatDateShort(selectedDate)}
            </Text>
            <Text style={styles.selectedDaySubtitle}>
              {selectedDayVouchers.length} {getLabel('Vouchers found', 'वाउचर मिले')}
            </Text>
          </View>
          {selectedDayVouchers.length > 0 && (
            <TouchableOpacity style={styles.dayBookLink} onPress={handleOpenInDayBook}>
              <Ionicons name="open-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={styles.dayBookLinkText}>Day Book</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Selected Date Vouchers List */}
        {selectedDayVouchers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="leaf-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {getLabel('No transactions recorded on this date.', 'इस तारीख को कोई लेनदेन दर्ज नहीं किया गया है।')}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {selectedDayVouchers.map((item) => {
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
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  calendarCard: {
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
    marginBottom: 20,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthTitleText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 16,
    color: colors.text,
  },
  navBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekdayText: {
    width: '13%',
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  dayTile: {
    width: '13%',
    aspectRatio: 1,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  dayTileEmpty: {
    backgroundColor: 'transparent',
  },
  dayTileSelected: {
    backgroundColor: colors.primary,
  },
  dayTileToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  dayText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13.5,
    color: colors.text,
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  dayTextToday: {
    color: colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  activityDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  activityDotSelected: {
    backgroundColor: '#FFFFFF',
  },
  selectedDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  selectedDayTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: colors.text,
  },
  selectedDaySubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  dayBookLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '05',
  },
  dayBookLinkText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: colors.primary,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
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
});
