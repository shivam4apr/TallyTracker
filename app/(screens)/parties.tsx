/**
 * TallyTracker — Parties List Screen
 *
 * Implements:
 * 1. Beautiful card list of all Customer & Supplier contact profiles (Parties)
 * 2. Real-time outstanding ledger balance calculation combining opening balances + transaction lines
 * 3. Search by name, phone, email, or GSTIN
 * 4. Nature filter chips: "All Parties", "Customers (Debtors)", "Suppliers (Creditors)"
 * 5. Quick contact links (Call/Email) directly from the party cards
 * 6. Navigation to the Party details statement and ledger card view
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  TextInput,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { Entity, Ledger, AccountGroup, Party, Voucher, VoucherLine } from '@/db';
import { TABLE_NAMES } from '@/utils/constants';
import { Q } from '@nozbe/watermelondb';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useEntityStore } from '@/stores/entityStore';
import { formatPaise } from '@/utils/money';

interface PartyListItem {
  id: string;
  name: string;
  phone: string;
  email: string;
  gstin: string;
  ledgerId: string;
  groupName: string;
  isCustomer: boolean;
  outstandingPaise: number;
  outstandingDrCr: 'Dr' | 'Cr';
}

export default function PartiesScreen() {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const { activeEntityId } = useEntityStore();
  const [entity, setEntity] = useState<Entity | null>(null);
  
  const [parties, setParties] = useState<PartyListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'customers' | 'suppliers'>('all');
  const [isLoading, setIsLoading] = useState(true);

  const isHindi = i18n.language === 'hi';
  const getLabel = (enStr: string, hiStr: string) => (isHindi ? hiStr : enStr);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const loadData = async () => {
    if (!activeEntityId) return;
    setIsLoading(true);

    try {
      // 1. Load active entity
      const ent = await database.get<Entity>(TABLE_NAMES.ENTITIES).find(activeEntityId);
      setEntity(ent);

      // 2. Fetch all parties
      const partyRecords = await database.get<Party>('parties')
        .query(
          Q.where('entity_id', activeEntityId),
          Q.where('is_archived', false)
        )
        .fetch();

      if (partyRecords.length === 0) {
        setParties([]);
        setIsLoading(false);
        return;
      }

      // 3. Load all ledgers & groups to determine nature & calculate balances
      const ledgers = await database.get<Ledger>(TABLE_NAMES.LEDGERS).query().fetch();
      const entityLedgers = ledgers.filter((l) => l.entityId === activeEntityId);
      const ledgerMap = new Map(entityLedgers.map((l) => [l.id, l]));

      const groups = await database.get<AccountGroup>(TABLE_NAMES.ACCOUNT_GROUPS).query().fetch();
      const entityGroups = groups.filter((g) => g.entityId === activeEntityId);
      const groupMap = new Map(entityGroups.map((g) => [g.id, g]));

      // Fetch all active non-cancelled vouchers and lines to compute current balances
      const vouchers = await database.get<Voucher>(TABLE_NAMES.VOUCHERS)
        .query(
          Q.where('entity_id', activeEntityId),
          Q.where('is_cancelled', false)
        )
        .fetch();
      const voucherIds = new Set(vouchers.map((v) => v.id));

      const lines = await database.get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES).query().fetch();
      const activeLines = lines.filter((l) => voucherIds.has(l.voucherId));

      // Calculate outstanding balances for each ledger
      const balanceMap = new Map<string, { balance: number; drCr: 'Dr' | 'Cr' }>();
      entityLedgers.forEach((led) => {
        const opVal = led.openingBalancePaise || 0;
        let runningSum = led.openingBalanceDrCr === 'Dr' ? opVal : -opVal;

        activeLines.forEach((line) => {
          if (line.ledgerId === led.id) {
            if (line.drCr === 'Dr') {
              runningSum += line.amountPaise;
            } else {
              runningSum -= line.amountPaise;
            }
          }
        });

        balanceMap.set(led.id, {
          balance: Math.abs(runningSum),
          drCr: runningSum >= 0 ? 'Dr' : 'Cr',
        });
      });

      // 4. Map party records to custom list items
      const items: PartyListItem[] = partyRecords.map((pty) => {
        const led = ledgerMap.get(pty.ledgerId);
        const group = led ? groupMap.get(led.groupId) : null;
        
        const gName = group ? group.name : 'Sundry Debtor';
        const isCustomer = group ? (group.nature === 'asset' || group.name.toLowerCase().includes('debtor')) : true;

        const balInfo = balanceMap.get(pty.ledgerId) || { balance: 0, drCr: 'Dr' as const };

        return {
          id: pty.id,
          name: pty.name,
          phone: pty.phone || '',
          email: pty.email || '',
          gstin: pty.gstin || '',
          ledgerId: pty.ledgerId,
          groupName: gName,
          isCustomer,
          outstandingPaise: balInfo.balance,
          outstandingDrCr: balInfo.drCr,
        };
      });

      // Sort alphabetically by name
      items.sort((a, b) => a.name.localeCompare(b.name));
      setParties(items);
    } catch (err) {
      console.error('Failed to load parties:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeEntityId]);

  const handleCall = (phone: string) => {
    if (!phone) return;
    triggerHaptic();
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Error', 'Unable to initiate call.');
    });
  };

  const getFilteredParties = () => {
    const query = searchQuery.toLowerCase().trim();
    
    return parties.filter((item) => {
      // 1. Apply nature type filters
      if (selectedFilter === 'customers' && !item.isCustomer) return false;
      if (selectedFilter === 'suppliers' && item.isCustomer) return false;

      // 2. Apply text search query
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        item.phone.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query) ||
        item.gstin.toLowerCase().includes(query)
      );
    });
  };

  const filteredParties = getFilteredParties();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {entity ? entity.name : getLabel('Loading Client...', 'लोड हो रहा है...')}
          </Text>
          <Text style={styles.headerSubtitle}>
            {getLabel('Party Contact Master', 'पार्टी संपर्क मास्टर')}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.ledgerShortcutBtn}
          onPress={() => {
            triggerHaptic();
            router.push(`/entity/${activeEntityId}/ledgers`);
          }}
        >
          <Ionicons name="list" size={18} color={colors.primary} />
          <Text style={styles.ledgerShortcutText}>{getLabel('Ledgers', 'लेजर')}</Text>
        </TouchableOpacity>
      </View>

      {/* Search Box */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={getLabel('Search party, phone, email, GSTIN...', 'पार्टी, फ़ोन, ईमेल, जीएसटी खोजें...')}
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

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        {[
          { key: 'all', label: getLabel('All Parties', 'सभी पार्टियाँ') },
          { key: 'customers', label: getLabel('Customers', 'ग्राहक') },
          { key: 'suppliers', label: getLabel('Suppliers', 'आपूर्तिकर्ता') },
        ].map((chip) => {
          const isActive = selectedFilter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => {
                triggerHaptic();
                setSelectedFilter(chip.key as any);
              }}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Parties List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{getLabel('Loading parties...', 'लोड हो रहा है...')}</Text>
        </View>
      ) : filteredParties.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={48} color={colors.textMuted} style={{ marginBottom: 12 }} />
          <Text style={styles.emptyTitle}>
            {getLabel('No Parties Registered', 'कोई पार्टी पंजीकृत नहीं है')}
          </Text>
          <Text style={styles.emptySubtitle}>
            {getLabel(
              'Go to "Ledgers" screen, create a ledger account, and toggle "Configure Party Details" to register contact profiles!',
              'लेजर स्क्रीन पर जाएं, लेजर खाता बनाएं, और संपर्क विवरण पंजीकृत करने के लिए "पार्टी विवरण कॉन्फ़िगर करें" चालू करें!'
            )}
          </Text>
          <TouchableOpacity 
            style={styles.emptyActionBtn}
            onPress={() => router.push(`/entity/${activeEntityId}/ledgers`)}
          >
            <Text style={styles.emptyActionBtnText}>{getLabel('GO TO LEDGERS', 'लेजर पर जाएं')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredParties}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.partyCard}
              onPress={() => {
                triggerHaptic();
                router.push(`/party/${item.id}`);
              }}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardLeft}>
                  <Text style={styles.partyNameText} numberOfLines={1}>{item.name}</Text>
                  <View style={[styles.badge, item.isCustomer ? styles.customerBadge : styles.supplierBadge]}>
                    <Text style={[styles.badgeText, item.isCustomer ? styles.customerBadgeText : styles.supplierBadgeText]}>
                      {item.isCustomer ? getLabel('CUSTOMER', 'ग्राहक') : getLabel('SUPPLIER', 'आपूर्तिकर्ता')}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.balLabel}>{getLabel('Outstanding', 'बकाया')}</Text>
                  <Text style={[styles.balValue, { color: item.outstandingDrCr === 'Dr' ? colors.primary : colors.success }]}>
                    {formatPaise(item.outstandingPaise)} {item.outstandingDrCr}
                  </Text>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.cardDetailsRow}>
                <View style={styles.cardDetailBox}>
                  {item.gstin ? (
                    <Text style={styles.cardDetailText}>GSTIN: {item.gstin}</Text>
                  ) : (
                    <Text style={[styles.cardDetailText, { color: colors.textMuted }]}>Unregistered Business</Text>
                  )}
                  {item.email ? (
                    <Text style={styles.cardDetailText} numberOfLines={1}>{item.email}</Text>
                  ) : null}
                </View>
                
                {item.phone ? (
                  <TouchableOpacity 
                    style={styles.callBtn}
                    onPress={() => handleCall(item.phone)}
                  >
                    <Ionicons name="call" size={16} color={colors.primary} />
                    <Text style={styles.callBtnText}>{getLabel('Call', 'कॉल')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
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
  ledgerShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  ledgerShortcutText: {
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
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  filterChipActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  filterChipText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: colors.primary,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  partyCard: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
    marginRight: 12,
    gap: 6,
  },
  partyNameText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: colors.text,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 9,
  },
  customerBadge: {
    backgroundColor: colors.primary + '10',
  },
  customerBadgeText: {
    color: colors.primary,
  },
  supplierBadge: {
    backgroundColor: colors.success + '10',
  },
  supplierBadgeText: {
    color: colors.success,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  balLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  balValue: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 14,
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 12,
  },
  cardDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDetailBox: {
    flex: 1,
    gap: 2,
  },
  cardDetailText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textSecondary,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  callBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11.5,
    color: colors.primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 40,
  },
  emptyTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  emptyActionBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 20,
  },
  emptyActionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
