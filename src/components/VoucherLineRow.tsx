/**
 * TallyTracker — VoucherLineRow Component
 *
 * Represents a single Debit/Credit entry line in the voucher form.
 * Houses:
 * 1. Dr/Cr toggle.
 * 2. Ledger picker modal launcher.
 * 3. Haptic numeric keypad amount launcher.
 * 4. Dynamic GST supply type selector (Intrastate/Interstate/Exempt).
 * 5. Real-time tax breakdown viewer.
 * 6. Line deletion.
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';

import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import LedgerPicker from './LedgerPicker';
import StockItemPicker from './StockItemPicker';
import AmountKeypad from './ui/AmountKeypad';
import database, { Ledger, StockItem } from '@/db';
import { DrCr, SupplyType, TABLE_NAMES } from '@/utils/constants';
import { computeGST } from '@/services/gst';
import { formatPaise, parseInputToPaise } from '@/utils/money';

export interface VoucherLineData {
  id: string;
  drCr: DrCr;
  ledgerId: string;
  ledgerName: string;
  amountRupees: string; // Rupees text value (e.g. "1250.50")
  gstRate: number; // rate percentage from ledger
  gstType: SupplyType | ''; // 'intrastate' | 'interstate' | 'exempt' | ''
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  stockItemId?: string;
  stockItemName?: string;
  stockQty?: number;
  discountPercent?: number;
}

interface VoucherLineRowProps {
  line: VoucherLineData;
  entityId: string;
  restrictToCashBank?: boolean;
  onUpdateLine: (updatedFields: Partial<VoucherLineData>) => void;
  onDeleteLine: () => void;
}

export default function VoucherLineRow({
  line,
  entityId,
  restrictToCashBank = false,
  onUpdateLine,
  onDeleteLine,
}: VoucherLineRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [showLedgerPicker, setShowLedgerPicker] = useState(false);
  const [showStockPicker, setShowStockPicker] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);

  const [localDiscount, setLocalDiscount] = useState(line.discountPercent !== undefined && line.discountPercent > 0 ? String(line.discountPercent) : '');
  const [localQty, setLocalQty] = useState(line.stockQty !== undefined ? String(line.stockQty) : '');

  useEffect(() => {
    setLocalDiscount(line.discountPercent !== undefined && line.discountPercent > 0 ? String(line.discountPercent) : '');
  }, [line.discountPercent]);

  useEffect(() => {
    setLocalQty(line.stockQty !== undefined ? String(line.stockQty) : '');
  }, [line.stockQty]);

  // Recalculates GST fields when amount, supply type, or discount percentage changes
  const updateGST = (amountStr: string, type: SupplyType | '', discountPercent?: number) => {
    const disc = discountPercent !== undefined ? discountPercent : (line.discountPercent || 0);

    if (!type || line.gstRate === 0) {
      onUpdateLine({
        amountRupees: amountStr,
        gstType: type,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        discountPercent: disc,
      });
      return;
    }

    const paise = parseInputToPaise(amountStr);
    const discountedPaise = Math.round(paise - (paise * disc) / 100);
    const tax = computeGST(discountedPaise, line.gstRate, type);

    onUpdateLine({
      amountRupees: amountStr,
      gstType: type,
      cgstPaise: tax.cgst,
      sgstPaise: tax.sgst,
      igstPaise: tax.igst,
      discountPercent: disc,
    });
  };

  const handleSelectLedger = (ledger: Ledger) => {
    // If ledger has GST rate, default the supply type to intrastate
    const hasGST = ledger.gstRate > 0;
    const defaultGstType: SupplyType | '' = hasGST ? 'intrastate' : '';
    const disc = line.discountPercent || 0;

    const updatedFields: Partial<VoucherLineData> = {
      ledgerId: ledger.id,
      ledgerName: ledger.name,
      gstRate: ledger.gstRate,
      gstType: defaultGstType,
    };

    if (hasGST) {
      const paise = parseInputToPaise(line.amountRupees);
      const discountedPaise = Math.round(paise - (paise * disc) / 100);
      const tax = computeGST(discountedPaise, ledger.gstRate, 'intrastate');
      updatedFields.cgstPaise = tax.cgst;
      updatedFields.sgstPaise = tax.sgst;
      updatedFields.igstPaise = tax.igst;
    } else {
      updatedFields.cgstPaise = 0;
      updatedFields.sgstPaise = 0;
      updatedFields.igstPaise = 0;
    }

    onUpdateLine(updatedFields);
  };

  const handleConfirmAmount = (amountText: string) => {
    updateGST(amountText, line.gstType, line.discountPercent);
  };

  const handleChangeGstType = (type: SupplyType) => {
    updateGST(line.amountRupees, type, line.discountPercent);
  };

  const handleChangeDiscount = (discountText: string) => {
    setLocalDiscount(discountText);
    // Restrict discount to 0 - 100%
    const numeric = parseFloat(discountText) || 0;
    const disc = Math.min(100, Math.max(0, numeric));
    updateGST(line.amountRupees, line.gstType, disc);
  };

  const handleSelectStockItem = (item: StockItem) => {
    onUpdateLine({
      stockItemId: item.id,
      stockItemName: item.name,
      stockQty: line.stockQty || 1, // Default qty to 1 if not set
    });
  };

  const handleRemoveStockItem = () => {
    onUpdateLine({
      stockItemId: undefined,
      stockItemName: undefined,
      stockQty: undefined,
    });
  };

  const handleChangeStockQty = (qtyText: string) => {
    setLocalQty(qtyText);
    const qty = parseFloat(qtyText) || 0;
    onUpdateLine({
      stockQty: Math.max(0, qty),
    });
  };

  const hasTax = line.gstRate > 0 && line.gstType !== '';

  return (
    <View style={styles.card}>
      {/* Top row controls */}
      <View style={styles.row}>
        {/* Dr/Cr Selector */}
        <TouchableOpacity
          style={[
            styles.drCrBtn,
            line.drCr === 'Dr' ? styles.drBtnActive : styles.crBtnActive,
          ]}
          onPress={() => onUpdateLine({ drCr: line.drCr === 'Dr' ? 'Cr' : 'Dr' })}
        >
          <Text style={styles.drCrText}>{line.drCr}</Text>
        </TouchableOpacity>

        {/* Ledger Picker Launcher */}
        <TouchableOpacity
          style={[styles.pickerBtn, !line.ledgerName && styles.pickerPlaceholder]}
          onPress={() => setShowLedgerPicker(true)}
        >
          <Text style={styles.pickerText} numberOfLines={1}>
            {line.ledgerName || 'Select Ledger A/c'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Amount Input Keypad Launcher */}
        <TouchableOpacity
          style={[styles.amountBtn, line.amountRupees === '0.00' && styles.amountPlaceholder]}
          onPress={() => setShowKeypad(true)}
        >
          <Text style={styles.amountText} numberOfLines={1}>
            ₹{line.amountRupees || '0.00'}
          </Text>
        </TouchableOpacity>

        {/* Delete button */}
        <TouchableOpacity style={styles.deleteBtn} onPress={onDeleteLine}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>

      {/* Stock Selection & Discount Row */}
      {line.ledgerId ? (
        <View style={styles.stockDiscountRow}>
          {/* Stock Item Selector */}
          <View style={{ flex: 2, marginRight: 8 }}>
            <Text style={styles.subLabel}>Stock Item (Optional)</Text>
            <View style={styles.stockSelectorContainer}>
              <TouchableOpacity
                style={[styles.subPickerBtn, !line.stockItemName && { opacity: 0.7 }]}
                onPress={() => setShowStockPicker(true)}
              >
                <Text style={styles.subPickerText} numberOfLines={1}>
                  {line.stockItemName || 'Link Item'}
                </Text>
                <Ionicons name="cube-outline" size={12} color={colors.textMuted} />
              </TouchableOpacity>
              {line.stockItemId ? (
                <TouchableOpacity style={styles.removeStockBtn} onPress={handleRemoveStockItem}>
                  <Ionicons name="close-circle" size={14} color={colors.danger} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Qty Input (only visible if stock item is linked) */}
          {line.stockItemId ? (
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.subLabel}>Qty</Text>
              <TextInput
                style={styles.subInput}
                keyboardType="numeric"
                value={localQty}
                onChangeText={handleChangeStockQty}
                placeholder="1"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ) : null}

          {/* Discount Input */}
          <View style={{ flex: 1.2 }}>
            <Text style={styles.subLabel}>Discount (%)</Text>
            <TextInput
              style={styles.subInput}
              keyboardType="numeric"
              value={localDiscount}
              onChangeText={handleChangeDiscount}
              placeholder="0%"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>
      ) : null}

      {/* GST Details section */}
      {line.ledgerId && line.gstRate > 0 ? (
        <View style={styles.gstDetailsContainer}>
          <Text style={styles.gstHeader}>GST Taxes Breakdown ({line.gstRate}%)</Text>
          <View style={styles.gstToggleRow}>
            {(['intrastate', 'interstate', 'exempt'] as SupplyType[]).map((type) => {
              const isActive = line.gstType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.gstTypeBtn, isActive && styles.gstTypeBtnActive]}
                  onPress={() => handleChangeGstType(type)}
                >
                  <Text style={[styles.gstTypeText, isActive && styles.gstTypeTextActive]}>
                    {type.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Computed Tax Summary */}
          {hasTax && (
            <View style={styles.taxSummaryRow}>
              {line.gstType === 'intrastate' ? (
                <>
                  <Text style={styles.taxText}>CGST: {formatPaise(line.cgstPaise)}</Text>
                  <Text style={styles.taxText}>SGST: {formatPaise(line.sgstPaise)}</Text>
                </>
              ) : null}
              {line.gstType === 'interstate' ? (
                <Text style={styles.taxText}>IGST: {formatPaise(line.igstPaise)}</Text>
              ) : null}
              {line.gstType === 'exempt' ? (
                <Text style={[styles.taxText, { color: colors.success }]}>Tax Exempt</Text>
              ) : null}
            </View>
          )}
        </View>
      ) : null}

      {/* MODAL LAUNCHERS */}
      <LedgerPicker
        visible={showLedgerPicker}
        entityId={entityId}
        restrictToCashBank={restrictToCashBank}
        onClose={() => setShowLedgerPicker(false)}
        onSelect={handleSelectLedger}
      />

      <StockItemPicker
        visible={showStockPicker}
        entityId={entityId}
        onClose={() => setShowStockPicker(false)}
        onSelect={handleSelectStockItem}
      />

      <AmountKeypad
        visible={showKeypad}
        initialValue={line.amountRupees}
        title={line.drCr === 'Dr' ? 'Enter Debit Amount' : 'Enter Credit Amount'}
        onClose={() => setShowKeypad(false)}
        onConfirm={handleConfirmAmount}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.01,
    shadowRadius: 2,
    elevation: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drCrBtn: {
    width: 40,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drBtnActive: {
    backgroundColor: '#3B82F615',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  crBtnActive: {
    backgroundColor: '#10B98115',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  drCrText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 12.5,
    color: colors.text,
  },
  pickerBtn: {
    flex: 1.6,
    height: 38,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  pickerPlaceholder: {
    opacity: 0.7,
  },
  pickerText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.text,
    flex: 1,
    marginRight: 4,
  },
  amountBtn: {
    flex: 1,
    height: 38,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
  },
  amountPlaceholder: {
    opacity: 0.7,
  },
  amountText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.text,
  },
  deleteBtn: {
    padding: 6,
    backgroundColor: colors.danger + '10',
    borderRadius: 8,
  },
  gstDetailsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  gstHeader: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  gstToggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
    height: 32,
    alignItems: 'center',
  },
  gstTypeBtn: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  gstTypeBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 0.5,
  },
  gstTypeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: colors.textMuted,
  },
  gstTypeTextActive: {
    color: colors.primary,
  },
  taxSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  taxText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  stockDiscountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  subLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10.5,
    color: colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  stockSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    height: 34,
    paddingHorizontal: 8,
  },
  subPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subPickerText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.text,
    flex: 1,
    marginRight: 4,
  },
  removeStockBtn: {
    padding: 2,
    marginLeft: 4,
  },
  subInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    height: 34,
    paddingHorizontal: 8,
    paddingVertical: 0,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.text,
    textAlign: 'right',
  },
});
