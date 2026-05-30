/**
 * TallyTracker — Voucher Detail / Printable Screen
 *
 * Implements:
 * 1. Columnar printable layout (Particulars, HSN, Debit, Credit).
 * 2. Tally-standard "By" (Dr) and "To" (Cr) prefixes for accounts.
 * 3. Company header metadata (GSTIN, PAN, Address).
 * 4. GST components breakdown nested under lines.
 * 5. Cancellation trigger (soft deletes by marking isCancelled = true).
 * 6. Print / PDF Export simulation share launcher.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { Entity, Voucher, VoucherLine, Ledger, GstComponent, Party, StockItem } from '@/db';
import { TABLE_NAMES, VOUCHER_TYPE_LABELS } from '@/utils/constants';
import { Q } from '@nozbe/watermelondb';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { formatPaise } from '@/utils/money';
import { formatDateShort } from '@/utils/date';
import { exportVoucherToPdf } from '@/services/pdf';
import { generateInvoicePdf } from '@/services/invoice';

interface PrintableLine {
  id: string;
  drCr: 'Dr' | 'Cr';
  ledgerName: string;
  hsnSac: string;
  amountPaise: number;
  gstRate: number;
  gstType: string;
  taxes: {
    type: 'cgst' | 'sgst' | 'igst';
    rate: number;
    amountPaise: number;
  }[];
  stockItemId?: string;
  stockItemName?: string;
  stockQty?: number;
  discountPercent?: number;
}

export default function VoucherDetailScreen() {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { id: voucherId } = useLocalSearchParams<{ id: string }>();

  // Records state
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [printableLines, setPrintableLines] = useState<PrintableLine[]>([]);
  const [totalDr, setTotalDr] = useState(0);
  const [totalCr, setTotalCr] = useState(0);

  const isHindi = i18n.language === 'hi';
  const getLabel = (enStr: string, hiStr: string) => (isHindi ? hiStr : enStr);

  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  const loadData = async () => {
    if (!voucherId) return;

    try {
      // 1. Fetch Voucher Header
      const v = await database.get<Voucher>(TABLE_NAMES.VOUCHERS).find(voucherId);
      setVoucher(v);

      // 2. Fetch Entity
      const ent = await database.get<Entity>(TABLE_NAMES.ENTITIES).find(v.entityId);
      setEntity(ent);

      // 3. Fetch VoucherLines (filtered at DB level)
      const filteredLines = await database
        .get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES)
        .query(Q.where('voucher_id', v.id))
        .fetch();
      filteredLines.sort((a, b) => a.lineOrder - b.lineOrder);

      // 4. Pre-fetch all GST components for this voucher's lines (avoids N+1 queries)
      const lineIds = filteredLines.map((l) => l.id);
      const allGstComponents = lineIds.length > 0
        ? await database
            .get<GstComponent>(TABLE_NAMES.GST_COMPONENTS)
            .query(Q.where('voucher_line_id', Q.oneOf(lineIds)))
            .fetch()
        : [];

      // 5. Build printable lines
      let drSum = 0;
      let crSum = 0;
      const formattedLines: PrintableLine[] = [];

      for (const line of filteredLines) {
        // Fetch ledger name
        const ledger = await database.get<Ledger>(TABLE_NAMES.LEDGERS).find(line.ledgerId);
        
        let stockItemName = '';
        if (line.stockItemId) {
          try {
            const stockItem = await database.get<StockItem>(TABLE_NAMES.STOCK_ITEMS).find(line.stockItemId);
            stockItemName = stockItem.name;
          } catch {
            // Ignore
          }
        }

        // Filter pre-fetched GST components for this line
        const lineGst = allGstComponents.filter((g) => g.voucherLineId === line.id);

        const taxes = lineGst.map((g) => ({
          type: g.type as 'cgst' | 'sgst' | 'igst',
          rate: g.rate,
          amountPaise: g.amountPaise,
        }));

        drSum += line.drCr === 'Dr' ? line.amountPaise : 0;
        crSum += line.drCr === 'Cr' ? line.amountPaise : 0;

        formattedLines.push({
          id: line.id,
          drCr: line.drCr,
          ledgerName: ledger.name,
          hsnSac: ledger.hsnSac || '',
          amountPaise: line.amountPaise,
          gstRate: ledger.gstRate,
          gstType: line.gstType,
          taxes,
          stockItemId: line.stockItemId || undefined,
          stockItemName: stockItemName || undefined,
          stockQty: line.stockQty || undefined,
          discountPercent: line.discountPercent || undefined,
        });
      }

      setPrintableLines(formattedLines);
      setTotalDr(drSum);
      setTotalCr(crSum);
    } catch (e) {
      console.error('Failed to load voucher details:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, [voucherId]);

  const isPeriodLocked = () => {
    if (!voucher || !entity || !entity.closedFyYears) return false;
    try {
      const lockedYears = JSON.parse(entity.closedFyYears) as string[];
      const vDate = new Date(voucher.date);
      const month = vDate.getMonth() + 1; // 1-indexed
      const year = vDate.getFullYear();
      const startYear = month >= (entity.financialYearStart || 4) ? year : year - 1;
      const endYear = startYear + 1;
      const fyStr = `${startYear}-${String(endYear).slice(-2)}`;
      return lockedYears.includes(fyStr);
    } catch {
      return false;
    }
  };

  const periodLocked = isPeriodLocked();

  const handleCancelVoucher = () => {
    if (!voucher) return;
    triggerHaptic();

    if (periodLocked) {
      Alert.alert(
        getLabel('Locked Period', 'बंद अवधि'),
        getLabel(
          'This voucher belongs to a closed Financial Year and cannot be modified.',
          'यह वाउचर एक बंद वित्तीय वर्ष का है और इसे संशोधित नहीं किया जा सकता है।'
        )
      );
      return;
    }

    const isCurrentlyCancelled = voucher.isCancelled;
    const actionLabel = isCurrentlyCancelled
      ? getLabel('Restore Voucher', 'वाउचर बहाल करें')
      : getLabel('Cancel Voucher', 'वाउचर रद्द करें');

    Alert.alert(
      actionLabel,
      getLabel(
        `Are you sure you want to ${isCurrentlyCancelled ? 'restore' : 'cancel'} voucher: ${voucher.number}?`,
        `क्या आप सुनिश्चित हैं कि आप वाउचर ${voucher.number} को ${isCurrentlyCancelled ? 'बहाल' : 'रद्द'} करना चाहते हैं?`
      ),
      [
        { text: getLabel('Cancel', 'रद्द करें'), style: 'cancel' },
        {
          text: actionLabel,
          style: isCurrentlyCancelled ? 'default' : 'destructive',
          onPress: async () => {
            await database.write(async () => {
              await voucher.update((record) => {
                record.isCancelled = !voucher.isCancelled;
              });
            });
            // Trigger an audit log for cancellation or restoration
            try {
              await database.write(async () => {
                await database.get('audit_logs').create((record: any) => {
                  record.entityId = voucher.entityId;
                  record.tableName = 'vouchers';
                  record.recordId = voucher.id;
                  record.action = isCurrentlyCancelled ? 'RESTORE' : 'CANCEL';
                  record.changedFields = JSON.stringify({
                    is_cancelled: { old: isCurrentlyCancelled, new: !isCurrentlyCancelled }
                  });
                  record.performedBy = 'Authorized CA';
                  record.performedAt = Date.now();
                });
              });
            } catch (auditErr) {
              console.error('Failed to log audit entry for voucher cancel/restore:', auditErr);
            }
            loadData();
          },
        },
      ]
    );
  };

  const handlePrintVoucher = async () => {
    if (!voucher || !entity) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await exportVoucherToPdf(
        entity,
        voucher,
        printableLines,
        totalDr,
        totalCr
      );
    } catch (e: any) {
      Alert.alert(
        getLabel('Print Failed', 'प्रिंट विफल रहा'),
        e.message || 'Error occurred compiling voucher PDF.'
      );
    }
  };

  const handleGenerateInvoice = async () => {
    if (!voucher || !entity) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Find customer ledger (Dr line in sales voucher)
      const customerLine = printableLines.find((l) => l.drCr === 'Dr');
      if (!customerLine) {
        Alert.alert(
          getLabel('Invoice Generation Failed', 'चालान निर्माण विफल'),
          getLabel('Could not find any customer ledger (Debit) in this sales voucher.', 'इस बिक्री वाउचर में कोई ग्राहक बही (नाम) नहीं मिला।')
        );
        return;
      }

      // Fetch the actual lines from database for HSN & full fields mapping
      const allLines = await database
        .get<VoucherLine>(TABLE_NAMES.VOUCHER_LINES)
        .query(Q.where('voucher_id', voucher.id))
        .fetch();

      // Find if there is a linked Party contact card in database
      const customerLedgerLine = allLines.find((l) => l.drCr === 'Dr');
      let party: Party | null = null;
      if (customerLedgerLine) {
        const partyList = await database
          .get<Party>(TABLE_NAMES.PARTIES)
          .query(
            Q.where('ledger_id', customerLedgerLine.ledgerId),
            Q.where('is_archived', false)
          )
          .fetch();
        if (partyList.length > 0) {
          party = partyList[0];
        }
      }

      await generateInvoicePdf(
        entity,
        voucher,
        allLines,
        printableLines,
        party
      );
    } catch (e: any) {
      Alert.alert(
        getLabel('Invoice Failed', 'चालान विफल रहा'),
        e.message || 'Error occurred compiling invoice PDF.'
      );
    }
  };

  if (!voucher || !entity) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{getLabel('Loading Voucher...', 'लोड हो रहा है...')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>
          {VOUCHER_TYPE_LABELS[voucher.voucherType].toUpperCase()} VOUCHER
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Printable Paper Canvas */}
        <View style={styles.paperCanvas}>
          {/* Cancelled Stamp Overlay */}
          {voucher.isCancelled && (
            <View style={styles.cancelledOverlay}>
              <Text style={styles.cancelledText}>CANCELLED</Text>
            </View>
          )}

          {/* Company Header Info */}
          <View style={styles.companyHeader}>
            <Text style={styles.companyName}>{entity.name}</Text>
            <Text style={styles.companyAddress}>{entity.address || 'Address not registered'}</Text>
            <View style={styles.companyTaxRow}>
              {entity.pan ? <Text style={styles.companyTaxText}>PAN: {entity.pan}</Text> : null}
              {entity.gstin ? <Text style={styles.companyTaxText}>GSTIN: {entity.gstin}</Text> : null}
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Voucher Title and Metadata Row */}
          <View style={styles.voucherMetadataSection}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaLabel}>Voucher Type</Text>
              <Text style={styles.metaValue}>
                {VOUCHER_TYPE_LABELS[voucher.voucherType]}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.metaLabel}>Voucher Number</Text>
              <Text style={[styles.metaValue, { fontFamily: 'PlusJakartaSans_700Bold' }]}>
                {voucher.number}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{formatDateShort(voucher.date)}</Text>
            </View>
          </View>

          {voucher.refNumber ? (
            <View style={styles.refRow}>
              <Text style={styles.metaLabel}>Reference Invoice No: </Text>
              <Text style={styles.refValue}>{voucher.refNumber}</Text>
            </View>
          ) : null}

          {/* Columnar Accounting Table */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.columnHeader, styles.colParticulars]}>Particulars</Text>
            <Text style={[styles.columnHeader, styles.colHsn]}>HSN/SAC</Text>
            <Text style={[styles.columnHeader, styles.colAmount, { textAlign: 'right' }]}>Debit (₹)</Text>
            <Text style={[styles.columnHeader, styles.colAmount, { textAlign: 'right' }]}>Credit (₹)</Text>
          </View>

          {/* Table Body rows */}
          <View style={styles.tableBody}>
            {printableLines.map((line) => {
              const isDr = line.drCr === 'Dr';
              const prefix = isDr ? 'By ' : 'To ';

              return (
                <View key={line.id} style={styles.lineWrapper}>
                  {/* Primary Ledger Row */}
                  <View style={styles.tableRow}>
                    <Text style={[styles.cellText, styles.colParticulars, { fontFamily: 'PlusJakartaSans_600SemiBold' }]}>
                      {prefix}
                      {line.ledgerName}
                    </Text>
                    <Text style={[styles.cellText, styles.colHsn]}>{line.hsnSac || '—'}</Text>
                    <Text style={[styles.cellText, styles.colAmount, styles.amountText]}>
                      {isDr ? formatPaise(line.amountPaise) : ''}
                    </Text>
                    <Text style={[styles.cellText, styles.colAmount, styles.amountText]}>
                      {!isDr ? formatPaise(line.amountPaise) : ''}
                    </Text>
                  </View>

                  {/* Stock Item details */}
                  {line.stockItemName ? (
                    <View style={styles.tableRow}>
                      <Text style={[styles.cellTextMuted, styles.colParticulars]}>
                        {`  • Linked Stock: ${line.stockItemName} (Qty: ${line.stockQty || 1})`}
                      </Text>
                      <Text style={[styles.cellTextMuted, styles.colHsn]}>—</Text>
                      <Text style={[styles.cellTextMuted, styles.colAmount, styles.amountText]} />
                      <Text style={[styles.cellTextMuted, styles.colAmount, styles.amountText]} />
                    </View>
                  ) : null}

                  {/* Discount details */}
                  {line.discountPercent !== undefined && line.discountPercent > 0 ? (
                    <View style={styles.tableRow}>
                      <Text style={[styles.cellTextMuted, styles.colParticulars]}>
                        {`  • Item Discount: ${line.discountPercent}%`}
                      </Text>
                      <Text style={[styles.cellTextMuted, styles.colHsn]}>—</Text>
                      <Text style={[styles.cellTextMuted, styles.colAmount, styles.amountText]} />
                      <Text style={[styles.cellTextMuted, styles.colAmount, styles.amountText]} />
                    </View>
                  ) : null}

                  {/* Nested GST Rows */}
                  {line.taxes.map((tax, taxIdx) => {
                    const taxName = `  ${tax.type.toUpperCase()} @ ${tax.rate}%`;
                    return (
                      <View key={taxIdx} style={styles.tableRow}>
                        <Text style={[styles.cellTextMuted, styles.colParticulars]}>
                          {taxName}
                        </Text>
                        <Text style={[styles.cellTextMuted, styles.colHsn]}>{line.hsnSac || '—'}</Text>
                        <Text style={[styles.cellTextMuted, styles.colAmount, styles.amountText]}>
                          {isDr ? formatPaise(tax.amountPaise) : ''}
                        </Text>
                        <Text style={[styles.cellTextMuted, styles.colAmount, styles.amountText]}>
                          {!isDr ? formatPaise(tax.amountPaise) : ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>

          {/* Table Footer (Totals) */}
          <View style={styles.tableFooterRow}>
            <Text style={[styles.footerText, styles.colParticulars]}>TOTAL</Text>
            <Text style={[styles.footerText, styles.colHsn]}>—</Text>
            <Text style={[styles.footerText, styles.colAmount, styles.amountText]}>
              {formatPaise(totalDr)}
            </Text>
            <Text style={[styles.footerText, styles.colAmount, styles.amountText]}>
              {formatPaise(totalCr)}
            </Text>
          </View>

          {/* Narration Section */}
          <View style={styles.narrationSection}>
            <Text style={styles.narrationLabel}>Narration / Remarks:</Text>
            <Text style={styles.narrationText}>
              {voucher.narration || 'No remarks recorded.'}
            </Text>
          </View>
        </View>

        {periodLocked && (
          <View style={styles.lockedBanner}>
            <Ionicons name="lock-closed" size={16} color={colors.danger} />
            <Text style={styles.lockedBannerText}>
              {getLabel(
                'This Financial Year is CLOSED and locked! No modifications allowed.',
                'यह वित्तीय वर्ष बंद और लॉक है! किसी भी संशोधन की अनुमति नहीं है।'
              )}
            </Text>
          </View>
        )}

        {/* Action Panel Buttons */}
        <View style={styles.actionPanel}>
          {voucher.voucherType === 'sales' && (
            <TouchableOpacity
              style={[styles.printBtn, { backgroundColor: colors.success, marginBottom: 4 }]}
              onPress={handleGenerateInvoice}
            >
              <Ionicons name="document-text-outline" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.printBtnText}>{getLabel('Generate Invoice', 'चालान उत्पन्न करें')}</Text>
            </TouchableOpacity>
          )}

          {!voucher.isCancelled && (
            <TouchableOpacity
              style={[
                styles.editBtn,
                periodLocked && { opacity: 0.5 }
              ]}
              onPress={() => {
                if (periodLocked) {
                  Alert.alert(
                    getLabel('Locked Period', 'बंद अवधि'),
                    getLabel(
                      'This voucher belongs to a closed Financial Year and cannot be edited.',
                      'यह वाउचर एक बंद वित्तीय वर्ष का है और इसे संपादित नहीं किया जा सकता है।'
                    )
                  );
                  return;
                }
                router.push({
                  pathname: '/(tabs)/add',
                  params: { editVoucherId: voucher.id }
                });
              }}
              disabled={periodLocked}
            >
              <Ionicons name="create-outline" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.editBtnText}>{getLabel('Edit Voucher', 'वाउचर संपादित करें')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.printBtn} onPress={handlePrintVoucher}>
            <Ionicons name="print-outline" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.printBtnText}>{getLabel('Print Voucher', 'वाउचर प्रिंट करें')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.cancelBtn,
              voucher.isCancelled ? styles.restoreBtn : styles.cancelBtnNormal,
              periodLocked && { opacity: 0.5 },
            ]}
            onPress={handleCancelVoucher}
            disabled={periodLocked}
          >
            <Ionicons
              name={voucher.isCancelled ? 'refresh-outline' : 'close-circle-outline'}
              size={20}
              color={voucher.isCancelled ? colors.primary : colors.danger}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.cancelBtnText,
                { color: voucher.isCancelled ? colors.primary : colors.danger },
              ]}
            >
              {voucher.isCancelled
                ? getLabel('Restore Voucher', 'वाउचर बहाल करें')
                : getLabel('Cancel Voucher', 'वाउचर रद्द करें')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    padding: 4,
  },
  topBarTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 16,
    color: colors.text,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  paperCanvas: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  cancelledOverlay: {
    position: 'absolute',
    top: '35%',
    left: '10%',
    right: '10%',
    borderWidth: 5,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderRadius: 16,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '-15deg' }],
    backgroundColor: 'transparent',
    zIndex: 10,
    pointerEvents: 'none',
  },
  cancelledText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 48,
    color: 'rgba(239, 68, 68, 0.4)',
    letterSpacing: 2,
  },
  companyHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  companyName: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
  },
  companyAddress: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  companyTaxRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  companyTaxText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  voucherMetadataSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  metaLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.text,
    marginTop: 4,
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  refValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: colors.text,
    paddingBottom: 8,
    marginTop: 16,
  },
  columnHeader: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: colors.text,
  },
  colParticulars: {
    flex: 2.2,
  },
  colHsn: {
    flex: 0.8,
    textAlign: 'center',
  },
  colAmount: {
    flex: 1,
  },
  tableBody: {
    marginVertical: 8,
    gap: 8,
  },
  lineWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  cellText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.text,
  },
  cellTextMuted: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11.5,
    color: colors.textMuted,
  },
  amountText: {
    textAlign: 'right',
  },
  tableFooterRow: {
    flexDirection: 'row',
    borderTopWidth: 2,
    borderTopColor: colors.text,
    borderBottomWidth: 2,
    borderBottomColor: colors.text,
    paddingVertical: 8,
    marginTop: 12,
  },
  footerText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 13,
    color: colors.text,
  },
  narrationSection: {
    marginTop: 20,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  narrationLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  narrationText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 6,
  },
  actionPanel: {
    marginTop: 20,
    gap: 12,
  },
  printBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  printBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  editBtn: {
    backgroundColor: '#3B82F6', // Sleek blue for edit
    borderRadius: 12,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
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
    marginTop: 16,
    gap: 8,
  },
  lockedBannerText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.danger,
  },
  cancelBtn: {
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  cancelBtnNormal: {
    borderColor: '#EF444450',
  },
  restoreBtn: {
    borderColor: colors.primary + '50',
  },
  cancelBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: colors.textMuted,
  },
});
