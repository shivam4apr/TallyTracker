/**
 * TallyTracker — Voucher Entry Screen
 *
 * Implements the double-entry transactional interface.
 * - Voucher Type selection (Payment, Receipt, Contra, Journal, Sales, Purchase)
 * - Auto-incremental FY serial number generation (PMT/001/2627)
 * - Text-based date entry (Tally-style) formatted as DD/MM/YYYY with validation
 * - Dynamic rows for Debit/Credit transaction lines
 * - Contra restriction: limits ledger picking to Cash & Bank accounts only
 * - Live Double-entry Invariant checker: SUM(Dr) === SUM(Cr)
 * - Single ACID transaction write to database (vouchers, lines, gst components)
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Q } from '@nozbe/watermelondb';

import database, { Entity, Ledger, Voucher, VoucherLine, GstComponent, StockItem } from '@/db';
import { TABLE_NAMES, VOUCHER_TYPES, VOUCHER_TYPE_LABELS, VoucherType, DrCr, SupplyType } from '@/utils/constants';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { VOUCHER_TYPE_COLORS } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useEntityStore } from '@/stores/entityStore';
import { getNextVoucherNumber } from '@/services/voucherNumber';
import { formatDateIndian, parseDateIndian, today } from '@/utils/date';
import { formatPaise, parseInputToPaise } from '@/utils/money';
import VoucherLineRow, { VoucherLineData } from '@/components/VoucherLineRow';

export default function VoucherAddScreen() {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { editVoucherId } = useLocalSearchParams<{ editVoucherId?: string }>();

  const { activeEntityId } = useEntityStore();
  const [activeEntity, setActiveEntity] = useState<Entity | null>(null);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);

  // Form State
  const [voucherType, setVoucherType] = useState<VoucherType>('payment');
  const [dateStr, setDateStr] = useState(formatDateIndian(new Date()));
  const [voucherNumber, setVoucherNumber] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [narration, setNarration] = useState('');
  
  // Start with 2 lines: one Debit (Dr), one Credit (Cr)
  const [lines, setLines] = useState<VoucherLineData[]>([
    {
      id: '1',
      drCr: 'Dr',
      ledgerId: '',
      ledgerName: '',
      amountRupees: '0.00',
      gstRate: 0,
      gstType: '',
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
    },
    {
      id: '2',
      drCr: 'Cr',
      ledgerId: '',
      ledgerName: '',
      amountRupees: '0.00',
      gstRate: 0,
      gstType: '',
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
    },
  ]);

  const isHindi = i18n.language === 'hi';
  const getLabel = (enStr: string, hiStr: string) => (isHindi ? hiStr : enStr);

  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  // 1. Fetch active entity details
  useEffect(() => {
    if (activeEntityId) {
      database
        .get<Entity>(TABLE_NAMES.ENTITIES)
        .find(activeEntityId)
        .then(setActiveEntity)
        .catch(() => setActiveEntity(null));
    }
  }, [activeEntityId]);

  // 2. Generate next voucher number when entity, type, or date changes
  useEffect(() => {
    if (!activeEntityId || !activeEntity || editVoucherId) return;

    // Validate if the input date is in standard DD/MM/YYYY format before updating
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(dateStr)) return;

    try {
      const parsedDate = parseDateIndian(dateStr);
      getNextVoucherNumber(database, activeEntityId, voucherType, parsedDate, activeEntity.financialYearStart)
        .then(setVoucherNumber)
        .catch(() => setVoucherNumber(''));
    } catch {
      // Ignore parsing errors
    }
  }, [activeEntityId, activeEntity, voucherType, dateStr, editVoucherId]);

  // 2b. Load existing voucher details when editing
  useEffect(() => {
    if (!editVoucherId || !activeEntityId) return;

    const loadEditVoucherData = async () => {
      try {
        const v = await database.get<Voucher>(TABLE_NAMES.VOUCHERS).find(editVoucherId);
        setEditingVoucher(v);

        // Pre-populate header fields
        setVoucherType(v.voucherType);
        setDateStr(formatDateIndian(new Date(v.date)));
        setVoucherNumber(v.number);
        setRefNumber(v.refNumber || '');
        setNarration(v.narration || '');

        // Fetch lines and their ledger details
        const linesList = await database
          .get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES)
          .query(Q.where('voucher_id', v.id))
          .fetch();
        linesList.sort((a, b) => a.lineOrder - b.lineOrder);

        const linesData = await Promise.all(
          linesList.map(async (l) => {
            const ledger = await database.get<Ledger>(TABLE_NAMES.LEDGERS).find(l.ledgerId);
            let stockItemName = '';
            if (l.stockItemId) {
              try {
                const stockItem = await database.get<StockItem>(TABLE_NAMES.STOCK_ITEMS).find(l.stockItemId);
                stockItemName = stockItem.name;
              } catch {
                // Ignore
              }
            }
            return {
              id: l.id,
              drCr: l.drCr as DrCr,
              ledgerId: l.ledgerId,
              ledgerName: ledger.name,
              amountRupees: (l.amountPaise / 100).toFixed(2),
              gstRate: ledger.gstRate || 0,
              gstType: (l.gstType as SupplyType | '') || '',
              cgstPaise: l.cgstPaise || 0,
              sgstPaise: l.sgstPaise || 0,
              igstPaise: l.igstPaise || 0,
              stockItemId: l.stockItemId || undefined,
              stockItemName: stockItemName || undefined,
              stockQty: l.stockQty || undefined,
              discountPercent: l.discountPercent || undefined,
            } as VoucherLineData;
          })
        );
        setLines(linesData);
      } catch (err) {
        console.error('Failed to load editing voucher details:', err);
        Alert.alert('Load Failed', 'Failed to load voucher details for editing.');
      }
    };

    loadEditVoucherData();
  }, [editVoucherId, activeEntityId]);

  // 3. Handle Voucher Type specific pre-fills and restrictions:
  useEffect(() => {
    if (voucherType === 'contra') {
      // Clear lines' ledger details to enforce re-selection of cash/bank
      setLines((prev) =>
        prev.map((l) => ({
          ...l,
          ledgerId: '',
          ledgerName: '',
          gstRate: 0,
          gstType: '',
          cgstPaise: 0,
          sgstPaise: 0,
          igstPaise: 0,
        }))
      );
    } else if (voucherType === 'debit_note' && activeEntityId) {
      // Auto-fill the Cr line with 'Purchase Return A/c' if it exists
      database
        .get<Ledger>(TABLE_NAMES.LEDGERS)
        .query(
          Q.where('entity_id', activeEntityId),
          Q.where('name', 'Purchase Return A/c'),
          Q.where('is_archived', false)
        )
        .fetch()
        .then((ledgers) => {
          if (ledgers.length > 0) {
            const purReturn = ledgers[0]!;
            setLines((prev) =>
              prev.map((l) =>
                l.drCr === 'Cr'
                  ? {
                      ...l,
                      ledgerId: purReturn.id,
                      ledgerName: purReturn.name,
                      gstRate: purReturn.gstRate ?? 18,
                    }
                  : l
              )
            );
          }
        })
        .catch((err) => console.error('Failed to pre-fill Purchase Return A/c:', err));
    } else if (voucherType === 'credit_note' && activeEntityId) {
      // Auto-fill the Dr line with 'Sales Return A/c' if it exists
      database
        .get<Ledger>(TABLE_NAMES.LEDGERS)
        .query(
          Q.where('entity_id', activeEntityId),
          Q.where('name', 'Sales Return A/c'),
          Q.where('is_archived', false)
        )
        .fetch()
        .then((ledgers) => {
          if (ledgers.length > 0) {
            const salesReturn = ledgers[0]!;
            setLines((prev) =>
              prev.map((l) =>
                l.drCr === 'Dr'
                  ? {
                      ...l,
                      ledgerId: salesReturn.id,
                      ledgerName: salesReturn.name,
                      gstRate: salesReturn.gstRate ?? 18,
                    }
                  : l
              )
            );
          }
        })
        .catch((err) => console.error('Failed to pre-fill Sales Return A/c:', err));
    }
  }, [voucherType, activeEntityId]);

  const handleUpdateLine = (index: number, updatedFields: Partial<VoucherLineData>) => {
    setLines((prev) => {
      const newLines = [...prev];
      newLines[index] = { ...newLines[index]!, ...updatedFields };
      return newLines;
    });
  };

  const handleAddLine = () => {
    triggerHaptic();
    const newId = String(Date.now() + Math.random());
    // Auto-balance with the opposite type of the last line
    const lastDrCr = lines[lines.length - 1]?.drCr || 'Dr';
    const newDrCr: DrCr = lastDrCr === 'Dr' ? 'Cr' : 'Dr';

    setLines((prev) => [
      ...prev,
      {
        id: newId,
        drCr: newDrCr,
        ledgerId: '',
        ledgerName: '',
        amountRupees: '0.00',
        gstRate: 0,
        gstType: '',
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
      },
    ]);
  };

  const handleDeleteLine = (index: number) => {
    triggerHaptic();
    if (lines.length <= 2) {
      Alert.alert(
        getLabel('Delete Blocked', 'हटाना अवरुद्ध है'),
        getLabel('A voucher must contain at least 2 lines.', 'एक वाउचर में कम से कम 2 लाइनें होनी चाहिए।')
      );
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const getTotals = () => {
    let drTotal = 0;
    let crTotal = 0;
    
    lines.forEach((l) => {
      const paise = parseInputToPaise(l.amountRupees);
      if (l.drCr === 'Dr') {
        drTotal += paise;
      } else {
        crTotal += paise;
      }
    });

    return {
      drTotal,
      crTotal,
      diff: drTotal - crTotal,
      isBalanced: drTotal === crTotal && drTotal > 0,
    };
  };

  const { drTotal, crTotal, diff, isBalanced } = getTotals();

  // Validate form entries
  const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
  const isDateValid = dateRegex.test(dateStr);
  
  const isDateLocked = () => {
    if (!activeEntity || !activeEntity.closedFyYears) return false;
    if (!isDateValid) return false;
    try {
      const parsedDate = parseDateIndian(dateStr);
      const lockedYears = JSON.parse(activeEntity.closedFyYears) as string[];
      const month = parsedDate.getMonth() + 1; // 1-indexed
      const year = parsedDate.getFullYear();
      const startYear = month >= (activeEntity.financialYearStart || 4) ? year : year - 1;
      const endYear = startYear + 1;
      const fyStr = `${startYear}-${String(endYear).slice(-2)}`;
      return lockedYears.includes(fyStr);
    } catch {
      return false;
    }
  };

  const isPeriodLocked = isDateLocked();

  const allLinesFilled = lines.every((l) => l.ledgerId !== '' && parseInputToPaise(l.amountRupees) > 0);
  const isValid = isBalanced && isDateValid && voucherNumber.trim().length > 0 && allLinesFilled && !isPeriodLocked;

  const handleSaveVoucher = async () => {
    if (!isValid || !activeEntityId) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    const parsedDate = parseDateIndian(dateStr);

    try {
      await database.write(async () => {
        const batchOps: any[] = [];
        let voucherRecord: Voucher;

        if (editingVoucher) {
          // 1. Fetch old lines
          const oldLines = await database
            .get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES)
            .query(Q.where('voucher_id', editingVoucher.id))
            .fetch();
          const oldLineIds = oldLines.map((l) => l.id);

          // 2. Fetch old GST components
          const oldGstComps = oldLineIds.length > 0
            ? await database
                .get<GstComponent>(TABLE_NAMES.GST_COMPONENTS)
                .query(Q.where('voucher_line_id', Q.oneOf(oldLineIds)))
                .fetch()
            : [];

          // 3. Prepare deletions (must do old relations first)
          oldGstComps.forEach((comp) => batchOps.push(comp.prepareDestroyPermanently()));
          oldLines.forEach((line) => batchOps.push(line.prepareDestroyPermanently()));

          // 4. Prepare update of Voucher Header
          const voucherUpdate = editingVoucher.prepareUpdate((record) => {
            record.voucherType = voucherType;
            record.number = voucherNumber.trim();
            record.date = parsedDate;
            record.narration = narration.trim();
            record.refNumber = refNumber.trim();
          });
          batchOps.push(voucherUpdate);
          voucherRecord = editingVoucher;
        } else {
          // Create new Voucher Header
          const newVoucher = database.get<Voucher>(TABLE_NAMES.VOUCHERS).prepareCreate((record) => {
            record.entityId = activeEntityId;
            record.voucherType = voucherType;
            record.number = voucherNumber.trim();
            record.date = parsedDate;
            record.narration = narration.trim();
            record.refNumber = refNumber.trim();
            record.isCancelled = false;
          });
          batchOps.push(newVoucher);
          voucherRecord = newVoucher;
        }

        // Compute detailed diff for audit logging
        let auditAction = 'CREATE';
        let changedFieldsJson = '{}';

        if (editingVoucher) {
          auditAction = 'UPDATE';
          const diffObj: Record<string, { old: any; new: any }> = {};
          if (editingVoucher.voucherType !== voucherType) {
            diffObj.voucher_type = { old: editingVoucher.voucherType, new: voucherType };
          }
          if (editingVoucher.number !== voucherNumber.trim()) {
            diffObj.number = { old: editingVoucher.number, new: voucherNumber.trim() };
          }
          if (editingVoucher.date !== parsedDate) {
            diffObj.date = { old: editingVoucher.date, new: parsedDate };
          }
          if (editingVoucher.narration !== narration.trim()) {
            diffObj.narration = { old: editingVoucher.narration, new: narration.trim() };
          }
          if (editingVoucher.refNumber !== refNumber.trim()) {
            diffObj.ref_number = { old: editingVoucher.refNumber, new: refNumber.trim() };
          }
          diffObj.lines = { old: 'Previous lines rebuilt', new: 'New lines populated' };
          changedFieldsJson = JSON.stringify(diffObj);
        } else {
          changedFieldsJson = JSON.stringify({
            voucher_type: { old: null, new: voucherType },
            number: { old: null, new: voucherNumber.trim() },
            date: { old: null, new: parsedDate },
            narration: { old: null, new: narration.trim() },
          });
        }

        const auditLogRecord = database.get('audit_logs').prepareCreate((record: any) => {
          record.entityId = activeEntityId;
          record.tableName = 'vouchers';
          record.recordId = voucherRecord.id;
          record.action = auditAction;
          record.changedFields = changedFieldsJson;
          record.performedBy = 'Authorized CA';
          record.performedAt = Date.now();
        });
        batchOps.push(auditLogRecord);

        // 2. Prepare Voucher lines and GST Components batch operations
        let order = 1;

        for (const line of lines) {
          const paise = parseInputToPaise(line.amountRupees);
          
          // Create line record
          const lineRecord = database.get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES).prepareCreate((record: any) => {
            record.voucherId = voucherRecord.id;
            record.ledgerId = line.ledgerId;
            record.drCr = line.drCr;
            record.amountPaise = paise;
            record.gstType = line.gstType;
            record.cgstPaise = line.cgstPaise;
            record.sgstPaise = line.sgstPaise;
            record.igstPaise = line.igstPaise;
            record.stockItemId = line.stockItemId || null;
            record.stockQty = line.stockQty ? parseFloat(String(line.stockQty)) : null;
            record.discountPercent = line.discountPercent ? parseFloat(String(line.discountPercent)) : null;
            record.lineOrder = order++;
          });
          batchOps.push(lineRecord);

          // Add Gst Components if tax is calculated
          if (line.gstRate > 0 && line.gstType !== '') {
            // Retrieve the ledger's HSN code
            const ledger = await database.get<Ledger>(TABLE_NAMES.LEDGERS).find(line.ledgerId);
            const hsn = ledger.hsnSac || '';

            if (line.gstType === 'intrastate') {
              const halfRate = line.gstRate / 2;
              const cgstComp = database.get<GstComponent>(TABLE_NAMES.GST_COMPONENTS).prepareCreate((record: any) => {
                record.voucherLineId = lineRecord.id;
                record.type = 'cgst';
                record.rate = halfRate;
                record.amountPaise = line.cgstPaise;
                record.hsnSac = hsn;
              });
              const sgstComp = database.get<GstComponent>(TABLE_NAMES.GST_COMPONENTS).prepareCreate((record: any) => {
                record.voucherLineId = lineRecord.id;
                record.type = 'sgst';
                record.rate = halfRate;
                record.amountPaise = line.sgstPaise;
                record.hsnSac = hsn;
              });
              batchOps.push(cgstComp, sgstComp);
            } else if (line.gstType === 'interstate') {
              const igstComp = database.get<GstComponent>(TABLE_NAMES.GST_COMPONENTS).prepareCreate((record: any) => {
                record.voucherLineId = lineRecord.id;
                record.type = 'igst';
                record.rate = line.gstRate;
                record.amountPaise = line.igstPaise;
                record.hsnSac = hsn;
              });
              batchOps.push(igstComp);
            }
          }
        }

        await database.batch(...batchOps);
      });

      // Clear Form state
      setRefNumber('');
      setNarration('');
      setEditingVoucher(null);
      setDateStr(formatDateIndian(new Date()));
      setLines([
        {
          id: '1',
          drCr: 'Dr',
          ledgerId: '',
          ledgerName: '',
          amountRupees: '0.00',
          gstRate: 0,
          gstType: '',
          cgstPaise: 0,
          sgstPaise: 0,
          igstPaise: 0,
        },
        {
          id: '2',
          drCr: 'Cr',
          ledgerId: '',
          ledgerName: '',
          amountRupees: '0.00',
          gstRate: 0,
          gstType: '',
          cgstPaise: 0,
          sgstPaise: 0,
          igstPaise: 0,
        },
      ]);

      Alert.alert(
        getLabel('Voucher Saved', 'वाउचर सहेजा गया'),
        getLabel('Voucher transaction committed successfully.', 'वाउचर लेनदेन सफलतापूर्वक प्रतिबद्ध है।'),
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
    } catch (e: any) {
      Alert.alert('Submission Failed', e.message || 'Database write error occurred.');
    }
  };

  const getVoucherColors = () => {
    const c = VOUCHER_TYPE_COLORS[voucherType];
    return {
      primary: c.primary,
      light: c.light,
      badge: c.badge,
    };
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{getLabel('Voucher Entry', 'वाउचर प्रविष्टि')}</Text>
          {activeEntity && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {activeEntity.name}
            </Text>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {isPeriodLocked && (
            <View style={styles.lockedBanner}>
              <Ionicons name="lock-closed" size={16} color={colors.danger} />
              <Text style={styles.lockedBannerText}>
                {getLabel(
                  'This Financial Year is CLOSED and locked! No entries allowed.',
                  'यह वित्तीय वर्ष बंद और लॉक है! कोई प्रविष्टि की अनुमति नहीं है।'
                )}
              </Text>
            </View>
          )}

          {/* Voucher Type Grid */}
          <Text style={styles.sectionHeader}>{getLabel('Voucher Type', 'वाउचर प्रकार')}</Text>
          <View style={styles.typeGrid}>
            {VOUCHER_TYPES.map((type) => {
              const isActive = type === voucherType;
              const typeColors = VOUCHER_TYPE_COLORS[type];
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeBtn,
                    isActive && { borderColor: typeColors.primary, borderBottomWidth: 3 },
                  ]}
                  onPress={() => { triggerHaptic(); setVoucherType(type); }}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      isActive && { color: typeColors.primary, fontFamily: 'PlusJakartaSans_700Bold' },
                    ]}
                  >
                    {VOUCHER_TYPE_LABELS[type]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Form Header Info */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.inputLabel}>{getLabel('Voucher Number', 'वाउचर नंबर')} *</Text>
                <TextInput
                  style={styles.input}
                  value={voucherNumber}
                  onChangeText={setVoucherNumber}
                  placeholder="PMT/001/2627"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={{ width: 130 }}>
                <Text style={styles.inputLabel}>{getLabel('Date (DD/MM/YYYY)', 'दिनांक')} *</Text>
                <TextInput
                  style={[styles.input, !isDateValid && styles.inputError]}
                  value={dateStr}
                  onChangeText={setDateStr}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={styles.inputLabel}>{getLabel('Ref. No. / Invoice No.', 'संदर्भ / चालान नंबर')}</Text>
              <TextInput
                style={styles.input}
                value={refNumber}
                onChangeText={setRefNumber}
                placeholder="e.g. INV-987"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {/* Transaction Lines */}
          <View style={styles.linesSectionHeader}>
            <Text style={styles.sectionHeader}>{getLabel('Transaction Lines', 'लेनदेन लाइनें')}</Text>
            <TouchableOpacity style={styles.addLineBtn} onPress={handleAddLine}>
              <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.addLineBtnText}>{getLabel('Add Line', 'लाइन जोड़ें')}</Text>
            </TouchableOpacity>
          </View>

          {lines.map((line, index) => (
            <VoucherLineRow
              key={line.id}
              line={line}
              entityId={activeEntityId || ''}
              restrictToCashBank={voucherType === 'contra'}
              onUpdateLine={(fields) => handleUpdateLine(index, fields)}
              onDeleteLine={() => handleDeleteLine(index)}
            />
          ))}

          {/* Narration */}
          <View style={{ marginTop: 12 }}>
            <Text style={styles.inputLabel}>{getLabel('Narration / Remarks', 'कथन / टिप्पणी')}</Text>
            <TextInput
              style={[styles.input, styles.narrationInput]}
              value={narration}
              onChangeText={setNarration}
              placeholder={getLabel('Describe this transaction...', 'इस लेनदेन का वर्णन करें...')}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Invariant Balance Checker Badge */}
          <View style={[styles.balanceCard, isBalanced ? styles.balanceCardBalanced : styles.balanceCardUnbalanced]}>
            <View style={styles.balanceSummaryRow}>
              <View>
                <Text style={styles.balanceLabel}>{getLabel('Total Debits (Dr)', 'कुल नामे (Dr)')}</Text>
                <Text style={styles.balanceAmount}>{formatPaise(drTotal)}</Text>
              </View>
              <View style={styles.balanceDivider} />
              <View>
                <Text style={styles.balanceLabel}>{getLabel('Total Credits (Cr)', 'कुल जमा (Cr)')}</Text>
                <Text style={styles.balanceAmount}>{formatPaise(crTotal)}</Text>
              </View>
            </View>
            {!isBalanced && (
              <Text style={styles.balanceDiffText}>
                {getLabel('Difference: ', 'अंतर: ')}
                {formatPaise(diff)}
              </Text>
            )}
          </View>

          {/* Submit Save Button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              !isValid && styles.submitBtnDisabled,
              isValid && { backgroundColor: getVoucherColors().primary },
            ]}
            onPress={handleSaveVoucher}
            disabled={!isValid}
          >
            <Text style={styles.submitBtnText}>{getLabel('Save Voucher', 'वाउचर सहेजें')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },
  sectionHeader: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    minWidth: '28%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  typeBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
  },
  inputLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.text,
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.danger,
  },
  narrationInput: {
    textAlignVertical: 'top',
    height: 72,
    paddingTop: 10,
  },
  linesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  addLineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  addLineBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: colors.primary,
  },
  balanceCard: {
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
  },
  balanceCardBalanced: {
    backgroundColor: '#10B98110',
    borderColor: '#10B981',
  },
  balanceCardUnbalanced: {
    backgroundColor: '#EF444410',
    borderColor: '#EF4444',
  },
  balanceSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  balanceLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  balanceAmount: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginTop: 4,
  },
  balanceDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  balanceDiffText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: colors.danger,
    textAlign: 'center',
    marginTop: 12,
  },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: {
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  submitBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.danger + '15',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  lockedBannerText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.danger,
  },
});
