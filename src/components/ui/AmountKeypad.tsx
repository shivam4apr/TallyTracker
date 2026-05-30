/**
 * TallyTracker — AmountKeypad Component
 *
 * A premium numeric keypad overlay that slides up from the bottom.
 * Provides tactile haptic feedback for each keypress.
 * Handles decimal Rupees entry, converting dynamically to formatted text.
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { APP_CONFIG } from '@/utils/constants';

interface AmountKeypadProps {
  visible: boolean;
  initialValue: string; // e.g. "1250.00" or ""
  title?: string;
  onClose: () => void;
  onConfirm: (value: string) => void; // returns Rupees string (e.g. "1250.50")
}

export default function AmountKeypad({
  visible,
  initialValue,
  title = 'Enter Amount',
  onClose,
  onConfirm,
}: AmountKeypadProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [val, setVal] = useState('');

  useEffect(() => {
    if (visible) {
      // Strip formatting and setup initial state
      const cleaned = initialValue.replace(/[₹,\s]/g, '');
      setVal(cleaned === '0.00' || cleaned === '0' ? '' : cleaned);
    }
  }, [visible, initialValue]);

  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  const handleKeyPress = (char: string) => {
    triggerHaptic();

    if (char === '.') {
      if (val.includes('.')) return; // prevent multiple decimals
      if (val === '') {
        setVal('0.');
        return;
      }
    }

    if (char === '00') {
      if (val === '' || val === '0') return;
      if (val.includes('.')) {
        const parts = val.split('.');
        if (parts[1] && parts[1].length >= 2) return; // restrict to 2 decimals
      }
    }

    // Limit decimal places to 2
    if (val.includes('.')) {
      const parts = val.split('.');
      if (parts[1] && parts[1].length >= 2) return;
    }

    // Limit max digits
    if (val.replace('.', '').length >= 10) return;

    setVal((prev) => prev + char);
  };

  const handleDelete = () => {
    if (val.length > 0) {
      triggerHaptic();
      setVal((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setVal('');
  };

  const handleConfirm = () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    // Standardize to float format (e.g., "120.00")
    const parsed = parseFloat(val || '0');
    onConfirm(parsed.toFixed(2));
    onClose();
  };

  const formatDisplayAmount = () => {
    if (val === '') return '0.00';
    if (val === '0') return '0.00';

    // Format integer and decimal parts
    const parts = val.split('.');
    let integerPart = parts[0] || '0';
    let decimalPart = parts[1] !== undefined ? parts[1] : '';

    // Indian numbering format for integer part
    const parsedInt = parseInt(integerPart, 10);
    if (!isNaN(parsedInt)) {
      // Last 3 digits
      const str = String(parsedInt);
      if (str.length > 3) {
        const lastThree = str.slice(-3);
        const remaining = str.slice(0, -3);
        const grouped = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
        integerPart = `${grouped},${lastThree}`;
      } else {
        integerPart = str;
      }
    }

    // Format display string
    if (val.includes('.')) {
      return `${integerPart}.${decimalPart.slice(0, 2)}`;
    } else {
      return `${integerPart}.00`;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Amount Display */}
          <View style={styles.amountDisplay}>
            <Text style={styles.currencySymbol}>{APP_CONFIG.CURRENCY_SYMBOL}</Text>
            <Text style={styles.amountText} numberOfLines={1}>
              {formatDisplayAmount()}
            </Text>
          </View>

          {/* Numpad Layout */}
          <View style={styles.keypad}>
            <View style={styles.row}>
              {['1', '2', '3'].map((char) => (
                <TouchableOpacity
                  key={char}
                  style={styles.key}
                  onPress={() => handleKeyPress(char)}
                >
                  <Text style={styles.keyText}>{char}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              {['4', '5', '6'].map((char) => (
                <TouchableOpacity
                  key={char}
                  style={styles.key}
                  onPress={() => handleKeyPress(char)}
                >
                  <Text style={styles.keyText}>{char}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              {['7', '8', '9'].map((char) => (
                <TouchableOpacity
                  key={char}
                  style={styles.key}
                  onPress={() => handleKeyPress(char)}
                >
                  <Text style={styles.keyText}>{char}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('.')}>
                <Text style={styles.keyText}>.</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('0')}>
                <Text style={styles.keyText}>0</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('00')}>
                <Text style={styles.keyText}>00</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.row}>
              <TouchableOpacity style={[styles.key, styles.clearKey]} onPress={handleClear}>
                <Text style={styles.clearKeyText}>CLEAR</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.key} onPress={handleDelete}>
                <Ionicons name="backspace-outline" size={24} color={colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.key, styles.okKey]} onPress={handleConfirm}>
                <Text style={styles.okKeyText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
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
    color: colors.textSecondary,
  },
  closeBtn: {
    padding: 4,
  },
  amountDisplay: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  currencySymbol: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 32,
    color: colors.primary,
    marginRight: 4,
  },
  amountText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 38,
    color: colors.text,
  },
  keypad: {
    marginTop: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  key: {
    flex: 1,
    height: 52,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 0.5,
  },
  keyText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: colors.text,
  },
  clearKey: {
    backgroundColor: colors.textMuted + '15',
    borderColor: colors.border,
  },
  clearKeyText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  okKey: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  okKeyText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
