/**
 * TallyTracker — Client Entities Management Screen
 *
 * Implements:
 * 1. A clean cards list of all client entities managed by the CA.
 * 2. Active client switching (persisted via useEntityStore).
 * 3. Dynamic search filter to lookup clients quickly.
 * 4. Slide-up registration sheet to add new clients.
 * 5. Indian PAN & GSTIN formats validation.
 * 6. Automated seeding of groups/ledgers on new entity registration.
 * 7. Archiving/Unarchiving actions.
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
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { Entity } from '@/db';
import { seedAccountTree } from '@/db/seed';
import { TABLE_NAMES, APP_CONFIG } from '@/utils/constants';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useEntityStore } from '@/stores/entityStore';
import { useAuthStore } from '@/stores/authStore';
import { useThemedStyles } from '@/theme/useThemedStyles';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export default function EntitiesScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const { activeEntityId, setActiveEntity, clearActiveEntity } = useEntityStore();
  const { caUserId, isPremium } = useAuthStore();

  const [entities, setEntities] = useState<Entity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [address, setAddress] = useState('');
  const [fyStart, setFyStart] = useState<4 | 1>(4); // default April

  const isHindi = i18n.language === 'hi';
  const getLabel = (enStr: string, hiStr: string) => (isHindi ? hiStr : enStr);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const loadEntities = () => {
    if (!caUserId) return;
    database
      .get<Entity>(TABLE_NAMES.ENTITIES)
      .query()
      .fetch()
      .then((records) => {
        // Sort by active first, then unarchived, then alphabetical
        const sorted = [...records].sort((a, b) => {
          if (a.id === activeEntityId) return -1;
          if (b.id === activeEntityId) return 1;
          if (a.isArchived && !b.isArchived) return 1;
          if (!a.isArchived && b.isArchived) return -1;
          return a.name.localeCompare(b.name);
        });
        
        // Convert to plain objects to prevent FlatList VirtualizedList 'property is not configurable' crash
        const plainEntities = sorted.map((record) => ({
          id: record.id,
          caUserId: record.caUserId,
          name: record.name,
          pan: record.pan,
          gstin: record.gstin,
          address: record.address,
          financialYearStart: record.financialYearStart,
          baseCurrency: record.baseCurrency,
          isArchived: record.isArchived,
        }));
        setEntities(plainEntities as any);
      })
      .catch(() => setEntities([]));
  };

  useEffect(() => {
    loadEntities();
  }, [caUserId, activeEntityId]);

  const handleSelectEntity = (entity: any) => {
    if (entity.isArchived) {
      Alert.alert(
        getLabel('Archived Client', 'अभिलेखागार ग्राहक'),
        getLabel(
          'This client is archived. Please unarchive it first to switch to it.',
          'यह ग्राहक संग्रहित है। इस पर जाने के लिए कृपया पहले इसे अनआर्काइव करें।'
        ),
        [{ text: 'OK' }]
      );
      return;
    }
    triggerHaptic();
    setActiveEntity(entity.id);
    router.replace('/(tabs)');
  };

  const handleToggleArchive = (entity: any) => {
    triggerHaptic();
    const action = entity.isArchived ? 'Unarchive' : 'Archive';
    const actionLabel = getLabel(action, entity.isArchived ? 'संग्रह से निकालें' : 'संग्रह करें');

    Alert.alert(
      getLabel(`${action} Client`, `${actionLabel} ग्राहक`),
      getLabel(
        `Are you sure you want to ${action.toLowerCase()} ${entity.name}?`,
        `क्या आप सुनिश्चित हैं कि आप ${entity.name} को ${actionLabel.toLowerCase()} करना चाहते हैं?`
      ),
      [
        { text: getLabel('Cancel', 'रद्द करें'), style: 'cancel' },
        {
          text: actionLabel,
          style: entity.isArchived ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await database.write(async () => {
                const dbEntity = await database.get<Entity>(TABLE_NAMES.ENTITIES).find(entity.id);
                await dbEntity.update((record) => {
                  record.isArchived = !entity.isArchived;
                });
              });
              // If archiving the active entity, clear it
              if (!entity.isArchived && entity.id === activeEntityId) {
                clearActiveEntity();
              }
              loadEntities();
            } catch (err) {
              console.error('Failed to update entity archive status:', err);
            }
          },
        },
      ]
    );
  };

  // Live input validations
  const isPanValid = !pan || PAN_REGEX.test(pan);
  const isGstinValid = !gstin || GSTIN_REGEX.test(gstin);
  const canSave = name.trim().length > 0 && isPanValid && isGstinValid;

  const handleOpenAddModal = () => {
    triggerHaptic();
    if (entities.length >= APP_CONFIG.MAX_FREE_ENTITIES && !isPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(
        getLabel('Premium Upgrade Required', 'प्रीमियम अपग्रेड आवश्यक'),
        getLabel(
          `You have reached the maximum free limit of ${APP_CONFIG.MAX_FREE_ENTITIES} client entities. Upgrade to Pro to add unlimited businesses!`,
          `आप ${APP_CONFIG.MAX_FREE_ENTITIES} ग्राहक संस्थाओं की अधिकतम मुफ्त सीमा तक पहुँच चुके हैं। असीमित व्यवसायों को जोड़ने के लिए प्रो में अपग्रेड करें!`
        ),
        [
          { text: getLabel('Cancel', 'रद्द करें'), style: 'cancel' },
          {
            text: getLabel('Upgrade to Pro', 'प्रो में अपग्रेड करें'),
            onPress: () => router.push('/premium'),
          },
        ]
      );
      return;
    }
    setShowAddModal(true);
  };

  const handleCreateEntity = async () => {
    if (!canSave || !caUserId) return;

    if (entities.length >= APP_CONFIG.MAX_FREE_ENTITIES && !isPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setShowAddModal(false);
      router.push('/premium');
      return;
    }

    triggerHaptic();

    try {
      // 1. Create Entity record
      const newEntity = await database.write(async () => {
        return await database.get<Entity>(TABLE_NAMES.ENTITIES).create((record) => {
          record.caUserId = caUserId;
          record.name = name.trim();
          record.pan = pan.trim().toUpperCase();
          record.gstin = gstin.trim().toUpperCase();
          record.address = address.trim();
          record.financialYearStart = fyStart;
          record.baseCurrency = 'INR';
          record.closedFyYears = '[]';
          record.isArchived = false;
        });
      });

      // 2. Seed Default Account tree groups & ledgers
      await seedAccountTree(database, newEntity.id);

      // 3. Clear states, close modal & load
      setName('');
      setGstin('');
      setPan('');
      setAddress('');
      setFyStart(4);
      setShowAddModal(false);

      // Set active
      setActiveEntity(newEntity.id);
      loadEntities();

      Alert.alert(
        getLabel('Client Added', 'ग्राहक जोड़ा गया'),
        getLabel(
          `Successfully registered ${newEntity.name} and seeded default groups.`,
          `${newEntity.name} सफलतापूर्वक पंजीकृत हुआ और डिफ़ॉल्ट समूह बीज दिए गए।`
        ),
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
    } catch (e: any) {
      Alert.alert('Registration Failed', e.message || 'Database error occurred.');
    }
  };

  const filteredEntities = entities.filter((entity) =>
    entity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entity.pan.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entity.gstin.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{getLabel('Client Entities', 'ग्राहक संस्थाएं')}</Text>
          <Text style={styles.headerSubtitle}>
            {getLabel('Switch client active company context', 'सक्रिय कंपनी संदर्भ बदलें')}
          </Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={getLabel('Search by name, PAN or GSTIN...', 'नाम, पैन या जीएसटीएन द्वारा खोजें...')}
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

      {/* Entity List */}
      <FlatList
        data={filteredEntities}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isActive = item.id === activeEntityId;
          return (
            <TouchableOpacity
              style={[
                styles.entityCard,
                isActive && styles.entityCardActive,
                item.isArchived && styles.entityCardArchived,
              ]}
              onPress={() => handleSelectEntity(item)}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entityName}>{item.name}</Text>
                  <Text style={styles.entityFy}>
                    {getLabel('Financial Year: ', 'वित्तीय वर्ष: ')}
                    {item.financialYearStart === 4
                      ? getLabel('April – March', 'अप्रैल – मार्च')
                      : getLabel('January – December', 'जनवरी – दिसंबर')}
                  </Text>
                </View>
                {isActive && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>{getLabel('ACTIVE', 'सक्रिय')}</Text>
                  </View>
                )}
                {item.isArchived && (
                  <View style={styles.archivedBadge}>
                    <Text style={styles.archivedBadgeText}>{getLabel('ARCHIVED', 'संग्रहित')}</Text>
                  </View>
                )}
              </View>

              {/* Tax Details Row */}
              <View style={styles.taxDetailsRow}>
                {item.pan ? (
                  <View style={styles.badgeContainer}>
                    <Text style={styles.badgeLabel}>PAN</Text>
                    <Text style={styles.badgeVal}>{item.pan}</Text>
                  </View>
                ) : null}
                {item.gstin ? (
                  <View style={styles.badgeContainer}>
                    <Text style={styles.badgeLabel}>GSTIN</Text>
                    <Text style={styles.badgeVal}>{item.gstin}</Text>
                  </View>
                ) : null}
              </View>

              {/* Card Footer Actions */}
              <View style={styles.cardActions}>
                <Text style={styles.addressText} numberOfLines={1}>
                  {item.address || getLabel('No address registered', 'कोई पता दर्ज नहीं है')}
                </Text>
                <TouchableOpacity
                  style={styles.archiveIconButton}
                  onPress={() => handleToggleArchive(item)}
                >
                  <Ionicons
                    name={item.isArchived ? 'archive' : 'archive-outline'}
                    size={20}
                    color={item.isArchived ? colors.primary : colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="business-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {getLabel('No client entities found', 'कोई ग्राहक संस्थाएं नहीं मिलीं')}
            </Text>
          </View>
        }
      />

      {/* Floating Add Client Button */}
      <TouchableOpacity style={styles.floatingAddBtn} onPress={handleOpenAddModal}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
        <Text style={styles.floatingAddBtnText}>{getLabel('Add Client', 'ग्राहक जोड़ें')}</Text>
      </TouchableOpacity>

      {/* Add Client Modal */}
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
                <Text style={styles.modalTitle}>{getLabel('Add Client Entity', 'ग्राहक संस्था जोड़ें')}</Text>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalScroll}>
                <Text style={styles.fieldLabel}>{getLabel('Business Name', 'व्यवसाय का नाम')} *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder={getLabel('e.g., Krishna Traders', 'उदा., कृष्णा ट्रेडर्स')}
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                />

                <Text style={styles.fieldLabel}>{getLabel('PAN (e.g. ABCDE1234F)', 'पैन कार्ड नंबर')}</Text>
                <TextInput
                  style={[styles.modalInput, !isPanValid && styles.modalInputError]}
                  placeholder="ABCDE1234F"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  value={pan}
                  onChangeText={(val) => setPan(val.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                  maxLength={10}
                />
                {!isPanValid && (
                  <Text style={styles.fieldError}>
                    {getLabel('Invalid PAN format (e.g., 5 letters, 4 digits, 1 letter)', 'अवैध पैन प्रारूप (उदा., 5 अक्षर, 4 अंक, 1 अक्षर)')}
                  </Text>
                )}

                <Text style={styles.fieldLabel}>{getLabel('GSTIN (e.g. 27AAAAA1111A1Z1)', 'जीएसटीएन नंबर')}</Text>
                <TextInput
                  style={[styles.modalInput, !isGstinValid && styles.modalInputError]}
                  placeholder="27AAAAA1111A1Z1"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  value={gstin}
                  onChangeText={(val) => setGstin(val.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                  maxLength={15}
                />
                {!isGstinValid && (
                  <Text style={styles.fieldError}>
                    {getLabel('Invalid GSTIN format (15 alphanumeric characters)', 'अवैध जीएसटीएन प्रारूप (15 अक्षरांकीय अक्षर)')}
                  </Text>
                )}

                <Text style={styles.fieldLabel}>{getLabel('Business Address', 'व्यवसाय का पता')}</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder={getLabel('Address details...', 'पता विवरण...')}
                  placeholderTextColor={colors.textMuted}
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  numberOfLines={2}
                  maxLength={200}
                />

                <Text style={styles.fieldLabel}>{getLabel('Financial Year Cycle', 'वित्तीय वर्ष चक्र')}</Text>
                <View style={styles.tabRow}>
                  <TouchableOpacity
                    style={[styles.tabButton, fyStart === 4 && styles.tabButtonActive]}
                    onPress={() => { triggerHaptic(); setFyStart(4); }}
                  >
                    <Text style={[styles.tabText, fyStart === 4 && styles.tabTextActive]}>
                      {getLabel('April 1st', '१ अप्रैल')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, fyStart === 1 && styles.tabButtonActive]}
                    onPress={() => { triggerHaptic(); setFyStart(1); }}
                  >
                    <Text style={[styles.tabText, fyStart === 1 && styles.tabTextActive]}>
                      {getLabel('January 1st', '१ जनवरी')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Save button */}
                <TouchableOpacity
                  style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                  onPress={handleCreateEntity}
                  disabled={!canSave}
                >
                  <Text style={styles.saveBtnText}>{getLabel('Register & Seed Default Ledger', 'पंजीकृत करें और डिफ़ॉल्ट लेजर जोड़ें')}</Text>
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
    fontSize: 22,
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
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  entityCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  entityCardActive: {
    borderColor: colors.primary,
    borderWidth: 2,
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  entityCardArchived: {
    opacity: 0.6,
    backgroundColor: colors.background,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: 10,
    marginBottom: 10,
  },
  entityName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: colors.text,
  },
  entityFy: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  activeBadge: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: colors.primary,
  },
  archivedBadge: {
    backgroundColor: colors.textMuted + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  archivedBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: colors.textSecondary,
  },
  taxDetailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: colors.textMuted,
    marginRight: 4,
  },
  badgeVal: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: colors.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 8,
  },
  addressText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
    marginRight: 16,
  },
  archiveIconButton: {
    padding: 4,
  },
  emptyContainer: {
    paddingVertical: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: colors.textMuted,
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
    fontSize: 18,
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
  modalInputError: {
    borderColor: colors.danger,
  },
  fieldError: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: colors.danger,
    marginTop: 4,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
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
