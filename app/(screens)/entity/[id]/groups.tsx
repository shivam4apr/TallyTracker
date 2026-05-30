/**
 * TallyTracker — Account Groups Management Screen
 *
 * Implements:
 * 1. Dual Listing: System Groups (locked) and Custom Groups (deletable).
 * 2. Slide-up Modal Form to create a new custom Account Group.
 * 3. Parent Group Selection Picker.
 * 4. Automatic nature inheritance from the selected parent group.
 * 5. Deletion validation: prevents deleting system groups or groups containing active ledgers.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { AccountGroup, Ledger } from '@/db';
import { TABLE_NAMES } from '@/utils/constants';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { NATURE_COLORS } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';

export default function GroupsScreen() {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { id: entityId } = useLocalSearchParams<{ id: string }>();

  // Records State
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);

  // UI Control State
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [groupName, setGroupName] = useState('');
  const [parentGroupId, setParentGroupId] = useState('');

  const isHindi = i18n.language === 'hi';
  const getLabel = (enStr: string, hiStr: string) => (isHindi ? hiStr : enStr);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const loadData = async () => {
    if (!entityId) return;

    try {
      // Load groups
      const groupRecords = await database
        .get<AccountGroup>(TABLE_NAMES.ACCOUNT_GROUPS)
        .query()
        .fetch();
      const filteredGroups = groupRecords.filter((g) => g.entityId === entityId);
      setGroups(filteredGroups);

      // Load ledgers for deletion verification
      const ledgerRecords = await database
        .get<Ledger>(TABLE_NAMES.LEDGERS)
        .query()
        .fetch();
      const filteredLedgers = ledgerRecords.filter((l) => l.entityId === entityId);
      setLedgers(filteredLedgers);
    } catch (e) {
      console.error('Failed to load database records for groups:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, [entityId]);

  const getParentGroupName = (parentGroupId: string | null) => {
    if (!parentGroupId) return '—';
    const parent = groups.find((g) => g.id === parentGroupId);
    return parent ? parent.name : '—';
  };

  const getNatureStyles = (nature: string) => {
    const c = NATURE_COLORS[nature as keyof typeof NATURE_COLORS] || NATURE_COLORS.asset;
    return {
      bg: c.light,
      text: c.text,
      dot: c.primary,
    };
  };

  const selectedParent = groups.find((g) => g.id === parentGroupId);
  const inheritedNature = selectedParent?.nature || 'asset';

  const canSave = groupName.trim().length > 0 && parentGroupId.length > 0;

  const handleCreateGroup = async () => {
    if (!canSave || !entityId || !selectedParent) return;
    triggerHaptic();

    try {
      await database.write(async () => {
        await database.get<AccountGroup>(TABLE_NAMES.ACCOUNT_GROUPS).create((record) => {
          record.entityId = entityId;
          record.name = groupName.trim();
          record.parentGroupId = parentGroupId;
          record.nature = selectedParent.nature; // Inherit parent's nature
          record.isSystem = false;
          record.displayOrder = 10; // custom groups display order
        });
      });

      setGroupName('');
      setParentGroupId('');
      setShowAddModal(false);
      loadData();

      Alert.alert(
        getLabel('Group Created', 'समूह बनाया गया'),
        getLabel('Custom account group registered successfully.', 'कस्टम खाता समूह सफलतापूर्वक पंजीकृत किया गया।')
      );
    } catch (e: any) {
      Alert.alert('Creation Failed', e.message || 'Database write error occurred.');
    }
  };

  const handleDeleteGroup = (group: AccountGroup) => {
    if (group.isSystem) return;
    triggerHaptic();

    // 1. Check if group has active ledgers
    const hasLedgers = ledgers.some((l) => l.groupId === group.id);
    if (hasLedgers) {
      Alert.alert(
        getLabel('Delete Blocked', 'हटाना अवरुद्ध है'),
        getLabel(
          'This group contains active ledgers. Please delete or reassign those ledgers before deleting this group.',
          'इस समूह में सक्रिय लेजर हैं। कृपया इस समूह को हटाने से पहले उन लेजरों को हटाएं या पुन: असाइन करें।'
        )
      );
      return;
    }

    // 2. Check if group has sub-groups
    const hasSubgroups = groups.some((g) => g.parentGroupId === group.id);
    if (hasSubgroups) {
      Alert.alert(
        getLabel('Delete Blocked', 'हटाना अवरुद्ध है'),
        getLabel(
          'This group contains nested sub-groups. Please delete those sub-groups first.',
          'इस समूह में उप-समूह हैं। कृपया पहले उन उप-समूहों को हटाएं।'
        )
      );
      return;
    }

    Alert.alert(
      getLabel('Delete Group', 'समूह हटाएं'),
      getLabel(
        `Are you sure you want to delete custom group: ${group.name}?`,
        `क्या आप निश्चित हैं कि आप कस्टम समूह: ${group.name} को हटाना चाहते हैं?`
      ),
      [
        { text: getLabel('Cancel', 'रद्द करें'), style: 'cancel' },
        {
          text: getLabel('Delete', 'हटाएं'),
          style: 'destructive',
          onPress: async () => {
            await database.write(async () => {
              await group.destroyPermanently(); // safe local delete for custom groups
            });
            loadData();
          },
        },
      ]
    );
  };

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const systemGroups = filteredGroups.filter((g) => g.isSystem);
  const customGroups = filteredGroups.filter((g) => !g.isSystem);

  const renderGroupItem = ({ item }: { item: AccountGroup }) => {
    const natureColors = getNatureStyles(item.nature);
    return (
      <View style={styles.groupCard}>
        <View style={styles.groupCardLeft}>
          <Text style={styles.groupCardName}>{item.name}</Text>
          <View style={styles.groupCardSubRow}>
            <Text style={styles.parentText}>
              {getLabel('Parent: ', 'जनक समूह: ')}
              {getParentGroupName(item.parentGroupId)}
            </Text>
            {item.isSystem && (
              <View style={styles.lockedBadge}>
                <Ionicons name="lock-closed" size={10} color={colors.textSecondary} />
                <Text style={styles.lockedBadgeText}>{getLabel('SYSTEM', 'सिस्टम')}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.groupCardRight}>
          <View style={[styles.natureBadge, { backgroundColor: natureColors.bg }]}>
            <View style={[styles.natureDot, { backgroundColor: natureColors.dot }]} />
            <Text style={[styles.natureText, { color: natureColors.text }]}>
              {item.nature.toUpperCase()}
            </Text>
          </View>
          {!item.isSystem && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDeleteGroup(item)}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{getLabel('Account Groups', 'खाता समूह')}</Text>
          <Text style={styles.headerSubtitle}>
            {getLabel('Organize ledgers inside business entities', 'व्यवसाय संस्थाओं के भीतर लेजर व्यवस्थित करें')}
          </Text>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={getLabel('Search groups by name...', 'नाम से समूह खोजें...')}
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

      {/* Groups List */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {customGroups.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>{getLabel('Custom Groups', 'कस्टम समूह')}</Text>
            {customGroups.map((g) => (
              <View key={g.id}>{renderGroupItem({ item: g })}</View>
            ))}
          </>
        )}

        <Text style={styles.sectionHeader}>{getLabel('System Groups', 'सिस्टम समूह')}</Text>
        {systemGroups.map((g) => (
          <View key={g.id}>{renderGroupItem({ item: g })}</View>
        ))}
      </ScrollView>

      {/* Floating Add Group Button */}
      <TouchableOpacity style={styles.floatingAddBtn} onPress={() => { triggerHaptic(); setShowAddModal(true); }}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
        <Text style={styles.floatingAddBtnText}>{getLabel('Add Group', 'समूह जोड़ें')}</Text>
      </TouchableOpacity>

      {/* Add Group Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoidingView}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{getLabel('Create Account Group', 'खाता समूह बनाएं')}</Text>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalScroll}>
                <Text style={styles.fieldLabel}>{getLabel('Group Name', 'समूह का नाम')} *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder={getLabel('e.g., Office Expenses', 'उदा., कार्यालय व्यय')}
                  placeholderTextColor={colors.textMuted}
                  value={groupName}
                  onChangeText={setGroupName}
                  maxLength={100}
                />

                <Text style={styles.fieldLabel}>{getLabel('Parent Group Selection', 'जनक समूह का चयन')} *</Text>
                <View style={styles.pickerContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.groupPickerRow}>
                      {groups.map((group) => {
                        const isSelected = group.id === parentGroupId;
                        return (
                          <TouchableOpacity
                            key={group.id}
                            style={[
                              styles.groupPickerChip,
                              isSelected && styles.groupPickerChipActive,
                            ]}
                            onPress={() => {
                              triggerHaptic();
                              setParentGroupId(group.id);
                            }}
                          >
                            <Text
                              style={[
                                styles.groupPickerChipText,
                                isSelected && styles.groupPickerChipTextActive,
                              ]}
                            >
                              {group.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>

                {/* Nature Inheritance Preview */}
                {parentGroupId ? (
                  <View style={styles.naturePreviewRow}>
                    <Text style={styles.naturePreviewLabel}>
                      {getLabel('Inherited Nature:', 'वंशानुगत प्रकृति:')}
                    </Text>
                    <View
                      style={[
                        styles.natureBadge,
                        { backgroundColor: getNatureStyles(inheritedNature).bg },
                      ]}
                    >
                      <View
                        style={[
                          styles.natureDot,
                          { backgroundColor: getNatureStyles(inheritedNature).dot },
                        ]}
                      />
                      <Text
                        style={[
                          styles.natureText,
                          { color: getNatureStyles(inheritedNature).text },
                        ]}
                      >
                        {inheritedNature.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* Save button */}
                <TouchableOpacity
                  style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                  onPress={handleCreateGroup}
                  disabled={!canSave}
                >
                  <Text style={styles.saveBtnText}>{getLabel('Save Account Group', 'खाता समूह सहेजें')}</Text>
                </TouchableOpacity>
              </ScrollView>
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
    fontSize: 20,
    color: colors.text,
  },
  headerSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginHorizontal: 20,
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  sectionHeader: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
  },
  groupCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.01,
    shadowRadius: 2,
    elevation: 0.5,
  },
  groupCardLeft: {
    flex: 1,
  },
  groupCardName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14.5,
    color: colors.text,
  },
  groupCardSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  parentText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  lockedBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 8,
    color: colors.textSecondary,
  },
  groupCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  natureBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  natureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  natureText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 9,
  },
  deleteBtn: {
    padding: 6,
    backgroundColor: colors.danger + '10',
    borderRadius: 8,
  },
  floatingAddBtn: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  floatingAddBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
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
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 17,
    color: colors.text,
  },
  modalScroll: {
    paddingBottom: 24,
  },
  fieldLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: colors.text,
  },
  pickerContainer: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 8,
  },
  groupPickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  groupPickerChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  groupPickerChipActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  groupPickerChipText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  groupPickerChipTextActive: {
    color: colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  naturePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  naturePreviewLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  saveBtnDisabled: {
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  saveBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
});
