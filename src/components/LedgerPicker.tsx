/**
 * TallyTracker — LedgerPicker Component
 *
 * A searchable bottom sheet / modal picker that lists all ledgers of the active entity.
 * Ledgers are grouped under their parent Account Groups.
 * Supports filtering for Cash/Bank accounts (required for Contra vouchers).
 * Includes an inline "Create New Ledger" form so users can add custom ledger
 * accounts (e.g. Food Expense, Travel A/c) directly from the voucher entry screen.
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

import database, { Ledger, AccountGroup } from '@/db';
import { TABLE_NAMES } from '@/utils/constants';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { NATURE_COLORS } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';

interface LedgerPickerProps {
  visible: boolean;
  entityId: string;
  onClose: () => void;
  onSelect: (ledger: Ledger) => void;
  restrictToCashBank?: boolean; // Filters only Cash & Bank ledgers for Contra vouchers
}

export default function LedgerPicker({
  visible,
  entityId,
  onClose,
  onSelect,
  restrictToCashBank = false,
}: LedgerPickerProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'bank' | 'capital' | 'expense' | 'income' | 'assets' | 'liabilities'>('all');

  // Inline Create New Ledger form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const categories = [
    { key: 'all', label: 'All', icon: 'list-outline' },
    { key: 'bank', label: 'Bank / Cash', icon: 'card-outline' },
    { key: 'capital', label: 'Capital Account', icon: 'wallet-outline' },
    { key: 'expense', label: 'Expense Account', icon: 'trending-down-outline' },
    { key: 'income', label: 'Income Account', icon: 'trending-up-outline' },
    { key: 'assets', label: 'Assets', icon: 'business-outline' },
    { key: 'liabilities', label: 'Liabilities', icon: 'shield-outline' },
  ] as const;

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const loadData = () => {
    if (!entityId) return;
    Promise.all([
      database.get<AccountGroup>(TABLE_NAMES.ACCOUNT_GROUPS).query().fetch(),
      database.get<Ledger>(TABLE_NAMES.LEDGERS).query().fetch(),
    ])
      .then(([groupRecords, ledgerRecords]) => {
        const entityGroups = groupRecords
          .filter((g) => g.entityId === entityId)
          .sort((a, b) => a.displayOrder - b.displayOrder);
        setGroups(entityGroups);
        setLedgers(ledgerRecords.filter((l) => l.entityId === entityId && !l.isArchived));
        // Default to first group if no selection
        if (!newGroupId && entityGroups.length > 0) {
          setNewGroupId(entityGroups[0]!.id);
        }
      })
      .catch((err) => console.error('Failed to load ledgers in picker:', err));
  };

  useEffect(() => {
    if (visible && entityId) {
      loadData();
      setShowCreateForm(false);
      setNewLedgerName('');
    }
  }, [visible, entityId]);

  // Identifies Cash & Bank accounts for Contra vouchers
  const isCashOrBank = (ledgerName: string, groupName: string) => {
    const lName = ledgerName.toLowerCase();
    const gName = groupName.toLowerCase();
    return (
      lName.includes('cash') ||
      lName.includes('bank') ||
      lName.includes('card') ||
      lName.includes('wallet') ||
      lName.includes('od a/c') ||
      gName.includes('cash') ||
      gName.includes('bank')
    );
  };

  const getNatureStyles = (nature: string) => {
    const c = NATURE_COLORS[nature as keyof typeof NATURE_COLORS] || NATURE_COLORS.asset;
    return {
      bg: c.light,
      text: c.text,
      dot: c.primary,
    };
  };

  // Build filtered tree
  const getFilteredGroupsAndLedgers = () => {
    const query = searchQuery.toLowerCase().trim();

    return groups
      .map((group) => {
        let groupLedgers = ledgers.filter((l) => l.groupId === group.id);

        // Apply Contra restriction or Category filters if needed
        if (restrictToCashBank) {
          groupLedgers = groupLedgers.filter((l) => isCashOrBank(l.name, group.name));
        } else {
          if (selectedCategory === 'bank') {
            groupLedgers = groupLedgers.filter((l) => isCashOrBank(l.name, group.name));
          } else if (selectedCategory === 'capital') {
            groupLedgers = groupLedgers.filter((l) => group.name.toLowerCase().includes('capital') || group.nature === 'equity');
          } else if (selectedCategory === 'expense') {
            groupLedgers = groupLedgers.filter((l) => group.nature === 'expense');
          } else if (selectedCategory === 'income') {
            groupLedgers = groupLedgers.filter((l) => group.nature === 'income');
          } else if (selectedCategory === 'assets') {
            groupLedgers = groupLedgers.filter((l) => group.nature === 'asset');
          } else if (selectedCategory === 'liabilities') {
            groupLedgers = groupLedgers.filter((l) => group.nature === 'liability');
          }
        }

        // Apply search query
        const matchedLedgers = groupLedgers.filter(
          (l) => l.name.toLowerCase().includes(query) || (l.hsnSac && l.hsnSac.includes(query))
        );

        const groupMatches = group.name.toLowerCase().includes(query);
        const displayedLedgers = groupMatches ? groupLedgers : matchedLedgers;

        if (displayedLedgers.length === 0) return null;

        return {
          group,
          ledgers: displayedLedgers,
        };
      })
      .filter(Boolean) as { group: AccountGroup; ledgers: Ledger[] }[];
  };

  const handleSelectLedger = (ledger: Ledger) => {
    triggerHaptic();
    onSelect(ledger);
    setSearchQuery('');
    setShowCreateForm(false);
    onClose();
  };

  const handleOpenCreateForm = () => {
    triggerHaptic();
    setShowCreateForm(true);
    // Pre-fill with search query as ledger name if user typed something
    if (searchQuery.trim().length > 0) {
      setNewLedgerName(searchQuery.trim());
    }
  };

  const handleCreateLedger = async () => {
    const trimmedName = newLedgerName.trim();
    if (!trimmedName || !newGroupId || !entityId) return;

    // Check for duplicate names
    const duplicate = ledgers.find(
      (l) => l.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      Alert.alert('Duplicate Ledger', `A ledger named "${duplicate.name}" already exists. Please choose a different name.`);
      return;
    }

    setIsCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      let createdLedger: Ledger | null = null;

      await database.write(async () => {
        createdLedger = await database.get<Ledger>(TABLE_NAMES.LEDGERS).create((record) => {
          record.entityId = entityId;
          record.groupId = newGroupId;
          record.name = trimmedName;
          record.gstRate = 0;
          record.hsnSac = '';
          record.affectsStock = false;
          record.isSystem = false;
          record.openingBalanceDrCr = 'Dr';
          record.openingBalancePaise = 0;
          record.isArchived = false;
        });
      });

      setIsCreating(false);

      if (createdLedger) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        // Auto-select the newly created ledger
        handleSelectLedger(createdLedger);
      }
    } catch (e: any) {
      setIsCreating(false);
      Alert.alert('Creation Failed', e.message || 'Database write error occurred.');
    }
  };

  const canCreate = newLedgerName.trim().length > 0 && newGroupId.length > 0;

  const filteredData = getFilteredGroupsAndLedgers();

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
                {showCreateForm
                  ? 'Create New Ledger'
                  : restrictToCashBank
                  ? 'Select Cash/Bank Ledger'
                  : 'Select Ledger Account'}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {showCreateForm ? (
              /* ─── INLINE CREATE FORM ─────────────────────────────── */
              <ScrollView contentContainerStyle={styles.createFormContent} keyboardShouldPersistTaps="handled">
                {/* Back to list */}
                <TouchableOpacity
                  style={styles.backToListBtn}
                  onPress={() => {
                    triggerHaptic();
                    setShowCreateForm(false);
                  }}
                >
                  <Ionicons name="arrow-back" size={16} color={colors.primary} />
                  <Text style={styles.backToListText}>Back to Ledger List</Text>
                </TouchableOpacity>

                {/* Ledger Name */}
                <Text style={styles.formLabel}>Ledger Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g., Food Expense, Travel A/c, Office Supplies..."
                  placeholderTextColor={colors.textMuted}
                  value={newLedgerName}
                  onChangeText={setNewLedgerName}
                  autoFocus
                  maxLength={100}
                />

                {/* Account Group Selector */}
                <Text style={styles.formLabel}>Account Group *</Text>
                <Text style={styles.formHint}>
                  Select which category this ledger belongs to
                </Text>
                <ScrollView
                  horizontal={false}
                  style={styles.groupPickerContainer}
                  contentContainerStyle={styles.groupPickerContent}
                  nestedScrollEnabled
                >
                  {groups.map((group) => {
                    const isSelected = group.id === newGroupId;
                    const natureColors = getNatureStyles(group.nature);
                    return (
                      <TouchableOpacity
                        key={group.id}
                        style={[
                          styles.groupPickerItem,
                          isSelected && [styles.groupPickerItemActive, { borderColor: natureColors.dot }],
                        ]}
                        onPress={() => {
                          triggerHaptic();
                          setNewGroupId(group.id);
                        }}
                      >
                        <View style={styles.groupPickerItemLeft}>
                          <View style={[styles.groupPickerDot, { backgroundColor: natureColors.dot }]} />
                          <Text style={[styles.groupPickerItemText, isSelected && styles.groupPickerItemTextActive]}>
                            {group.name}
                          </Text>
                        </View>
                        <View style={[styles.groupPickerNatureBadge, { backgroundColor: natureColors.bg }]}>
                          <Text style={[styles.groupPickerNatureText, { color: natureColors.text }]}>
                            {group.nature.toUpperCase()}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Create Button */}
                <TouchableOpacity
                  style={[styles.createBtn, !canCreate && styles.createBtnDisabled]}
                  onPress={handleCreateLedger}
                  disabled={!canCreate || isCreating}
                >
                  <Ionicons name={isCreating ? 'hourglass-outline' : 'checkmark-circle'} size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.createBtnText}>
                    {isCreating ? 'Creating...' : 'Create & Select Ledger'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              /* ─── LEDGER LIST VIEW ──────────────────────────────── */
              <>
                {/* Search bar */}
                <View style={styles.searchContainer}>
                  <Ionicons name="search-outline" size={20} color={colors.textMuted} style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search ledger by name or HSN..."
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

                {/* Category Quick Filter Pills */}
                {!restrictToCashBank && (
                  <View style={styles.categoryContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                      {categories.map((cat) => {
                        const isActive = selectedCategory === cat.key;
                        return (
                          <TouchableOpacity
                            key={cat.key}
                            style={[styles.catBtn, isActive && styles.catBtnActive]}
                            onPress={() => {
                              triggerHaptic();
                              setSelectedCategory(cat.key);
                            }}
                          >
                            <Ionicons
                              name={cat.icon}
                              size={13}
                              color={isActive ? '#FFFFFF' : colors.textSecondary}
                              style={{ marginRight: 4 }}
                            />
                            <Text style={[styles.catText, isActive && styles.catTextActive]}>
                              {cat.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Scrollable list of grouped ledgers */}
                <ScrollView contentContainerStyle={styles.listContent}>
                  {/* ── Create New Ledger Button ────────────────── */}
                  <TouchableOpacity style={styles.createNewRow} onPress={handleOpenCreateForm}>
                    <View style={styles.createNewLeft}>
                      <View style={styles.createNewIconCircle}>
                        <Ionicons name="add" size={18} color="#FFFFFF" />
                      </View>
                      <View>
                        <Text style={styles.createNewTitle}>Create New Ledger</Text>
                        <Text style={styles.createNewSubtitle}>
                          {searchQuery.trim()
                            ? `Add "${searchQuery.trim()}" as a new account`
                            : 'Add a custom ledger account'}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                  </TouchableOpacity>

                  {filteredData.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
                      <Text style={styles.emptyText}>No matching ledgers found</Text>
                      <Text style={styles.emptyHint}>Tap "Create New Ledger" above to add one</Text>
                    </View>
                  ) : (
                    filteredData.map(({ group, ledgers: groupLedgers }) => {
                      const natureColors = getNatureStyles(group.nature);
                      return (
                        <View key={group.id} style={styles.groupSection}>
                          {/* Group Header */}
                          <View style={styles.groupHeader}>
                            <Text style={styles.groupName}>{group.name}</Text>
                            <View style={[styles.natureBadge, { backgroundColor: natureColors.bg }]}>
                              <View style={[styles.natureDot, { backgroundColor: natureColors.dot }]} />
                              <Text style={[styles.natureText, { color: natureColors.text }]}>
                                {group.nature.toUpperCase()}
                              </Text>
                            </View>
                          </View>

                          {/* Ledgers List */}
                          <View style={styles.ledgersList}>
                            {groupLedgers.map((ledger) => (
                              <TouchableOpacity
                                key={ledger.id}
                                style={styles.ledgerRow}
                                onPress={() => handleSelectLedger(ledger)}
                              >
                                <Text style={styles.ledgerName}>{ledger.name}</Text>
                                <View style={styles.ledgerMeta}>
                                  {ledger.gstRate > 0 && (
                                    <View style={styles.gstBadge}>
                                      <Text style={styles.gstBadgeText}>{ledger.gstRate}% GST</Text>
                                    </View>
                                  )}
                                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                                </View>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      );
                    })
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
  categoryContainer: {
    marginBottom: 12,
  },
  categoryScroll: {
    gap: 8,
    paddingHorizontal: 2,
    flexDirection: 'row',
  },
  catBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  catBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  catTextActive: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  listContent: {
    paddingBottom: 40,
  },

  // ─── Create New Ledger Row ──────────────────────────────────
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

  // ─── Create Form ────────────────────────────────────────────
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
  formHint: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 10,
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
  groupPickerContainer: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.background,
  },
  groupPickerContent: {
    padding: 6,
    gap: 4,
  },
  groupPickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  groupPickerItemActive: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
  },
  groupPickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupPickerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  groupPickerItemText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13.5,
    color: colors.text,
  },
  groupPickerItemTextActive: {
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  groupPickerNatureBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  groupPickerNatureText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 8,
    letterSpacing: 0.3,
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

  // ─── Grouped Ledger List ────────────────────────────────────
  groupSection: {
    marginTop: 12,
    marginBottom: 8,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    marginBottom: 6,
  },
  groupName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  natureBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  natureDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginRight: 4,
  },
  natureText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 8,
  },
  ledgersList: {
    gap: 2,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight + '50',
  },
  ledgerName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14.5,
    color: colors.text,
  },
  ledgerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gstBadge: {
    backgroundColor: colors.primary + '10',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gstBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 8,
    color: colors.primary,
  },
  emptyContainer: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: colors.textMuted,
  },
  emptyHint: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.primary,
  },
});
