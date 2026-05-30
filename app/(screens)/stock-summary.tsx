/**
 * TallyTracker — Inventory Stock Summary Screen
 *
 * Implements simplified moving-average cost valuation inventory tracking:
 * 1. Computes total Inwards, Outwards, and Closing stock balances.
 * 2. Visual indicators and status bars for low stock items (< 5 units).
 * 3. Modal form to seed new Stock Items with opening balances.
 * 4. Outfit & Plus Jakarta Sans typography.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Q } from '@nozbe/watermelondb';

import database, { StockItem, Voucher, VoucherLine } from '@/db';
import { TABLE_NAMES } from '@/utils/constants';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useEntityStore } from '@/stores/entityStore';
import { formatPaise, parseInputToPaise } from '@/utils/money';

interface StockMetrics {
  id: string;
  name: string;
  unit: string;
  openingQty: number;
  openingRate: number;
  openingValue: number;
  inwardQty: number;
  inwardValue: number;
  outwardQty: number;
  outwardValue: number;
  closingQty: number;
  avgCostRate: number;
  closingValue: number;
}

export default function StockSummaryScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { activeEntityId } = useEntityStore();

  const [isLoading, setIsLoading] = useState(true);
  const [stockMetrics, setStockMetrics] = useState<StockMetrics[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Item Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState('Pcs');
  const [openingQtyStr, setOpeningQtyStr] = useState('0');
  const [openingRateStr, setOpeningRateStr] = useState('0.00');
  const [isSaving, setIsSaving] = useState(false);

  const triggerHaptic = (style = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  const loadData = async () => {
    if (!activeEntityId) return;
    setIsLoading(true);

    try {
      // 1. Fetch all stock items
      const items = await database
        .get<StockItem>(TABLE_NAMES.STOCK_ITEMS)
        .query(Q.where('entity_id', activeEntityId), Q.where('is_archived', false))
        .fetch();

      // 2. Fetch all non-cancelled vouchers
      const vouchers = await database
        .get<Voucher>(TABLE_NAMES.VOUCHERS)
        .query(Q.where('entity_id', activeEntityId), Q.where('is_cancelled', false))
        .fetch();
      const voucherMap = new Map(vouchers.map((v) => [v.id, v]));

      // 3. Fetch all voucher lines
      const allLines = await database
        .get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES)
        .query(Q.where('stock_item_id', Q.notEq(null)))
        .fetch();
      const activeLines = allLines.filter((l) => voucherMap.has(l.voucherId));

      // 4. Compute metrics for each item
      const metricsList: StockMetrics[] = items.map((item) => {
        const itemLines = activeLines.filter((l) => l.stockItemId === item.id);

        let inwardQty = 0;
        let inwardValue = 0;
        let outwardQty = 0;
        let outwardValue = 0;

        itemLines.forEach((l) => {
          const v = voucherMap.get(l.voucherId)!;
          const qty = l.stockQty || 0;
          const amt = l.amountPaise || 0;

          // Inward: Purchase and Sales Return (Credit Note)
          // Outward: Sales and Purchase Return (Debit Note)
          if (v.voucherType === 'purchase' || v.voucherType === 'credit_note') {
            inwardQty += qty;
            inwardValue += amt;
          } else if (v.voucherType === 'sales' || v.voucherType === 'debit_note') {
            outwardQty += qty;
            outwardValue += amt;
          }
        });

        const opValue = item.openingQty * item.openingRatePaise;
        const closingQty = item.openingQty + inwardQty - outwardQty;

        // Moving Average purchase cost per unit
        const totalInQty = item.openingQty + inwardQty;
        const totalInVal = opValue + inwardValue;
        const avgCostRate = totalInQty > 0 ? Math.round(totalInVal / totalInQty) : item.openingRatePaise;

        const closingValue = closingQty * avgCostRate;

        return {
          id: item.id,
          name: item.name,
          unit: item.unit,
          openingQty: item.openingQty,
          openingRate: item.openingRatePaise,
          openingValue: opValue,
          inwardQty,
          inwardValue,
          outwardQty,
          outwardValue,
          closingQty,
          avgCostRate,
          closingValue,
        };
      });

      // Sort alphabetically by name
      metricsList.sort((a, b) => a.name.localeCompare(b.name));
      setStockMetrics(metricsList);
    } catch (e) {
      console.error('Failed to load stock metrics:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeEntityId]);

  const handleCreateStockItem = async () => {
    if (!activeEntityId || itemName.trim().length === 0) return;
    setIsSaving(true);
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    const qty = parseInt(openingQtyStr) || 0;
    const rate = parseInputToPaise(openingRateStr);

    try {
      await database.write(async () => {
        const newItem = await database.get<StockItem>(TABLE_NAMES.STOCK_ITEMS).create((record: any) => {
          record.entityId = activeEntityId;
          record.name = itemName.trim();
          record.unit = itemUnit;
          record.openingQty = qty;
          record.openingRatePaise = rate;
          record.isArchived = false;
        });

        // Log system creation audit trail
        await database.get('audit_logs').create((record: any) => {
          record.entityId = activeEntityId;
          record.tableName = 'stock_items';
          record.recordId = newItem.id;
          record.action = 'CREATE';
          record.changedFields = JSON.stringify({
            name: itemName.trim(),
            unit: itemUnit,
            opening_qty: qty,
            opening_rate: rate,
          });
          record.performedBy = 'Authorized CA';
          record.performedAt = Date.now();
        });
      });

      Alert.alert('Stock Added', `Stock item "${itemName}" created successfully.`);
      setShowAddModal(false);
      setItemName('');
      setItemUnit('Pcs');
      setOpeningQtyStr('0');
      setOpeningRateStr('0.00');
      loadData();
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Error occurred saving item.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredMetrics = stockMetrics.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Simplified Stock Summary</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
          <Ionicons name="refresh-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Search & Actions Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search stock item by name..."
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            triggerHaptic();
            setShowAddModal(true);
          }}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Item</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content scrollable feed */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Analyzing inventory movements...</Text>
        </View>
      ) : filteredMetrics.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Empty Warehouse</Text>
          <Text style={styles.emptySubtitle}>
            No active inventory stock items found. Tap "Add Item" to initialize your stock ledger.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {filteredMetrics.map((item) => {
            const isLowStock = item.closingQty < 5;
            const progressPercent = Math.min(100, Math.max(0, (item.closingQty / 15) * 100));

            return (
              <View key={item.id} style={styles.stockCard}>
                {/* Header Row */}
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemUnit}>Unit: {item.unit}</Text>
                  </View>
                  <View style={styles.closingBadge}>
                    <Text style={[styles.closingQtyText, isLowStock && { color: colors.danger }]}>
                      {item.closingQty} {item.unit}
                    </Text>
                    <Text style={styles.closingValText}>{formatPaise(item.closingValue)}</Text>
                  </View>
                </View>

                {/* moving average metrics grid */}
                <View style={styles.divider} />
                <View style={styles.metricsGrid}>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>Opening Stock</Text>
                    <Text style={styles.metricVal}>
                      {item.openingQty} @ {formatPaise(item.openingRate)}
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>Total Inward</Text>
                    <Text style={[styles.metricVal, { color: colors.success }]}>
                      +{item.inwardQty} {item.unit}
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>Total Outward</Text>
                    <Text style={[styles.metricVal, { color: colors.danger }]}>
                      -{item.outwardQty} {item.unit}
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>Average Cost / Rate</Text>
                    <Text style={[styles.metricVal, { fontFamily: 'PlusJakartaSans_700Bold' }]}>
                      {formatPaise(item.avgCostRate)}
                    </Text>
                  </View>
                </View>

                {/* progress alert bar */}
                <View style={styles.stockBarWrapper}>
                  <View style={styles.stockBarBg}>
                    <View
                      style={[
                        styles.stockBarFill,
                        {
                          width: `${progressPercent}%`,
                          backgroundColor: isLowStock ? colors.danger : colors.primary,
                        },
                      ]}
                    />
                  </View>
                  {isLowStock && (
                    <View style={styles.alertWrapper}>
                      <Ionicons name="warning" size={12} color={colors.danger} />
                      <Text style={styles.alertText}>Low Stock Alert! Reorder immediately.</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Add Stock Item Seeder Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Stock Item</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Item Name *</Text>
              <TextInput
                style={styles.input}
                value={itemName}
                onChangeText={setItemName}
                placeholder="e.g. Lenovo Laptop X1"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Unit *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitsRow}>
                  {['Pcs', 'Kgs', 'Nos', 'Mtrs', 'Ltrs'].map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.unitBtn, itemUnit === u && styles.unitBtnActive]}
                      onPress={() => setItemUnit(u)}
                    >
                      <Text style={[styles.unitText, itemUnit === u && { color: '#FFF' }]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.label}>Opening Qty</Text>
                <TextInput
                  style={styles.input}
                  value={openingQtyStr}
                  onChangeText={setOpeningQtyStr}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Opening Rate (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={openingRateStr}
                  onChangeText={setOpeningRateStr}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowAddModal(false)}
                disabled={isSaving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleCreateStockItem}
                disabled={isSaving || itemName.trim().length === 0}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Create Item</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
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
  searchSection: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 12,
  },
  searchBar: {
    flex: 1,
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
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 40,
  },
  addBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 20,
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
  stockCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 16,
    color: colors.text,
  },
  itemUnit: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  closingBadge: {
    alignItems: 'flex-end',
  },
  closingQtyText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 15,
    color: colors.success,
  },
  closingValText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCell: {
    flex: 1,
    minWidth: '45%',
    gap: 2,
  },
  metricLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  metricVal: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.text,
  },
  stockBarWrapper: {
    gap: 6,
    marginTop: 4,
  },
  stockBarBg: {
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  stockBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  alertWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  alertText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: colors.danger,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: colors.text,
    marginBottom: 4,
  },
  formGroup: {
    gap: 6,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.text,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: colors.text,
  },
  unitsRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 8,
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 6,
  },
  unitBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13.5,
    color: colors.textSecondary,
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  saveBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13.5,
    color: '#FFFFFF',
  },
});
