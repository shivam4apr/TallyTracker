/**
 * TallyTracker — StockItemPicker Component
 *
 * A searchable modal picker that lists all stock items (inventory) of the active entity.
 * Includes an inline "Create New Stock Item" form so users can add custom inventory items
 * directly from the voucher line entry screen.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { StockItem } from '@/db';
import { TABLE_NAMES } from '@/utils/constants';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { parseInputToPaise } from '@/utils/money';

interface StockItemPickerProps {
  visible: boolean;
  entityId: string;
  onClose: () => void;
  onSelect: (item: StockItem) => void;
}

export default function StockItemPicker({
  visible,
  entityId,
  onClose,
  onSelect,
}: StockItemPickerProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [items, setItems] = useState<StockItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Inline Create Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('Pcs');
  const [newItemOpeningQty, setNewItemOpeningQty] = useState('0');
  const [newItemOpeningRate, setNewItemOpeningRate] = useState('0.00');
  const [isCreating, setIsCreating] = useState(false);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const loadData = () => {
    if (!entityId) return;
    database.get<StockItem>(TABLE_NAMES.STOCK_ITEMS)
      .query()
      .fetch()
      .then((records) => {
        setItems(records.filter((r) => r.entityId === entityId && !r.isArchived));
      })
      .catch((err) => console.error('Failed to load stock items in picker:', err));
  };

  useEffect(() => {
    if (visible && entityId) {
      loadData();
      setShowCreateForm(false);
      setNewItemName('');
      setNewItemUnit('Pcs');
      setNewItemOpeningQty('0');
      setNewItemOpeningRate('0.00');
    }
  }, [visible, entityId]);

  const getFilteredItems = () => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return items;
    return items.filter((item) => item.name.toLowerCase().includes(query));
  };

  const handleSelectItem = (item: StockItem) => {
    triggerHaptic();
    onSelect(item);
    setSearchQuery('');
    setShowCreateForm(false);
    onClose();
  };

  const handleOpenCreateForm = () => {
    triggerHaptic();
    setShowCreateForm(true);
    if (searchQuery.trim().length > 0) {
      setNewItemName(searchQuery.trim());
    }
  };

  const handleCreateStockItem = async () => {
    const trimmedName = newItemName.trim();
    const trimmedUnit = newItemUnit.trim() || 'Pcs';
    if (!trimmedName || !entityId) return;

    // Check for duplicate
    const duplicate = items.find(
      (item) => item.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      Alert.alert('Duplicate Stock Item', `A stock item named "${duplicate.name}" already exists.`);
      return;
    }

    setIsCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      let createdItem: StockItem | null = null;
      const openingQty = parseFloat(newItemOpeningQty) || 0;
      const openingRatePaise = parseInputToPaise(newItemOpeningRate);

      await database.write(async () => {
        createdItem = await database.get<StockItem>(TABLE_NAMES.STOCK_ITEMS).create((record) => {
          record.entityId = entityId;
          record.name = trimmedName;
          record.unit = trimmedUnit;
          record.openingQty = openingQty;
          record.openingRatePaise = openingRatePaise;
          record.isArchived = false;
        });
      });

      setIsCreating(false);

      if (createdItem) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        handleSelectItem(createdItem);
      }
    } catch (e: any) {
      setIsCreating(false);
      Alert.alert('Creation Failed', e.message || 'Database write error occurred.');
    }
  };

  const canCreate = newItemName.trim().length > 0;
  const filteredData = getFilteredItems();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <SafeAreaView style={styles.sheetContainer}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>
                {showCreateForm ? 'Create New Stock Item' : 'Select Stock Item'}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {showCreateForm ? (
              /* CREATE FORM VIEW */
              <ScrollView contentContainerStyle={styles.createFormContent} keyboardShouldPersistTaps="handled">
                <TouchableOpacity
                  style={styles.backToListBtn}
                  onPress={() => {
                    triggerHaptic();
                    setShowCreateForm(false);
                  }}
                >
                  <Ionicons name="arrow-back" size={16} color={colors.primary} />
                  <Text style={styles.backToListText}>Back to Stock List</Text>
                </TouchableOpacity>

                <Text style={styles.formLabel}>Item Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g., Lenovo Laptop, Apple iPad, Raw Sugar..."
                  placeholderTextColor={colors.textMuted}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  autoFocus
                  maxLength={100}
                />

                <Text style={styles.formLabel}>Unit of Measure *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g., Pcs, Kgs, Nos, Box..."
                  placeholderTextColor={colors.textMuted}
                  value={newItemUnit}
                  onChangeText={setNewItemUnit}
                  maxLength={20}
                />

                <View style={styles.formRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formLabel}>Opening Qty</Text>
                    <TextInput
                      style={styles.formInput}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      value={newItemOpeningQty}
                      onChangeText={setNewItemOpeningQty}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.formLabel}>Opening Rate (₹)</Text>
                    <TextInput
                      style={styles.formInput}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      value={newItemOpeningRate}
                      onChangeText={setNewItemOpeningRate}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.createBtn, !canCreate && styles.createBtnDisabled]}
                  onPress={handleCreateStockItem}
                  disabled={!canCreate || isCreating}
                >
                  <Ionicons name={isCreating ? 'hourglass-outline' : 'checkmark-circle'} size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.createBtnText}>
                    {isCreating ? 'Creating...' : 'Create & Select Item'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              /* LIST VIEW */
              <>
                <View style={styles.searchContainer}>
                  <Ionicons name="search-outline" size={20} color={colors.textMuted} style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search stock item..."
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView contentContainerStyle={styles.listContent}>
                  <TouchableOpacity style={styles.createNewRow} onPress={handleOpenCreateForm}>
                    <View style={styles.createNewLeft}>
                      <View style={styles.createNewIconCircle}>
                        <Ionicons name="add" size={18} color="#FFFFFF" />
                      </View>
                      <View>
                        <Text style={styles.createNewTitle}>Create New Stock Item</Text>
                        <Text style={styles.createNewSubtitle}>Add a custom inventory item</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                  </TouchableOpacity>

                  {filteredData.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
                      <Text style={styles.emptyText}>No stock items found</Text>
                      <Text style={styles.emptyHint}>Tap "Create New Stock Item" above to add one</Text>
                    </View>
                  ) : (
                    filteredData.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.itemRow}
                        onPress={() => handleSelectItem(item)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemUnit}>Unit: {item.unit}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginVertical: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: colors.text,
    paddingVertical: 0,
  },
  listContent: {
    paddingBottom: 40,
  },
  createNewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary + '08',
    borderWidth: 1,
    borderColor: colors.primary + '25',
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    marginBottom: 12,
  },
  createNewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  createNewIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  createNewTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.primary,
  },
  createNewSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  createFormContent: {
    paddingBottom: 40,
    paddingTop: 8,
  },
  backToListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
    marginBottom: 8,
  },
  backToListText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.primary,
  },
  formLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: colors.text,
  },
  formRow: {
    flexDirection: 'row',
  },
  createBtn: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  createBtnDisabled: {
    backgroundColor: colors.border,
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  createBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight + '50',
  },
  itemName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14.5,
    color: colors.text,
  },
  itemUnit: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyContainer: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyHint: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
