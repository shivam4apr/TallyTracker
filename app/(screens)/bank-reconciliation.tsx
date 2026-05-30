/**
 * TallyTracker — Bank Reconciliation Screen
 *
 * Implements standard Tally-like Bank Book Reconciliation with:
 * 1. Selector modal for Cash & Bank ledgers.
 * 2. Visual KPI cards for Invariant balances.
 * 3. Bulk clear quick action button.
 * 4. NEW: Bank Statement Dual Ingest Engine:
 *    - Upload CSV / Excel exports from bank portals.
 *    - Paste raw statement text copied directly from password-protected PDFs or emails.
 * 5. NEW: Premium Reconciliation Hub Modal:
 *    - Auto-Matched verification tab (with bulk clear matches).
 *    - Unmatched records resolution tab (with manual linking search & quick record voucher creation).
 *    - Reconciled timeline feed.
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
  Modal,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

import database, { Ledger, Voucher, VoucherLine, Entity } from '@/db';
import { TABLE_NAMES, VOUCHER_TYPE_LABELS, VoucherType } from '@/utils/constants';
import { Q } from '@nozbe/watermelondb';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useEntityStore } from '@/stores/entityStore';
import { formatPaise } from '@/utils/money';
import { formatDateShort, parseDateIndian, formatDateIndian } from '@/utils/date';
import LedgerPicker from '@/components/LedgerPicker';

import {
  parseBankStatementCSV,
  parseBankStatementRawText,
  matchStatementWithBooks,
  BankStatementRow,
  MatchResult,
  ReconcileRow,
} from '@/services/bankImport';
import { getNextVoucherNumber } from '@/services/voucherNumber';

export default function BankReconciliationScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const { activeEntityId } = useEntityStore();
  const [activeEntity, setActiveEntity] = useState<Entity | null>(null);

  // Ledger state
  const [selectedLedger, setSelectedLedger] = useState<Ledger | null>(null);
  const [showLedgerPicker, setShowLedgerPicker] = useState(false);
  const [allLedgers, setAllLedgers] = useState<Ledger[]>([]);

  // Reconciliation lines
  const [reconcileRows, setReconcileRows] = useState<ReconcileRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Aggregates
  const [booksBalance, setBooksBalance] = useState(0);
  const [bankBalance, setBankBalance] = useState(0);

  // Statement Ingest Modals & State
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showHubModal, setShowHubModal] = useState(false);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [hubTab, setHubTab] = useState<'matched' | 'unmatched' | 'reconciled'>('matched');

  // Manual Linking & Quick Create State
  const [linkingRow, setLinkingRow] = useState<MatchResult | null>(null);
  const [quickCreateRow, setQuickCreateRow] = useState<MatchResult | null>(null);
  const [quickCreateLedgerId, setQuickCreateLedgerId] = useState('');
  const [quickCreateSearch, setQuickCreateSearch] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const triggerHaptic = (style = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  // 1. Fetch active entity and ledgers
  useEffect(() => {
    if (activeEntityId) {
      database
        .get<Entity>(TABLE_NAMES.ENTITIES)
        .find(activeEntityId)
        .then(setActiveEntity)
        .catch(() => setActiveEntity(null));

      database
        .get<Ledger>(TABLE_NAMES.LEDGERS)
        .query(Q.where('entity_id', activeEntityId))
        .fetch()
        .then(setAllLedgers)
        .catch(() => setAllLedgers([]));
    }
  }, [activeEntityId]);

  // 2. Fetch reconciliation data when selected ledger changes
  const loadData = async () => {
    if (!activeEntityId || !selectedLedger) {
      setReconcileRows([]);
      setBooksBalance(0);
      setBankBalance(0);
      return;
    }

    setIsLoading(true);
    try {
      const activeVouchers = await database
        .get<Voucher>(TABLE_NAMES.VOUCHERS)
        .query(
          Q.where('entity_id', activeEntityId),
          Q.where('is_cancelled', false)
        )
        .fetch();
      const voucherMap = new Map(activeVouchers.map((v) => [v.id, v]));
      const activeVoucherIds = new Set(activeVouchers.map((v) => v.id));

      const lines = await database
        .get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES)
        .query(Q.where('ledger_id', selectedLedger.id))
        .fetch();

      const filteredLines = lines.filter((l) => activeVoucherIds.has(l.voucherId));

      const ledgers = await database.get<Ledger>(TABLE_NAMES.LEDGERS).query().fetch();
      const ledgerMap = new Map(ledgers.map((l) => [l.id, l]));

      const relatedVoucherIds = Array.from(new Set(filteredLines.map((l) => l.voucherId)));
      const otherLines = relatedVoucherIds.length > 0
        ? await database
            .get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES)
            .query(Q.where('voucher_id', Q.oneOf(relatedVoucherIds)))
            .fetch()
        : [];

      let runningBooks = selectedLedger.openingBalancePaise || 0;
      if (selectedLedger.openingBalanceDrCr === 'Cr') runningBooks = -runningBooks;

      let runningBank = runningBooks;

      const rows: ReconcileRow[] = [];

      const sortedLines = filteredLines.sort((a, b) => {
        const vA = voucherMap.get(a.voucherId)!;
        const vB = voucherMap.get(b.voucherId)!;
        return vA.date.getTime() - vB.date.getTime();
      });

      for (const line of sortedLines) {
        const v = voucherMap.get(line.voucherId)!;

        const amt = line.amountPaise;
        if (line.drCr === 'Dr') {
          runningBooks += amt;
          if (line.isReconciled) {
            runningBank += amt;
          }
        } else {
          runningBooks -= amt;
          if (line.isReconciled) {
            runningBank -= amt;
          }
        }

        const vLines = otherLines.filter((l) => l.voucherId === v.id && l.ledgerId !== selectedLedger.id);
        let particulars = 'General / Multiple';
        if (vLines.length === 1) {
          const lRec = ledgerMap.get(vLines[0]!.ledgerId);
          particulars = lRec ? lRec.name : 'Suspense A/c';
        } else if (vLines.length > 1) {
          particulars = 'As per Details';
        }

        rows.push({
          lineId: line.id,
          lineRecord: line,
          voucherId: v.id,
          date: v.date,
          number: v.number,
          voucherType: v.voucherType as VoucherType,
          refNumber: v.refNumber || '',
          narration: v.narration || '',
          drCr: line.drCr as 'Dr' | 'Cr',
          amountPaise: amt,
          particulars,
          isReconciled: line.isReconciled,
          clearanceDateStr: line.bankDate ? formatDateIndian(new Date(line.bankDate)) : '',
        });
      }

      setReconcileRows(rows);
      setBooksBalance(runningBooks);
      setBankBalance(runningBank);
    } catch (e) {
      console.error('Failed to load reconciliation statements:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedLedger]);

  // 3. Clear individual transaction line
  const handleToggleReconciliation = async (row: ReconcileRow) => {
    triggerHaptic();
    const nextReconciled = !row.isReconciled;

    try {
      await database.write(async () => {
        await row.lineRecord.update((record) => {
          record.isReconciled = nextReconciled;
          record.bankDate = nextReconciled ? new Date().getTime() : undefined;
        });
      });
      loadData();
    } catch (e: any) {
      Alert.alert('Reconciliation Error', e.message || 'Failed to update record.');
    }
  };

  // 4. Custom Date Input Save Focus Handler
  const handleSaveClearanceDate = async (row: ReconcileRow, text: string) => {
    if (!text.trim()) {
      try {
        await database.write(async () => {
          await row.lineRecord.update((record) => {
            record.isReconciled = false;
            record.bankDate = undefined;
          });
        });
        loadData();
      } catch {}
      return;
    }

    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(text)) {
      Alert.alert('Invalid Date Format', 'Clearance date must be in DD/MM/YYYY format.');
      loadData();
      return;
    }

    try {
      const parsed = parseDateIndian(text);
      await database.write(async () => {
        await row.lineRecord.update((record) => {
          record.isReconciled = true;
          record.bankDate = parsed.getTime();
        });
      });
      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
      loadData();
    } catch {
      Alert.alert('Invalid Date', 'Could not parse date value.');
      loadData();
    }
  };

  // 5. Bulk clear action
  const handleBulkClearAll = async () => {
    if (reconcileRows.length === 0) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    const now = new Date();
    const defaultDateStr = formatDateIndian(now);
    const timeVal = now.getTime();

    Alert.alert(
      'Bulk Clearance',
      `Clear all outstanding transactions on today's date (${defaultDateStr})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          onPress: async () => {
            try {
              await database.write(async () => {
                const batchUpdates = reconcileRows
                  .filter((r) => !r.isReconciled)
                  .map((r) =>
                    r.lineRecord.prepareUpdate((record) => {
                      record.isReconciled = true;
                      record.bankDate = timeVal;
                    })
                  );
                if (batchUpdates.length > 0) {
                  await database.batch(...batchUpdates);
                }
              });
              loadData();
            } catch (e: any) {
              Alert.alert('Bulk Reconciliation Failed', e.message);
            }
          },
        },
      ]
    );
  };

  // 6. Bank Statement Ingestion Actions
  const handleImportTrigger = () => {
    triggerHaptic();
    Alert.alert(
      'Import Statement Feed',
      'Select bank statement feed format. Excel sheets can be converted to CSV first.',
      [
        {
          text: 'Upload CSV/Excel Export',
          onPress: handleCSVUpload,
        },
        {
          text: 'Paste Statement Text (PDF Fallback)',
          onPress: () => setShowPasteModal(true),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleCSVUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/comma-separated-values', 'text/csv', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      setIsLoading(true);
      const uri = result.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const parsedRows = parseBankStatementCSV(content);
      if (parsedRows.length === 0) {
        Alert.alert(
          'No Valid Records',
          'Could not find standard transaction columns. Please ensure Date, Narration/Description, and Amount values are clearly outlined.'
        );
        setIsLoading(false);
        return;
      }

      // Match against outstanding book rows
      const matchResults = matchStatementWithBooks(parsedRows, reconcileRows.filter((r) => !r.isReconciled));
      setMatches(matchResults);
      setShowHubModal(true);
      setHubTab('matched');
      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      Alert.alert('Import Error', e.message || 'Failed to read CSV.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasteParse = () => {
    if (!pasteText.trim()) {
      Alert.alert('Paste Error', 'Please paste copied statement lines to proceed.');
      return;
    }

    setIsLoading(true);
    const parsedRows = parseBankStatementRawText(pasteText);
    setShowPasteModal(false);
    setPasteText('');

    if (parsedRows.length === 0) {
      Alert.alert(
        'Parsing Failed',
        'Could not identify dates or decimal amounts. Please paste valid structured ledger line rows.'
      );
      setIsLoading(false);
      return;
    }

    const matchResults = matchStatementWithBooks(parsedRows, reconcileRows.filter((r) => !r.isReconciled));
    setMatches(matchResults);
    setShowHubModal(true);
    setHubTab('matched');
    setIsLoading(false);
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
  };

  // 7. Interactive Reconciliation Actions in Hub
  const handleConfirmMatch = async (match: MatchResult) => {
    if (!match.matchedBookRow) return;
    triggerHaptic();

    try {
      await database.write(async () => {
        await match.matchedBookRow!.lineRecord.update((record) => {
          record.isReconciled = true;
          record.bankDate = match.statementRow.date.getTime();
        });
      });

      setMatches((prev) =>
        prev.map((m) =>
          m.statementRow.id === match.statementRow.id
            ? { ...m, matchType: 'reconciled' }
            : m
        )
      );
      loadData();
    } catch (e: any) {
      Alert.alert('Save Failed', e.message);
    }
  };

  const handleConfirmAllMatches = async () => {
    const autoMatches = matches.filter((m) => m.matchType === 'exact' && m.matchedBookRow);
    if (autoMatches.length === 0) return;

    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await database.write(async () => {
        const batchUpdates = autoMatches.map((m) =>
          m.matchedBookRow!.lineRecord.prepareUpdate((record) => {
            record.isReconciled = true;
            record.bankDate = m.statementRow.date.getTime();
          })
        );
        await database.batch(...batchUpdates);
      });

      setMatches((prev) =>
        prev.map((m) =>
          m.matchType === 'exact' && m.matchedBookRow
            ? { ...m, matchType: 'reconciled' }
            : m
        )
      );
      loadData();
      Alert.alert('Success', `Automatically cleared ${autoMatches.length} matching transactions in books!`);
    } catch (e: any) {
      Alert.alert('Bulk Match Reconcile Failed', e.message);
    }
  };

  const handleConfirmManualLink = async (stmtRow: BankStatementRow, bookRow: ReconcileRow) => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await database.write(async () => {
        await bookRow.lineRecord.update((record) => {
          record.isReconciled = true;
          record.bankDate = stmtRow.date.getTime();
        });
      });

      setMatches((prev) =>
        prev.map((m) =>
          m.statementRow.id === stmtRow.id
            ? { ...m, matchType: 'reconciled', matchedBookRow: bookRow }
            : m
        )
      );
      setLinkingRow(null);
      loadData();
    } catch (e: any) {
      Alert.alert('Linking Failed', e.message);
    }
  };

  const handleConfirmQuickCreate = async () => {
    if (!quickCreateRow || !quickCreateLedgerId) {
      Alert.alert('Error', 'Please select an offsetting ledger.');
      return;
    }

    setIsProcessing(true);
    try {
      const stmt = quickCreateRow.statementRow;
      const parsedDate = stmt.date;
      const vchType = stmt.type === 'Cr' ? 'receipt' : 'payment';

      if (!activeEntity) throw new Error('Active entity data unresolved.');

      const vchNum = await getNextVoucherNumber(
        database,
        activeEntityId!,
        vchType,
        parsedDate,
        activeEntity.financialYearStart
      );

      await database.write(async () => {
        const batchOps: any[] = [];

        // 1. Create Voucher Header
        const newVoucher = database.get<Voucher>(TABLE_NAMES.VOUCHERS).prepareCreate((record) => {
          record.entityId = activeEntityId!;
          record.voucherType = vchType;
          record.number = vchNum;
          record.date = parsedDate;
          record.narration = `${stmt.narration} (Bank Stmt Ingest)`.substring(0, 255);
          record.isCancelled = false;
        });
        batchOps.push(newVoucher);

        // 2. Audit Log
        const auditLogRecord = database.get('audit_logs').prepareCreate((record: any) => {
          record.entityId = activeEntityId!;
          record.tableName = 'vouchers';
          record.recordId = newVoucher.id;
          record.action = 'CREATE';
          record.changedFields = JSON.stringify({
            voucher_type: { old: null, new: vchType },
            number: { old: null, new: vchNum },
            date: { old: null, new: parsedDate },
            narration: { old: null, new: stmt.narration },
          });
          record.performedBy = 'Ingest Engine';
          record.performedAt = Date.now();
        });
        batchOps.push(auditLogRecord);

        // 3. Voucher Lines
        const targetAmt = Math.abs(stmt.amountPaise);
        const bankDrCr = stmt.type === 'Cr' ? 'Dr' : 'Cr';
        const bankLine = database.get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES).prepareCreate((record: any) => {
          record.voucherId = newVoucher.id;
          record.ledgerId = selectedLedger!.id;
          record.drCr = bankDrCr;
          record.amountPaise = targetAmt;
          record.isReconciled = true;
          record.bankDate = stmt.date.getTime();
          record.lineOrder = 1;
        });
        batchOps.push(bankLine);

        const offsetDrCr = stmt.type === 'Cr' ? 'Cr' : 'Dr';
        const offsetLine = database.get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES).prepareCreate((record: any) => {
          record.voucherId = newVoucher.id;
          record.ledgerId = quickCreateLedgerId;
          record.drCr = offsetDrCr;
          record.amountPaise = targetAmt;
          record.lineOrder = 2;
        });
        batchOps.push(offsetLine);

        await database.batch(...batchOps);
      });

      setMatches((prev) =>
        prev.map((m) =>
          m.statementRow.id === stmt.id
            ? { ...m, matchType: 'reconciled' }
            : m
        )
      );

      setQuickCreateRow(null);
      setQuickCreateLedgerId('');
      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
      loadData();
      Alert.alert('Recorded', 'Balanced double-entry recorded and auto-reconciled!');
    } catch (e: any) {
      Alert.alert('Failed to Record', e.message || 'Database write error.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter groups in Hub
  const autoMatches = matches.filter((m) => m.matchType === 'exact');
  const unmatchedRows = matches.filter((m) => m.matchType === 'none' || m.matchType === 'partial');
  const clearedRows = matches.filter((m) => m.matchType === 'reconciled');

  const filteredLedgers = allLedgers.filter(
    (l) =>
      l.id !== selectedLedger?.id &&
      l.name.toLowerCase().includes(quickCreateSearch.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bank Reconciliation</Text>
        {reconcileRows.length > 0 ? (
          <TouchableOpacity style={styles.bulkBtn} onPress={handleBulkClearAll}>
            <Ionicons name="flash" size={16} color={colors.primary} />
            <Text style={styles.bulkBtnText}>Clear All</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Bank Ledger Picker Card with Ingest Trigger */}
          <View style={styles.pickerCard}>
            <Text style={styles.pickerLabel}>Select Cash or Bank Book Account</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[styles.pickerBtn, { flex: 1 }]}
                onPress={() => setShowLedgerPicker(true)}
              >
                <Ionicons name="wallet-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.pickerText, !selectedLedger && { color: colors.textMuted }]}>
                  {selectedLedger ? selectedLedger.name : 'Select cash/bank book ledger...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              {selectedLedger && (
                <TouchableOpacity style={styles.importBtn} onPress={handleImportTrigger}>
                  <Ionicons name="cloud-upload-outline" size={18} color="#FFF" />
                  <Text style={styles.importBtnText}>Import</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : selectedLedger ? (
            <>
              {/* Aggregates Summary KPIs */}
              <View style={styles.kpiContainer}>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Balance as per Books</Text>
                  <Text style={[styles.kpiValue, { color: colors.text }]}>
                    {formatPaise(Math.abs(booksBalance))} {booksBalance >= 0 ? 'Dr' : 'Cr'}
                  </Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Balance as per Bank</Text>
                  <Text style={[styles.kpiValue, { color: bankBalance >= 0 ? colors.success : colors.danger }]}>
                    {formatPaise(Math.abs(bankBalance))} {bankBalance >= 0 ? 'Dr' : 'Cr'}
                  </Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Difference</Text>
                  <Text style={[styles.kpiValue, { color: booksBalance === bankBalance ? colors.success : '#D97706' }]}>
                    {formatPaise(Math.abs(booksBalance - bankBalance))}
                  </Text>
                </View>
              </View>

              {/* Transactions list */}
              <View style={styles.tableCard}>
                <Text style={styles.tableTitle}>Outstanding Clearance Transactions</Text>

                {reconcileRows.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="checkmark-circle-outline" size={48} color={colors.success} />
                    <Text style={styles.emptyText}>All transactions reconciled! Zero variance.</Text>
                  </View>
                ) : (
                  reconcileRows.map((row) => (
                    <View key={row.lineId} style={styles.tableRow}>
                      <View style={styles.rowLeft}>
                        <Text style={styles.rowDate}>{formatDateShort(row.date)}</Text>
                        <Text style={styles.rowParticulars} numberOfLines={1}>{row.particulars}</Text>
                        <View style={styles.rowSub}>
                          <Text style={styles.rowVchNo}>{row.number}</Text>
                          <Text style={styles.rowVchType}>• {VOUCHER_TYPE_LABELS[row.voucherType as VoucherType]}</Text>
                        </View>
                      </View>

                      <View style={styles.rowMiddle}>
                        <Text style={[styles.rowAmount, { color: row.drCr === 'Dr' ? colors.primary : colors.danger }]}>
                          {formatPaise(row.amountPaise)} {row.drCr}
                        </Text>
                      </View>

                      <View style={styles.rowRight}>
                        <TouchableOpacity
                          style={[styles.checkbox, row.isReconciled && styles.checkboxChecked]}
                          onPress={() => handleToggleReconciliation(row)}
                        >
                          {row.isReconciled && <Ionicons name="checkmark" size={14} color="#FFF" />}
                        </TouchableOpacity>

                        <TextInput
                          style={[styles.dateInput, row.isReconciled && styles.dateInputReconciled]}
                          placeholder="DD/MM/YYYY"
                          placeholderTextColor={colors.textMuted}
                          value={row.clearanceDateStr}
                          onChangeText={(text) => {
                            const newRows = reconcileRows.map((r) =>
                              r.lineId === row.lineId ? { ...r, clearanceDateStr: text } : r
                            );
                            setReconcileRows(newRows);
                          }}
                          onBlur={() => handleSaveClearanceDate(row, row.clearanceDateStr)}
                          maxLength={10}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  ))
                )}
              </View>
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="card-outline" size={64} color={colors.border} />
              <Text style={styles.emptyStateText}>Select a Bank or Cash ledger to begin reconciliation clearance workflows.</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 1. Paste Statement Text Modal */}
      <Modal visible={showPasteModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalBg}>
          <KeyboardAvoidingView style={styles.pasteModalContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Paste Statement Text</Text>
              <TouchableOpacity onPress={() => setShowPasteModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.pasteInstructions}>
              Open your statement PDF, copy transaction text rows, and paste them below:
            </Text>

            <TextInput
              style={styles.pasteInput}
              multiline
              placeholder="e.g. 28 May 2026   UPI/Rent Payment   15,000.00 Dr"
              placeholderTextColor={colors.textMuted}
              value={pasteText}
              onChangeText={setPasteText}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPasteModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handlePasteParse}>
                <Text style={styles.confirmBtnText}>Parse & Match</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* 2. Statement Reconciliation Hub Modal */}
      <Modal visible={showHubModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalBg}>
          <View style={styles.hubContent}>
            {/* Hub Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Reconciliation Hub</Text>
                <Text style={styles.modalSubtitle}>{selectedLedger?.name} Statement Feed</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowHubModal(false);
                  loadData();
                }}
              >
                <Ionicons name="close-circle-outline" size={28} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Segment Tab Controls */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabBtn, hubTab === 'matched' && styles.tabBtnActive]}
                onPress={() => setHubTab('matched')}
              >
                <Text style={[styles.tabText, hubTab === 'matched' && styles.tabTextActive]}>
                  Auto-Matched ({autoMatches.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, hubTab === 'unmatched' && styles.tabBtnActive]}
                onPress={() => setHubTab('unmatched')}
              >
                <Text style={[styles.tabText, hubTab === 'unmatched' && styles.tabTextActive]}>
                  Unmatched ({unmatchedRows.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, hubTab === 'reconciled' && styles.tabBtnActive]}
                onPress={() => setHubTab('reconciled')}
              >
                <Text style={[styles.tabText, hubTab === 'reconciled' && styles.tabTextActive]}>
                  Reconciled ({clearedRows.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Segment Content Lists */}
            <View style={{ flex: 1, padding: 16 }}>
              {hubTab === 'matched' && (
                <>
                  {autoMatches.length > 0 && (
                    <TouchableOpacity style={styles.bulkClearBtn} onPress={handleConfirmAllMatches}>
                      <Ionicons name="checkmark-done" size={16} color="#FFF" />
                      <Text style={styles.bulkClearBtnText}>Confirm All Auto-Matches ({autoMatches.length})</Text>
                    </TouchableOpacity>
                  )}

                  <FlatList
                    data={autoMatches}
                    keyExtractor={(item) => item.statementRow.id}
                    renderItem={({ item }) => (
                      <View style={styles.matchCard}>
                        <View style={styles.matchSide}>
                          <Text style={styles.matchLabel}>Bank Feed</Text>
                          <Text style={styles.matchDate}>{formatDateShort(item.statementRow.date)}</Text>
                          <Text style={styles.matchDesc} numberOfLines={1}>
                            {item.statementRow.narration}
                          </Text>
                          <Text
                            style={[
                              styles.matchAmt,
                              { color: item.statementRow.type === 'Cr' ? colors.success : colors.danger },
                            ]}
                          >
                            {formatPaise(Math.abs(item.statementRow.amountPaise))}{' '}
                            {item.statementRow.type === 'Cr' ? 'Deposit' : 'Withdrawal'}
                          </Text>
                        </View>

                        <Ionicons name="swap-horizontal" size={20} color={colors.primary} style={{ opacity: 0.7 }} />

                        <View style={styles.matchSide}>
                          <Text style={styles.matchLabel}>Books ledger</Text>
                          <Text style={styles.matchDate}>{formatDateShort(item.matchedBookRow!.date)}</Text>
                          <Text style={styles.matchParticulars} numberOfLines={1}>
                            {item.matchedBookRow!.particulars}
                          </Text>
                          <Text style={styles.matchVchNo}>{item.matchedBookRow!.number}</Text>
                        </View>

                        <TouchableOpacity style={styles.confirmMatchBtn} onPress={() => handleConfirmMatch(item)}>
                          <Ionicons name="checkmark" size={16} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    )}
                    ListEmptyComponent={
                      <View style={styles.emptyContainer}>
                        <Ionicons name="search-outline" size={40} color={colors.textMuted} />
                        <Text style={styles.emptyText}>No exact auto-matches in outstanding vouchers.</Text>
                      </View>
                    }
                  />
                </>
              )}

              {hubTab === 'unmatched' && (
                <FlatList
                  data={unmatchedRows}
                  keyExtractor={(item) => item.statementRow.id}
                  renderItem={({ item }) => (
                    <View style={styles.unmatchedCard}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={styles.matchDate}>{formatDateShort(item.statementRow.date)}</Text>
                          <Text
                            style={[
                              styles.matchAmt,
                              { color: item.statementRow.type === 'Cr' ? colors.success : colors.danger },
                            ]}
                          >
                            {formatPaise(Math.abs(item.statementRow.amountPaise))}{' '}
                            {item.statementRow.type === 'Cr' ? 'Deposit' : 'Withdrawal'}
                          </Text>
                        </View>
                        <Text style={styles.matchDesc}>{item.statementRow.narration}</Text>

                        {/* Unmatched Actions */}
                        <View style={styles.unmatchedActions}>
                          <TouchableOpacity
                            style={styles.unmatchedLinkBtn}
                            onPress={() => {
                              triggerHaptic();
                              setLinkingRow(item);
                            }}
                          >
                            <Ionicons name="link-outline" size={14} color={colors.primary} />
                            <Text style={styles.unmatchedLinkText}>Link to Book</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.unmatchedCreateBtn}
                            onPress={() => {
                              triggerHaptic();
                              setQuickCreateRow(item);
                              setQuickCreateLedgerId('');
                              setQuickCreateSearch('');
                            }}
                          >
                            <Ionicons name="add-circle-outline" size={14} color={colors.success} />
                            <Text style={styles.unmatchedCreateText}>Quick Record</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Ionicons name="checkmark-circle-outline" size={48} color={colors.success} />
                      <Text style={styles.emptyText}>All statement transactions match your books!</Text>
                    </View>
                  }
                />
              )}

              {hubTab === 'reconciled' && (
                <FlatList
                  data={clearedRows}
                  keyExtractor={(item) => item.statementRow.id}
                  renderItem={({ item }) => (
                    <View style={[styles.matchCard, { opacity: 0.8 }]}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={styles.matchDate}>{formatDateShort(item.statementRow.date)}</Text>
                          <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.success }}>
                            Cleared ✓
                          </Text>
                        </View>
                        <Text style={styles.matchDesc}>{item.statementRow.narration}</Text>
                        <Text style={styles.matchAmt}>
                          {formatPaise(Math.abs(item.statementRow.amountPaise))}{' '}
                          {item.statementRow.type === 'Cr' ? 'Deposit' : 'Withdrawal'}
                        </Text>
                        {item.matchedBookRow && (
                          <Text style={styles.matchVchNo}>Linked: {item.matchedBookRow.number}</Text>
                        )}
                      </View>
                    </View>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Ionicons name="time-outline" size={40} color={colors.textMuted} />
                      <Text style={styles.emptyText}>No statements reconciled in this session yet.</Text>
                    </View>
                  }
                />
              )}
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* 3. Manual Link Search Picker Overlay Modal */}
      <Modal visible={linkingRow !== null} animationType="fade" transparent>
        <SafeAreaView style={styles.modalBg}>
          <View style={styles.linkPickerContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Link Book Voucher</Text>
                <Text style={styles.modalSubtitle}>
                  Statement Row: {linkingRow ? formatPaise(Math.abs(linkingRow.statementRow.amountPaise)) : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setLinkingRow(null)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.linkHelpText}>
              Select an outstanding unreconciled books voucher line to associate with this bank entry:
            </Text>

            {reconcileRows.filter((r) => !r.isReconciled).length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No outstanding outstanding book records found.</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1, padding: 16 }}>
                {reconcileRows
                  .filter((r) => !r.isReconciled)
                  // Sort by closer amount match first to ease selection
                  .sort((a, b) => {
                    if (!linkingRow) return 0;
                    const diffA = Math.abs(a.amountPaise - Math.abs(linkingRow.statementRow.amountPaise));
                    const diffB = Math.abs(b.amountPaise - Math.abs(linkingRow.statementRow.amountPaise));
                    return diffA - diffB;
                  })
                  .map((book) => (
                    <TouchableOpacity
                      key={book.lineId}
                      style={styles.linkSelectRow}
                      onPress={() => handleConfirmManualLink(linkingRow!.statementRow, book)}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={styles.matchParticulars}>{book.particulars}</Text>
                          <Text
                            style={[
                              styles.matchAmt,
                              { color: book.drCr === 'Dr' ? colors.primary : colors.danger },
                            ]}
                          >
                            {formatPaise(book.amountPaise)} {book.drCr}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                          <Text style={styles.rowDate}>{formatDateShort(book.date)}</Text>
                          <Text style={styles.rowVchNo}>• {book.number}</Text>
                          <Text style={styles.rowVchType}>• {VOUCHER_TYPE_LABELS[book.voucherType as VoucherType]}</Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* 4. Quick Record Voucher Modal */}
      <Modal visible={quickCreateRow !== null} animationType="slide" transparent>
        <SafeAreaView style={styles.modalBg}>
          <KeyboardAvoidingView style={styles.quickCreateContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Quick Record Transaction</Text>
                <Text style={styles.modalSubtitle}>
                  Creates a double-entry Voucher in database and auto-reconciles.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setQuickCreateRow(null)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {quickCreateRow && (
              <View style={styles.quickCreateMeta}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.quickCreateMetaLabel}>Date: {formatDateShort(quickCreateRow.statementRow.date)}</Text>
                  <Text style={styles.quickCreateMetaAmt}>
                    Value: {formatPaise(Math.abs(quickCreateRow.statementRow.amountPaise))}
                  </Text>
                </View>
                <Text style={styles.quickCreateMetaNarration}>Ref: {quickCreateRow.statementRow.narration}</Text>
                <Text style={styles.quickCreateMetaType}>
                  Voucher Type: {quickCreateRow.statementRow.type === 'Cr' ? 'Receipt (Money In)' : 'Payment (Money Out)'}
                </Text>
              </View>
            )}

            {/* Ledger Select Search */}
            <View style={{ flex: 1, padding: 16 }}>
              <Text style={styles.quickCreateLabel}>Select Offset (Contra) Ledger</Text>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search ledgers (e.g. Bank Charges, Rent)..."
                  placeholderTextColor={colors.textMuted}
                  value={quickCreateSearch}
                  onChangeText={setQuickCreateSearch}
                />
              </View>

              <FlatList
                data={filteredLedgers}
                keyExtractor={(l) => l.id}
                style={{ flex: 1, marginTop: 8 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.ledgerSelectOption,
                      quickCreateLedgerId === item.id && styles.ledgerSelectOptionActive,
                    ]}
                    onPress={() => setQuickCreateLedgerId(item.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.ledgerSelectName,
                          quickCreateLedgerId === item.id && { color: '#FFF' },
                        ]}
                      >
                        {item.name}
                      </Text>
                      <Text style={[styles.ledgerSelectGroup, quickCreateLedgerId === item.id && { color: 'rgba(255,255,255,0.7)' }]}>
                        {'Ledger Account'}
                      </Text>
                    </View>
                    {quickCreateLedgerId === item.id && <Ionicons name="checkmark-circle" size={20} color="#FFF" />}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No matching ledgers found in this entity.</Text>
                  </View>
                }
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setQuickCreateRow(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: colors.success }]}
                onPress={handleConfirmQuickCreate}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>Record & Reconcile</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
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
  headerTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: colors.text,
  },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '12',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  bulkBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11.5,
    color: colors.primary,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  pickerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  pickerLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  pickerText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13.5,
    color: colors.text,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 10,
    gap: 6,
  },
  importBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#FFF',
  },
  kpiContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  kpiLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
  kpiValue: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  tableCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  tableTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13.5,
    color: colors.text,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border,
    paddingBottom: 10,
    marginBottom: 8,
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13.5,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
    gap: 16,
  },
  emptyStateText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13.5,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    alignItems: 'center',
  },
  rowLeft: {
    flex: 1.6,
    gap: 2,
  },
  rowDate: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: colors.textMuted,
  },
  rowParticulars: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13.5,
    color: colors.text,
  },
  rowSub: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  rowVchNo: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: colors.primary,
  },
  rowVchType: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10.5,
    color: colors.textMuted,
  },
  rowMiddle: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  rowAmount: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
  rowRight: {
    width: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  dateInput: {
    flex: 1,
    height: 32,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    fontSize: 11.5,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: colors.text,
    textAlign: 'center',
    padding: 0,
  },
  dateInputReconciled: {
    borderColor: colors.success + '40',
    backgroundColor: colors.success + '05',
    color: colors.success,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },

  // Premium Modal Styles
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pasteModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: 12,
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: colors.text,
  },
  modalSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  pasteInstructions: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    color: colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  pasteInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    height: 180,
    fontFamily: 'Courier',
    fontSize: 12,
    color: colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.textSecondary,
  },
  confirmBtn: {
    flex: 1.5,
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#FFF',
  },

  // Reconciliation Hub Styles
  hubContent: {
    backgroundColor: colors.background,
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingHorizontal: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textMuted,
  },
  tabTextActive: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    color: colors.primary,
  },
  bulkClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    height: 40,
    borderRadius: 10,
    gap: 8,
    marginBottom: 16,
  },
  bulkClearBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#FFF',
  },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  matchSide: {
    flex: 1,
    gap: 2,
  },
  matchLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 9.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  matchDate: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10.5,
    color: colors.textMuted,
  },
  matchDesc: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
    color: colors.text,
  },
  matchParticulars: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
    color: colors.text,
  },
  matchVchNo: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: colors.primary,
  },
  matchAmt: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 12.5,
  },
  confirmMatchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Unmatched Styles
  unmatchedCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  unmatchedActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 10,
  },
  unmatchedLinkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
    height: 34,
    borderRadius: 8,
    gap: 6,
  },
  unmatchedLinkText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11.5,
    color: colors.primary,
  },
  unmatchedCreateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success + '12',
    height: 34,
    borderRadius: 8,
    gap: 6,
  },
  unmatchedCreateText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11.5,
    color: colors.success,
  },

  // Manual Link Selector overlay
  linkPickerContent: {
    backgroundColor: colors.background,
    height: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  linkHelpText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    color: colors.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  linkSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },

  // Quick Create Modal Layout
  quickCreateContent: {
    backgroundColor: colors.surface,
    height: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  quickCreateMeta: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    margin: 16,
    padding: 12,
    gap: 4,
  },
  quickCreateMetaLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: colors.textMuted,
  },
  quickCreateMetaAmt: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 13,
    color: colors.primary,
  },
  quickCreateMetaNarration: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
    color: colors.text,
  },
  quickCreateMetaType: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11.5,
    color: colors.textMuted,
  },
  quickCreateLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.text,
    marginBottom: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.text,
  },
  ledgerSelectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  ledgerSelectOptionActive: {
    backgroundColor: colors.primary,
  },
  ledgerSelectName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13.5,
    color: colors.text,
  },
  ledgerSelectGroup: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10.5,
    color: colors.textMuted,
  },
});
