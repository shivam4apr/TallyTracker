/**
 * TallyTracker — Ledger Management Screen
 *
 * Implements:
 * 1. Tree View: Account Groups with nested Ledgers.
 * 2. Collapse/Expand toggle for group headers.
 * 3. Color-coded badges mapping the Group's nature (Asset, Liability, Income, Expense, Equity).
 * 4. Real-time search query over groups and ledgers.
 * 5. Slide-up Modal Form to create a new Ledger or edit an existing custom Ledger.
 * 6. Opening balance decimal Rupees input parsing to Paise integer.
 * 7. Write-protection for System groups and ledgers (`isSystem = true`).
 * 8. Navigation link to Custom Group Creator.
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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { Entity, AccountGroup, Ledger, Party } from '@/db';
import { Q } from '@nozbe/watermelondb';
import { TABLE_NAMES, GST_RATES, DrCr } from '@/utils/constants';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { NATURE_COLORS } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { formatPaise, parseInputToPaise, formatPaisePlain } from '@/utils/money';

export default function LedgersScreen() {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { id: entityId } = useLocalSearchParams<{ id: string }>();

  // Database Records State
  const [entity, setEntity] = useState<Entity | null>(null);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);

  // UI Control State
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [selectedLedger, setSelectedLedger] = useState<Ledger | null>(null); // null if creating

  // Form Input State
  const [ledgerName, setLedgerName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [gstRate, setGstRate] = useState<number>(0);
  const [hsnSac, setHsnSac] = useState('');
  const [affectsStock, setAffectsStock] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(''); // input as Rupees string (e.g. "125.50")
  const [openingDrCr, setOpeningDrCr] = useState<DrCr>('Dr');

  // Party Details State
  const [hasPartyDetails, setHasPartyDetails] = useState(false);
  const [partyGstin, setPartyGstin] = useState('');
  const [partyPan, setPartyPan] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyEmail, setPartyEmail] = useState('');
  const [partyBillingAddress, setPartyBillingAddress] = useState('');
  const [partyShippingAddress, setPartyShippingAddress] = useState('');
  const [partyStateCode, setPartyStateCode] = useState('');
  const [partyCreditDays, setPartyCreditDays] = useState('');
  const [partyCreditLimit, setPartyCreditLimit] = useState('');
  const [existingPartyRecord, setExistingPartyRecord] = useState<any>(null);

  const isHindi = i18n.language === 'hi';
  const getLabel = (enStr: string, hiStr: string) => (isHindi ? hiStr : enStr);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleGstinChange = (val: string) => {
    const formatted = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setPartyGstin(formatted);
    
    // Auto-extract State Code (first 2 digits)
    if (formatted.length >= 2) {
      setPartyStateCode(formatted.substring(0, 2));
    }
    
    // Auto-extract PAN (digits 3 to 12)
    if (formatted.length >= 12) {
      setPartyPan(formatted.substring(2, 12));
    }
  };

  const loadData = async () => {
    if (!entityId) return;

    try {
      // 1. Fetch Entity details
      const entRecord = await database.get<Entity>(TABLE_NAMES.ENTITIES).find(entityId);
      setEntity(entRecord);

      // 2. Fetch all Groups
      const groupRecords = await database
        .get<AccountGroup>(TABLE_NAMES.ACCOUNT_GROUPS)
        .query()
        .fetch();
      // Filter groups for this entity
      const filteredGroups = groupRecords
        .filter((g) => g.entityId === entityId)
        .sort((a, b) => a.displayOrder - b.displayOrder);
      setGroups(filteredGroups);

      // 3. Fetch all Ledgers
      const ledgerRecords = await database
        .get<Ledger>(TABLE_NAMES.LEDGERS)
        .query()
        .fetch();
      // Filter ledgers for this entity
      const filteredLedgers = ledgerRecords.filter((l) => l.entityId === entityId);
      setLedgers(filteredLedgers);
    } catch (e) {
      console.error('Failed to load database records for ledgers:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, [entityId]);

  const toggleGroupCollapse = (groupId: string) => {
    triggerHaptic();
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Group Nature Badges & Colors mapping helper
  const getNatureStyles = (nature: string) => {
    const c = NATURE_COLORS[nature as keyof typeof NATURE_COLORS] || NATURE_COLORS.asset;
    return {
      bg: c.light,
      border: c.primary,
      text: c.text,
      dot: c.primary,
    };
  };

  // Setup form fields on Edit
  const openEditModal = (ledger: Ledger) => {
    triggerHaptic();
    setSelectedLedger(ledger);
    setLedgerName(ledger.name);
    setSelectedGroupId(ledger.groupId);
    setGstRate(ledger.gstRate);
    setHsnSac(ledger.hsnSac || '');
    setAffectsStock(ledger.affectsStock);
    setOpeningBalance(ledger.openingBalancePaise > 0 ? formatPaisePlain(ledger.openingBalancePaise) : '');
    setOpeningDrCr(ledger.openingBalanceDrCr || 'Dr');

    // Query Party record linked to this ledger
    database
      .get('parties')
      .query(Q.where('ledger_id', ledger.id))
      .fetch()
      .then((parties) => {
        if (parties.length > 0) {
          const party = parties[0] as any;
          setHasPartyDetails(true);
          setPartyGstin(party.gstin || '');
          setPartyPan(party.pan || '');
          setPartyPhone(party.phone || '');
          setPartyEmail(party.email || '');
          setPartyBillingAddress(party.billingAddress || '');
          setPartyShippingAddress(party.shippingAddress || '');
          setPartyStateCode(party.stateCode || '');
          setPartyCreditDays(party.creditDays > 0 ? String(party.creditDays) : '');
          setPartyCreditLimit(party.creditLimitPaise > 0 ? formatPaisePlain(party.creditLimitPaise) : '');
          setExistingPartyRecord(party);
        } else {
          setHasPartyDetails(false);
          setPartyGstin('');
          setPartyPan('');
          setPartyPhone('');
          setPartyEmail('');
          setPartyBillingAddress('');
          setPartyShippingAddress('');
          setPartyStateCode('');
          setPartyCreditDays('');
          setPartyCreditLimit('');
          setExistingPartyRecord(null);
        }
      })
      .catch((err) => {
        console.error('Failed to load party details:', err);
        setHasPartyDetails(false);
      });

    setShowLedgerModal(true);
  };

  // Setup form fields on Create
  const openCreateModal = () => {
    triggerHaptic();
    setSelectedLedger(null);
    setLedgerName('');
    setSelectedGroupId(groups[0]?.id || '');
    setGstRate(0);
    setHsnSac('');
    setAffectsStock(false);
    setOpeningBalance('');
    setOpeningDrCr('Dr');
    
    setHasPartyDetails(false);
    setPartyGstin('');
    setPartyPan('');
    setPartyPhone('');
    setPartyEmail('');
    setPartyBillingAddress('');
    setPartyShippingAddress('');
    setPartyStateCode('');
    setPartyCreditDays('');
    setPartyCreditLimit('');
    setExistingPartyRecord(null);

    setShowLedgerModal(true);
  };

  // Validation
  const canSave = ledgerName.trim().length > 0 && selectedGroupId.length > 0;

  const handleSaveLedger = async () => {
    if (!canSave || !entityId) return;
    triggerHaptic();

    const balancePaise = parseInputToPaise(openingBalance);

    try {
      if (selectedLedger) {
        // Edit flow
        await database.write(async () => {
          await selectedLedger.update((record) => {
            // Write-protect name & group for system ledgers
            if (!selectedLedger.isSystem) {
              record.name = ledgerName.trim();
              record.groupId = selectedGroupId;
              record.affectsStock = affectsStock;
            }
            record.gstRate = gstRate;
            record.hsnSac = hsnSac.trim();
            record.openingBalanceDrCr = openingDrCr;
            record.openingBalancePaise = balancePaise;
          });

          // Save party details
          if (hasPartyDetails) {
            const limitPaise = parseInputToPaise(partyCreditLimit);
            const days = parseInt(partyCreditDays) || 0;

            if (existingPartyRecord) {
              await existingPartyRecord.update((party: any) => {
                party.name = ledgerName.trim();
                party.gstin = partyGstin.trim();
                party.pan = partyPan.trim();
                party.phone = partyPhone.trim();
                party.email = partyEmail.trim();
                party.billingAddress = partyBillingAddress.trim();
                party.shippingAddress = partyShippingAddress.trim();
                party.stateCode = partyStateCode.trim();
                party.creditDays = days;
                party.creditLimitPaise = limitPaise;
                party.isArchived = false;
              });
            } else {
              await database.get('parties').create((party: any) => {
                party.entityId = entityId;
                party.ledgerId = selectedLedger.id;
                party.name = ledgerName.trim();
                party.gstin = partyGstin.trim();
                party.pan = partyPan.trim();
                party.phone = partyPhone.trim();
                party.email = partyEmail.trim();
                party.billingAddress = partyBillingAddress.trim();
                party.shippingAddress = partyShippingAddress.trim();
                party.stateCode = partyStateCode.trim();
                party.creditDays = days;
                party.creditLimitPaise = limitPaise;
                party.isArchived = false;
              });
            }
          } else if (existingPartyRecord) {
            // If they unchecked it, archive the party details
            await existingPartyRecord.update((party: any) => {
              party.isArchived = true;
            });
          }
        });
      } else {
        // Create flow
        await database.write(async () => {
          const createdLedger = await database.get<Ledger>(TABLE_NAMES.LEDGERS).create((record) => {
            record.entityId = entityId;
            record.groupId = selectedGroupId;
            record.name = ledgerName.trim();
            record.gstRate = gstRate;
            record.hsnSac = hsnSac.trim();
            record.affectsStock = affectsStock;
            record.isSystem = false;
            record.openingBalanceDrCr = openingDrCr;
            record.openingBalancePaise = balancePaise;
            record.isArchived = false;
          });

          // Create party details if toggled
          if (hasPartyDetails) {
            const limitPaise = parseInputToPaise(partyCreditLimit);
            const days = parseInt(partyCreditDays) || 0;

            await database.get('parties').create((party: any) => {
              party.entityId = entityId;
              party.ledgerId = createdLedger.id;
              party.name = ledgerName.trim();
              party.gstin = partyGstin.trim();
              party.pan = partyPan.trim();
              party.phone = partyPhone.trim();
              party.email = partyEmail.trim();
              party.billingAddress = partyBillingAddress.trim();
              party.shippingAddress = partyShippingAddress.trim();
              party.stateCode = partyStateCode.trim();
              party.creditDays = days;
              party.creditLimitPaise = limitPaise;
              party.isArchived = false;
            });
          }
        });
      }

      setShowLedgerModal(false);
      loadData();

      Alert.alert(
        getLabel('Success', 'सफलता'),
        getLabel('Ledger details saved successfully.', 'लेजर विवरण सफलतापूर्वक सहेज लिया गया है।')
      );
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Database write error occurred.');
    }
  };

  const handleArchiveLedger = async (ledger: Ledger) => {
    if (ledger.isSystem) return;
    triggerHaptic();
    const action = ledger.isArchived ? 'Unarchive' : 'Archive';
    const actionLabel = getLabel(action, ledger.isArchived ? 'संग्रह से निकालें' : 'संग्रह करें');

    Alert.alert(
      getLabel(`${action} Ledger`, `${actionLabel} लेजर`),
      getLabel(
        `Are you sure you want to ${action.toLowerCase()} ledger: ${ledger.name}?`,
        `क्या आप सुनिश्चित हैं कि आप लेजर ${ledger.name} को ${actionLabel.toLowerCase()} करना चाहते हैं?`
      ),
      [
        { text: getLabel('Cancel', 'रद्द करें'), style: 'cancel' },
        {
          text: actionLabel,
          style: 'destructive',
          onPress: async () => {
            await database.write(async () => {
              await ledger.update((record) => {
                record.isArchived = !ledger.isArchived;
              });
            });
            setShowLedgerModal(false);
            loadData();
          },
        },
      ]
    );
  };

  // Group & Ledger Tree Construction with Filters
  const renderTree = () => {
    const query = searchQuery.toLowerCase().trim();

    return groups
      .map((group) => {
        const groupLedgers = ledgers.filter((l) => l.groupId === group.id);

        // Filter group and ledgers based on search query
        const groupMatches = group.name.toLowerCase().includes(query);
        const matchedLedgers = groupLedgers.filter(
          (l) =>
            l.name.toLowerCase().includes(query) ||
            l.hsnSac.includes(query) ||
            String(l.gstRate).includes(query)
        );

        // If nothing matches and query exists, hide group
        if (query && !groupMatches && matchedLedgers.length === 0) {
          return null;
        }

        const displayedLedgers = groupMatches ? groupLedgers : matchedLedgers;
        const isCollapsed = collapsedGroups[group.id] || false;
        const natureColors = getNatureStyles(group.nature);

        return (
          <View key={group.id} style={styles.groupContainer}>
            {/* Group Header */}
            <TouchableOpacity
              style={[
                styles.groupHeader,
                { borderLeftColor: natureColors.border, backgroundColor: colors.surface },
              ]}
              onPress={() => toggleGroupCollapse(group.id)}
            >
              <View style={styles.groupHeaderLeft}>
                <Ionicons
                  name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                  size={18}
                  color={colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.groupName}>{group.name}</Text>
              </View>
              <View style={[styles.natureBadge, { backgroundColor: natureColors.bg }]}>
                <View style={[styles.natureDot, { backgroundColor: natureColors.dot }]} />
                <Text style={[styles.natureText, { color: natureColors.text }]}>
                  {group.nature.toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Nested Ledgers */}
            {!isCollapsed && (
              <View style={styles.ledgerList}>
                {displayedLedgers.length === 0 ? (
                  <Text style={styles.emptyLedgerText}>
                    {getLabel('No ledgers in this group', 'इस समूह में कोई लेजर नहीं है')}
                  </Text>
                ) : (
                  displayedLedgers.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.ledgerCard, item.isArchived && styles.ledgerCardArchived]}
                      onPress={() => openEditModal(item)}
                    >
                      <View style={styles.ledgerCardLeft}>
                        <Text style={styles.ledgerNameText}>{item.name}</Text>
                        <View style={styles.ledgerSubRow}>
                          {item.isSystem && (
                            <View style={styles.systemBadge}>
                              <Text style={styles.systemBadgeText}>{getLabel('SYSTEM', 'सिस्टम')}</Text>
                            </View>
                          )}
                          {item.gstRate > 0 && (
                            <View style={styles.gstBadge}>
                              <Text style={styles.gstBadgeText}>{item.gstRate}% GST</Text>
                            </View>
                          )}
                          {item.hsnSac ? (
                            <Text style={styles.hsnText}>HSN: {item.hsnSac}</Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.ledgerCardRight}>
                        {item.openingBalancePaise > 0 ? (
                          <Text
                            style={[
                              styles.balanceText,
                              { color: item.openingBalanceDrCr === 'Dr' ? colors.primary : colors.success },
                            ]}
                          >
                            {formatPaise(item.openingBalancePaise)} {item.openingBalanceDrCr}
                          </Text>
                        ) : (
                          <Text style={styles.balanceZero}>—</Text>
                        )}
                        {item.isArchived && (
                          <Text style={styles.archivedLabelText}>{getLabel('ARCHIVED', 'संग्रहित')}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </View>
        );
      })
      .filter(Boolean);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {entity ? entity.name : getLabel('Loading...', 'लोड हो रहा है...')}
          </Text>
          <Text style={styles.headerSubtitle}>
            {getLabel('Ledger Accounts Tree', 'लेजर खाता ट्री')}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addGroupBtn}
          onPress={() => {
            triggerHaptic();
            router.push(`/entity/${entityId}/groups`);
          }}
        >
          <Ionicons name="folder-open-outline" size={20} color={colors.primary} />
          <Text style={styles.addGroupBtnText}>{getLabel('Groups', 'समूह')}</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={getLabel('Search ledgers, groups, HSN...', 'लेजर, समूह, एचएसएन खोजें...')}
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

      {/* Scrollable Tree View */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderTree()}
      </ScrollView>

      {/* Floating Add Ledger Button */}
      <TouchableOpacity style={styles.floatingAddBtn} onPress={openCreateModal}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
        <Text style={styles.floatingAddBtnText}>{getLabel('Add Ledger', 'लेजर जोड़ें')}</Text>
      </TouchableOpacity>

      {/* Add / Edit Ledger Modal */}
      <Modal
        visible={showLedgerModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLedgerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoidingView}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {selectedLedger
                    ? getLabel(`Edit Ledger: ${selectedLedger.name}`, `लेजर संपादन: ${selectedLedger.name}`)
                    : getLabel('Create Ledger', 'लेजर बनाएं')}
                </Text>
                <TouchableOpacity onPress={() => setShowLedgerModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalScroll}>
                {/* Write-protected fields for System Ledgers */}
                <Text style={styles.fieldLabel}>{getLabel('Ledger Name', 'लेजर का नाम')} *</Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    selectedLedger?.isSystem && styles.modalInputDisabled,
                  ]}
                  placeholder={getLabel('e.g., Office Rent A/c', 'उदा., कार्यालय किराया खाता')}
                  placeholderTextColor={colors.textMuted}
                  value={ledgerName}
                  onChangeText={setLedgerName}
                  editable={!selectedLedger?.isSystem}
                  maxLength={100}
                />

                <Text style={styles.fieldLabel}>{getLabel('Account Group', 'खाता समूह')} *</Text>
                <View
                  style={[
                    styles.pickerContainer,
                    selectedLedger?.isSystem && styles.modalInputDisabled,
                  ]}
                >
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.groupPickerRow}>
                      {groups.map((group) => {
                        const isSelected = group.id === selectedGroupId;
                        return (
                          <TouchableOpacity
                            key={group.id}
                            style={[
                              styles.groupPickerChip,
                              isSelected && styles.groupPickerChipActive,
                              selectedLedger?.isSystem && styles.groupPickerChipDisabled,
                            ]}
                            onPress={() => {
                              if (!selectedLedger?.isSystem) {
                                triggerHaptic();
                                setSelectedGroupId(group.id);
                              }
                            }}
                            disabled={selectedLedger?.isSystem}
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

                {/* Dynamic Visibility Logic */}
                {(() => {
                  const selectedGroupObj = groups.find((g) => g.id === selectedGroupId);
                  const showGstOptions = selectedGroupObj?.nature === 'income' || selectedGroupObj?.nature === 'expense';
                  const isCashBankLedger = ledgerName.toLowerCase().includes('bank') || 
                                           ledgerName.toLowerCase().includes('cash') || 
                                           ledgerName.toLowerCase().includes('wallet') ||
                                           ledgerName.toLowerCase().includes('card');
                  const showPartyOptions = (selectedGroupObj?.name === 'Current Assets' || 
                                           selectedGroupObj?.name === 'Current Liabilities') && !isCashBankLedger;

                  return (
                    <>
                      {showGstOptions && (
                        <>
                          {/* GST Rate Selection */}
                          <Text style={styles.fieldLabel}>{getLabel('GST Rate (%)', 'जीएसटी दर (%)')}</Text>
                          <View style={styles.rateRow}>
                            {GST_RATES.map((rate) => (
                              <TouchableOpacity
                                key={rate}
                                style={[styles.rateBtn, gstRate === rate && styles.rateBtnActive]}
                                onPress={() => {
                                  triggerHaptic();
                                  setGstRate(rate);
                                }}
                              >
                                <Text style={[styles.rateText, gstRate === rate && styles.rateTextActive]}>
                                  {rate}%
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          {/* HSN/SAC Code */}
                          <Text style={styles.fieldLabel}>{getLabel('HSN/SAC Code', 'एचएसएन / एसएसी कोड')}</Text>
                          <TextInput
                            style={styles.modalInput}
                            placeholder="e.g., 9982 or 8471"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="numeric"
                            value={hsnSac}
                            onChangeText={(val) => setHsnSac(val.replace(/[^0-9]/g, ''))}
                            maxLength={8}
                          />

                          {/* Affects Stock Toggle */}
                          <View style={styles.switchRow}>
                            <Text style={styles.switchLabel}>
                              {getLabel('Affects Stock / Inventory', 'स्टॉक / इन्वेंटरी को प्रभावित करता है')}
                            </Text>
                            <Switch
                              value={affectsStock}
                              onValueChange={setAffectsStock}
                              disabled={selectedLedger?.isSystem}
                              trackColor={{ false: colors.border, true: colors.primary }}
                              thumbColor={Platform.OS === 'android' ? colors.background : undefined}
                            />
                          </View>
                        </>
                      )}

                      {showPartyOptions && (
                        <>
                          {/* Configure Party Details Toggle */}
                          <View style={styles.switchRow}>
                            <Text style={styles.switchLabel}>
                              {getLabel('Configure Party Details (GSTIN, Contact, Address)', 'पार्टी विवरण (जीएसटी, संपर्क, पता) कॉन्फ़िगर करें')}
                            </Text>
                            <Switch
                              value={hasPartyDetails}
                              onValueChange={(val) => {
                                triggerHaptic();
                                setHasPartyDetails(val);
                              }}
                              trackColor={{ false: colors.border, true: colors.primary }}
                              thumbColor={Platform.OS === 'android' ? colors.background : undefined}
                            />
                          </View>

                          {hasPartyDetails && (
                            <View style={styles.partyDetailsSection}>
                              <Text style={styles.sectionDividerText}>{getLabel('MAILING & TAX REGISTRATION', 'मेलिंग और कर पंजीकरण')}</Text>

                              <Text style={styles.fieldLabel}>{getLabel('GSTIN (15-Digit GST Number)', 'जीएसटी नंबर')}</Text>
                              <TextInput
                                style={styles.modalInput}
                                placeholder="e.g., 07AAAAA1111A1Z1"
                                placeholderTextColor={colors.textMuted}
                                autoCapitalize="characters"
                                value={partyGstin}
                                onChangeText={handleGstinChange}
                                maxLength={15}
                              />

                              <View style={styles.inputRow}>
                                <View style={{ flex: 1, marginRight: 12 }}>
                                  <Text style={styles.fieldLabel}>{getLabel('PAN Number', 'पैन नंबर')}</Text>
                                  <TextInput
                                    style={styles.modalInput}
                                    placeholder="e.g., ABCDE1234F"
                                    placeholderTextColor={colors.textMuted}
                                    autoCapitalize="characters"
                                    value={partyPan}
                                    onChangeText={setPartyPan}
                                    maxLength={10}
                                  />
                                </View>
                                <View style={{ width: 100 }}>
                                  <Text style={styles.fieldLabel}>{getLabel('State Code', 'राज्य कोड')}</Text>
                                  <TextInput
                                    style={styles.modalInput}
                                    placeholder="e.g., 07"
                                    placeholderTextColor={colors.textMuted}
                                    keyboardType="numeric"
                                    value={partyStateCode}
                                    onChangeText={setPartyStateCode}
                                    maxLength={2}
                                  />
                                </View>
                              </View>

                              <View style={styles.inputRow}>
                                <View style={{ flex: 1, marginRight: 12 }}>
                                  <Text style={styles.fieldLabel}>{getLabel('Phone Number', 'फ़ोन नंबर')}</Text>
                                  <TextInput
                                    style={styles.modalInput}
                                    placeholder="Contact phone"
                                    placeholderTextColor={colors.textMuted}
                                    keyboardType="phone-pad"
                                    value={partyPhone}
                                    onChangeText={setPartyPhone}
                                    maxLength={15}
                                  />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.fieldLabel}>{getLabel('Email Address', 'ईमेल पता')}</Text>
                                  <TextInput
                                    style={styles.modalInput}
                                    placeholder="Contact email"
                                    placeholderTextColor={colors.textMuted}
                                    keyboardType="email-address"
                                    value={partyEmail}
                                    onChangeText={setPartyEmail}
                                    maxLength={50}
                                  />
                                </View>
                              </View>

                              <Text style={styles.fieldLabel}>{getLabel('Billing / Mailing Address', 'बिलिंग / मेलिंग पता')}</Text>
                              <TextInput
                                style={[styles.modalInput, { height: 60, textAlignVertical: 'top', paddingTop: 8 }]}
                                placeholder="Mailing Address for invoices"
                                placeholderTextColor={colors.textMuted}
                                multiline
                                value={partyBillingAddress}
                                onChangeText={setPartyBillingAddress}
                              />

                              <Text style={styles.fieldLabel}>{getLabel('Shipping Address', 'शिपिंग पता')}</Text>
                              <TextInput
                                style={[styles.modalInput, { height: 60, textAlignVertical: 'top', paddingTop: 8 }]}
                                placeholder="Delivery address (leave blank if same)"
                                placeholderTextColor={colors.textMuted}
                                multiline
                                value={partyShippingAddress}
                                onChangeText={setPartyShippingAddress}
                              />

                              <View style={styles.inputRow}>
                                <View style={{ flex: 1, marginRight: 12 }}>
                                  <Text style={styles.fieldLabel}>{getLabel('Credit Period (Days)', 'उधार अवधि (दिन)')}</Text>
                                  <TextInput
                                    style={styles.modalInput}
                                    placeholder="e.g., 30"
                                    placeholderTextColor={colors.textMuted}
                                    keyboardType="numeric"
                                    value={partyCreditDays}
                                    onChangeText={(val) => setPartyCreditDays(val.replace(/[^0-9]/g, ''))}
                                  />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.fieldLabel}>{getLabel('Credit Limit (INR)', 'क्रेडिट सीमा')}</Text>
                                  <TextInput
                                    style={styles.modalInput}
                                    placeholder="e.g., 50000"
                                    placeholderTextColor={colors.textMuted}
                                    keyboardType="numeric"
                                    value={partyCreditLimit}
                                    onChangeText={(val) => setPartyCreditLimit(val.replace(/[^0-9]/g, ''))}
                                  />
                                </View>
                              </View>
                            </View>
                          )}
                        </>
                      )}
                    </>
                  );
                })()}

                {/* Opening Balance */}
                <Text style={styles.fieldLabel}>{getLabel('Opening Balance (INR)', 'प्रारंभिक शेष राशि')}</Text>
                <View style={styles.balanceInputRow}>
                  <TextInput
                    style={[styles.modalInput, { flex: 1, marginRight: 12 }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={openingBalance}
                    onChangeText={(val) => setOpeningBalance(val.replace(/[^0-9.]/g, ''))}
                  />
                  <View style={styles.drCrToggleRow}>
                    {(['Dr', 'Cr'] as DrCr[]).map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.drCrBtn,
                          openingDrCr === type && styles.drCrBtnActive,
                        ]}
                        onPress={() => {
                          triggerHaptic();
                          setOpeningDrCr(type);
                        }}
                      >
                        <Text
                          style={[
                            styles.drCrText,
                            openingDrCr === type && styles.drCrTextActive,
                          ]}
                        >
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Submit Action */}
                <TouchableOpacity
                  style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                  onPress={handleSaveLedger}
                  disabled={!canSave}
                >
                  <Text style={styles.saveBtnText}>{getLabel('Save Ledger A/c', 'लेजर खाता सहेजें')}</Text>
                </TouchableOpacity>

                {/* Statement Button for Edit Flow */}
                {selectedLedger && (
                  <TouchableOpacity
                    style={styles.statementBtn}
                    onPress={() => {
                      setShowLedgerModal(false);
                      router.push(`/ledger/${selectedLedger.id}`);
                    }}
                  >
                    <Ionicons name="receipt-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={styles.statementBtnText}>
                      {getLabel('VIEW STATEMENT', 'लेजर विवरण देखें')}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Archive Button for Edit Flow */}
                {selectedLedger && !selectedLedger.isSystem && (
                  <TouchableOpacity
                    style={[styles.archiveBtn, { borderColor: colors.danger }]}
                    onPress={() => handleArchiveLedger(selectedLedger)}
                  >
                    <Text style={[styles.archiveBtnText, { color: colors.danger }]}>
                      {selectedLedger.isArchived
                        ? getLabel('UNARCHIVE LEDGER', 'संग्रह से निकालें')
                        : getLabel('ARCHIVE LEDGER', 'संग्रह करें')}
                    </Text>
                  </TouchableOpacity>
                )}
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
    fontSize: 18,
    color: colors.text,
  },
  headerSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  addGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  addGroupBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: colors.primary,
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
  groupContainer: {
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderLeftWidth: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 0.5,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.text,
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
  ledgerList: {
    paddingLeft: 12,
    marginTop: 4,
    gap: 4,
  },
  ledgerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ledgerCardArchived: {
    opacity: 0.5,
    backgroundColor: colors.background,
  },
  ledgerCardLeft: {
    flex: 1,
  },
  ledgerNameText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13.5,
    color: colors.text,
  },
  ledgerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  systemBadge: {
    backgroundColor: colors.textMuted + '15',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  systemBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 8,
    color: colors.textSecondary,
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
  hsnText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: colors.textMuted,
  },
  ledgerCardRight: {
    alignItems: 'flex-end',
  },
  balanceText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
  },
  balanceZero: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
  },
  archivedLabelText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 8,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyLedgerText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: colors.textMuted,
    paddingVertical: 8,
    paddingLeft: 8,
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
  modalInputDisabled: {
    backgroundColor: colors.borderLight,
    color: colors.textSecondary,
    opacity: 0.8,
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
  groupPickerChipDisabled: {
    opacity: 0.6,
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
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  rateBtn: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  rateBtnActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  rateText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  rateTextActive: {
    color: colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  switchLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.text,
  },
  balanceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  drCrToggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    width: 100,
    height: 44,
    alignItems: 'center',
  },
  drCrBtn: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  drCrBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  drCrText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12.5,
    color: colors.textMuted,
  },
  drCrTextActive: {
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
  archiveBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: 'transparent',
  },
  archiveBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
  statementBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: colors.primary + '10',
    flexDirection: 'row',
  },
  statementBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.primary,
  },
  partyDetailsSection: {
    backgroundColor: colors.borderLight + '20',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionDividerText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
