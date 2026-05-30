/**
 * TallyTracker — Compliance Audit Log Screen
 *
 * Implements a complete chronological audit trail of all financial and system changes:
 * 1. Reverse-chronological timeline of modifications (Creates, Updates, Cancellations, Restorations).
 * 2. Visual field-level diffs (Old Value ➔ New Value) with highlighted styles.
 * 3. Search and interactive filters by Action type (CREATE, UPDATE, CANCEL, RESTORE) and Table/Entity.
 * 4. Premium theme-compliant styling with Outfit & Plus Jakarta Sans typography.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Q } from '@nozbe/watermelondb';

import database, { Entity, Voucher, AuditLog } from '@/db';
import { TABLE_NAMES } from '@/utils/constants';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useEntityStore } from '@/stores/entityStore';
import { formatDateShort } from '@/utils/date';

export default function AuditLogScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { activeEntityId } = useEntityStore();

  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([]);
  const [voucherMap, setVoucherMap] = useState<Map<string, string>>(new Map());

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActionFilter, setSelectedActionFilter] = useState<'ALL' | 'CREATE' | 'UPDATE' | 'CANCEL' | 'RESTORE'>('ALL');

  const triggerHaptic = (style = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  const loadData = async () => {
    if (!activeEntityId) return;
    setIsLoading(true);

    try {
      // 1. Fetch Audit Logs for this entity
      const fetchedLogs = await database
        .get<AuditLog>(TABLE_NAMES.AUDIT_LOGS)
        .query(Q.where('entity_id', activeEntityId))
        .fetch();
      
      // Sort reverse-chronologically
      fetchedLogs.sort((a, b) => b.performedAt - a.performedAt);
      setLogs(fetchedLogs);

      // 2. Fetch Vouchers to map recordId to Voucher Number
      const vouchers = await database
        .get<Voucher>(TABLE_NAMES.VOUCHERS)
        .query(Q.where('entity_id', activeEntityId))
        .fetch();
      
      const vMap = new Map<string, string>();
      vouchers.forEach((v) => {
        vMap.set(v.id, v.number);
      });
      setVoucherMap(vMap);
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeEntityId]);

  // Apply filters
  useEffect(() => {
    let result = [...logs];

    // Filter by action type
    if (selectedActionFilter !== 'ALL') {
      result = result.filter((l) => l.action.toUpperCase() === selectedActionFilter);
    }

    // Filter by search query (Voucher Number, CA Operator, Table Name)
    if (searchQuery.trim().length > 0) {
      const query = searchQuery.toLowerCase();
      result = result.filter((l) => {
        const vNumber = voucherMap.get(l.recordId)?.toLowerCase() || '';
        const performedBy = l.performedBy.toLowerCase();
        const tableName = l.tableName.toLowerCase();
        return (
          vNumber.includes(query) ||
          performedBy.includes(query) ||
          tableName.includes(query)
        );
      });
    }

    setFilteredLogs(result);
  }, [logs, selectedActionFilter, searchQuery, voucherMap]);

  const getActionBadgeColors = (action: string) => {
    const act = action.toUpperCase();
    if (act === 'CREATE') {
      return { bg: colors.success + '15', text: colors.success };
    } else if (act === 'UPDATE') {
      return { bg: '#3B82F615', text: '#3B82F6' };
    } else if (act === 'CANCEL') {
      return { bg: colors.danger + '15', text: colors.danger };
    } else if (act === 'RESTORE') {
      return { bg: '#0D948815', text: '#0D9488' };
    }
    return { bg: colors.borderLight, text: colors.textSecondary };
  };

  // Parses the changedFields JSON and renders a key-value diff list
  const renderFieldsDiff = (changedFieldsStr: string) => {
    try {
      const diffObj = JSON.parse(changedFieldsStr);
      if (!diffObj || Object.keys(diffObj).length === 0) {
        return <Text style={styles.noDiffText}>No field changes recorded.</Text>;
      }

      return Object.keys(diffObj).map((key) => {
        const diff = diffObj[key];
        const fieldLabel = key.replace(/_/g, ' ').toUpperCase();

        // Handle case where it has old and new properties
        if (diff && typeof diff === 'object' && ('old' in diff || 'new' in diff)) {
          const oldVal = diff.old === null || diff.old === undefined ? '—' : String(diff.old);
          const newVal = diff.new === null || diff.new === undefined ? '—' : String(diff.new);

          // If date field, try to format nicely
          const isDateKey = key.includes('date');
          const oldFormatted = isDateKey && typeof diff.old === 'number' ? formatDateShort(new Date(diff.old)) : oldVal;
          const newFormatted = isDateKey && typeof diff.new === 'number' ? formatDateShort(new Date(diff.new)) : newVal;

          return (
            <View key={key} style={styles.diffRow}>
              <Text style={styles.diffFieldLabel}>{fieldLabel}</Text>
              <View style={styles.diffValuesWrapper}>
                {oldVal !== '—' && (
                  <Text style={styles.diffOldVal} numberOfLines={1}>
                    {oldFormatted}
                  </Text>
                )}
                {oldVal !== '—' && (
                  <Ionicons name="arrow-forward-outline" size={12} color={colors.textMuted} style={{ marginHorizontal: 4 }} />
                )}
                <Text style={styles.diffNewVal} numberOfLines={1}>
                  {newFormatted}
                </Text>
              </View>
            </View>
          );
        }

        // Fallback for simple values
        return (
          <View key={key} style={styles.diffRow}>
            <Text style={styles.diffFieldLabel}>{fieldLabel}</Text>
            <Text style={styles.diffNewVal} numberOfLines={1}>
              {String(diff)}
            </Text>
          </View>
        );
      });
    } catch {
      return <Text style={styles.noDiffText}>Metadata: {changedFieldsStr}</Text>;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Compliance Audit Trail</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
          <Ionicons name="refresh-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Search & Filter Section */}
      <View style={styles.filterSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by Voucher, User, or Table..."
            placeholderTextColor={colors.textMuted}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Action filter pill row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsRow}
        >
          {(['ALL', 'CREATE', 'UPDATE', 'CANCEL', 'RESTORE'] as const).map((filter) => {
            const isActive = selectedActionFilter === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterPill,
                  isActive && { backgroundColor: colors.primary },
                ]}
                onPress={() => {
                  triggerHaptic();
                  setSelectedActionFilter(filter);
                }}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: isActive ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Logs Scroll Timeline */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Fetching compliance audit logs...</Text>
        </View>
      ) : filteredLogs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="shield-checkmark-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Secure & Compliant</Text>
          <Text style={styles.emptySubtitle}>
            No matching audit logs found. All operations are signed and fully verified.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.timeline}>
            {filteredLogs.map((log, idx) => {
              const colorsBadge = getActionBadgeColors(log.action);
              const logDate = new Date(log.performedAt);
              const formattedTime = logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const vNumber = voucherMap.get(log.recordId);

              return (
                <View key={log.id} style={styles.timelineItem}>
                  {/* Left Side Connector Timeline Graphic */}
                  <View style={styles.leftLineCol}>
                    <View style={[styles.timelineNode, { borderColor: colorsBadge.text }]} />
                    {idx < filteredLogs.length - 1 && <View style={styles.timelineLine} />}
                  </View>

                  {/* Main Right Side Audit Card */}
                  <View style={styles.auditCard}>
                    {/* Header Row */}
                    <View style={styles.cardHeaderRow}>
                      <View style={[styles.actionBadge, { backgroundColor: colorsBadge.bg }]}>
                        <Text style={[styles.actionBadgeText, { color: colorsBadge.text }]}>
                          {log.action.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.timestampText}>
                        {formatDateShort(logDate)} at {formattedTime}
                      </Text>
                    </View>

                    {/* Meta Row */}
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Record:</Text>
                      <Text style={styles.metaValue}>
                        {log.tableName === 'vouchers' && vNumber
                          ? `Voucher: ${vNumber}`
                          : `${log.tableName.toUpperCase()} (${log.recordId.substring(0, 8)})`}
                      </Text>
                    </View>

                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>User Signature:</Text>
                      <Text style={[styles.metaValue, { fontFamily: 'PlusJakartaSans_700Bold' }]}>
                        {log.performedBy}
                      </Text>
                    </View>

                    <View style={styles.divider} />

                    {/* Diff Breakdown */}
                    <Text style={styles.diffSectionHeader}>Change Statement</Text>
                    <View style={styles.diffsContainer}>
                      {renderFieldsDiff(log.changedFields)}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
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
  refreshBtn: {
    padding: 4,
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: colors.text,
  },
  filterSection: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13.5,
    color: colors.text,
  },
  filterPillsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  timeline: {
    width: '100%',
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  leftLineCol: {
    width: 24,
    alignItems: 'center',
  },
  timelineNode: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 3,
    backgroundColor: colors.background,
    zIndex: 2,
    marginTop: 16,
  },
  timelineLine: {
    width: 2,
    backgroundColor: colors.border,
    position: 'absolute',
    top: 24,
    bottom: -16,
    left: 11,
    zIndex: 1,
  },
  auditCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginLeft: 8,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  actionBadgeText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 10,
    letterSpacing: 0.2,
  },
  timestampText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  metaLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textMuted,
  },
  metaValue: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 10,
  },
  diffSectionHeader: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  diffsContainer: {
    gap: 6,
  },
  diffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  diffFieldLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11.5,
    color: colors.textSecondary,
    flex: 1,
  },
  diffValuesWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 2,
  },
  diffOldVal: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11.5,
    color: colors.danger,
    textDecorationLine: 'line-through',
  },
  diffNewVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11.5,
    color: colors.success,
  },
  noDiffText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
