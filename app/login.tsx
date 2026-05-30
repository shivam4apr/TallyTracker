/**
 * TallyTracker — Login Screen
 *
 * Dual-mode login screen:
 * 1. **Unauthenticated Mode**: Welcome screen with app branding and a "Sign Up" CTA
 *    for new users. Shown when the user has no account.
 * 2. **Locked Mode**: Premium PIN & Biometric lock screen for returning users.
 *    - Custom keypad for entering 4-digit PIN
 *    - Biometric unlock support (Face ID / Fingerprint) via expo-local-authentication
 *    - Haptic feedback for button clicks and validation errors
 *    - Prevents brute-forcing with lockout after 10 failed attempts
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  Animated,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useAuthStore } from '@/stores/authStore';
import { useThemedStyles } from '@/theme/useThemedStyles';
import database, { CaUser } from '@/db';
import { APP_CONFIG, TABLE_NAMES } from '@/utils/constants';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const {
    status,
    isLocked,
    unlock,
    signIn,
    failedAttempts,
    recordFailedAttempt,
    resetFailedAttempts,
    isLockedOut,
  } = useAuthStore();

  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [shakeAnim] = useState(new Animated.Value(0));

  // Account check states
  const [hasAccount, setHasAccount] = useState<boolean>(false);
  const [caUserRecord, setCaUserRecord] = useState<CaUser | null>(null);
  const [isLoadingAccount, setIsLoadingAccount] = useState<boolean>(true);

  // Check if there are registered accounts in the database
  useEffect(() => {
    async function checkExistingUser() {
      try {
        const users = await database.get<CaUser>(TABLE_NAMES.CA_USERS).query().fetch();
        if (users.length > 0) {
          setHasAccount(true);
          setCaUserRecord(users[0]);
        } else {
          setHasAccount(false);
          setCaUserRecord(null);
        }
      } catch (err) {
        setHasAccount(false);
        setCaUserRecord(null);
      } finally {
        setIsLoadingAccount(false);
      }
    }
    checkExistingUser();
  }, [status]);

  // Determine if user is a new/unregistered user (no account yet)
  const isNewUser = !hasAccount;

  const shake = useCallback(() => {
    Vibration.vibrate(200);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // Check if biometrics is supported and configured (only for returning users)
  useEffect(() => {
    if (isNewUser) return;
    async function checkBiometrics() {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const hasFingerprint = supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
      const enabledPref = await SecureStore.getItemAsync('biometrics_enabled');
      
      if (hasHardware && isEnrolled && hasFingerprint && enabledPref === 'true') {
        setHasBiometrics(true);
        // Auto-trigger biometric prompt on mount
        handleBiometricAuth();
      }
    }
    checkBiometrics();
  }, [isNewUser]);

  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  const handleKeyPress = (num: string) => {
    if (isLockedOut()) return;
    setErrorMsg('');

    if (pin.length < 4) {
      triggerHaptic();
      const newPin = pin + num;
      setPin(newPin);

      if (newPin.length === 4) {
        verifyPin(newPin);
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      triggerHaptic();
      setPin(pin.slice(0, -1));
    }
  };

  const verifyPin = async (enteredPin: string) => {
    try {
      const savedPin = await SecureStore.getItemAsync('user_pin');
      if (enteredPin === savedPin) {
        triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
        resetFailedAttempts();
        if (caUserRecord) {
          signIn(caUserRecord.id);
        } else {
          unlock();
        }
        // Router navigation will be automatically triggered by navigation guard
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        recordFailedAttempt();
        setPin('');
        setErrorMsg(t('login.error_invalid_pin'));
        shake();
      }
    } catch {
      setErrorMsg('Failed to check credentials');
      setPin('');
    }
  };

  const handleBiometricAuth = async () => {
    if (isLockedOut()) return;
    triggerHaptic();

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate with Fingerprint / Thumb',
        fallbackLabel: t('login.forgot_pin'),
        disableDeviceFallback: true,
      });

      if (result.success) {
        triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
        resetFailedAttempts();
        if (caUserRecord) {
          signIn(caUserRecord.id);
        } else {
          unlock();
        }
      }
    } catch {
      setErrorMsg(t('login.biometric_error'));
    }
  };

  const handleSignUp = () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/onboarding');
  };

  if (isLoadingAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.textMuted }}>
            Loading...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Lockout View ──────────────────────────────────────────────
  if (!isNewUser && isLockedOut()) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Account Locked</Text>
          <Text style={styles.lockoutSub}>
            {t('login.error_lockout')}
          </Text>
          <View style={styles.attemptsBadge}>
            <Text style={styles.attemptsBadgeText}>
              {failedAttempts} / {APP_CONFIG.MAX_PIN_ATTEMPTS} Attempts
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Welcome / Unauthenticated View (New Users) ───────────────
  if (isNewUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {/* App Logo / Branding */}
          <View style={styles.brandSection}>
            <View style={styles.logoContainer}>
              <Ionicons name="calculator" size={48} color={colors.primary} />
            </View>
            <Text style={styles.brandName}>{APP_CONFIG.APP_NAME}</Text>
            <Text style={styles.brandTagline}>
              {t('login.welcome_subtitle')}
            </Text>
          </View>

          {/* Feature Highlights */}
          <View style={styles.featuresCard}>
            <View style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: '#3B82F615' }]}>
                <Ionicons name="document-text-outline" size={20} color="#3B82F6" />
              </View>
              <View style={styles.featureTextContainer}>
                <Text style={styles.featureTitle}>Double-Entry Accounting</Text>
                <Text style={styles.featureDesc}>Tally-standard voucher entry with Dr/Cr enforcement</Text>
              </View>
            </View>

            <View style={styles.featureDivider} />

            <View style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: '#10B98115' }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#10B981" />
              </View>
              <View style={styles.featureTextContainer}>
                <Text style={styles.featureTitle}>GST Compliance Built-In</Text>
                <Text style={styles.featureDesc}>Auto CGST/SGST/IGST computation & reporting</Text>
              </View>
            </View>

            <View style={styles.featureDivider} />

            <View style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: '#8B5CF615' }]}>
                <Ionicons name="phone-portrait-outline" size={20} color="#8B5CF6" />
              </View>
              <View style={styles.featureTextContainer}>
                <Text style={styles.featureTitle}>Offline-First & Secure</Text>
                <Text style={styles.featureDesc}>Works without internet, PIN & biometric protection</Text>
              </View>
            </View>
          </View>

          {/* Sign Up Button */}
          <TouchableOpacity style={styles.signUpBtn} onPress={handleSignUp}>
            <Ionicons name="person-add-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.signUpBtnText}>{t('login.sign_up')}</Text>
          </TouchableOpacity>

          {/* Already have an account note */}
          <Text style={styles.welcomeFooterText}>
            {t('login.no_account')}
            {' '}
            <Text style={styles.signUpLink} onPress={handleSignUp}>
              {t('login.sign_up')}
            </Text>
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── PIN Entry View (Returning Locked Users) ──────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('login.title')}</Text>
          <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
        </View>

        {/* Display Dots */}
        <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
          <View style={[styles.dot, pin.length >= 1 && styles.dotActive]} />
          <View style={[styles.dot, pin.length >= 2 && styles.dotActive]} />
          <View style={[styles.dot, pin.length >= 3 && styles.dotActive]} />
          <View style={[styles.dot, pin.length >= 4 && styles.dotActive]} />
        </Animated.View>

        {/* Error Message */}
        {errorMsg ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : (
          <View style={styles.errorContainerPlaceholder} />
        )}

        {/* Custom Numpad Keypad */}
        <View style={styles.keypad}>
          <View style={styles.keypadRow}>
            {['1', '2', '3'].map((num) => (
              <TouchableOpacity
                key={num}
                style={styles.key}
                onPress={() => handleKeyPress(num)}
              >
                <Text style={styles.keyText}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.keypadRow}>
            {['4', '5', '6'].map((num) => (
              <TouchableOpacity
                key={num}
                style={styles.key}
                onPress={() => handleKeyPress(num)}
              >
                <Text style={styles.keyText}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.keypadRow}>
            {['7', '8', '9'].map((num) => (
              <TouchableOpacity
                key={num}
                style={styles.key}
                onPress={() => handleKeyPress(num)}
              >
                <Text style={styles.keyText}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.keypadRow}>
            {/* Biometric trigger button */}
            {hasBiometrics ? (
              <TouchableOpacity style={styles.keySpecial} onPress={handleBiometricAuth}>
                <Ionicons name="finger-print" size={26} color={colors.primary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.keyEmpty} />
            )}

            <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('0')}>
              <Text style={styles.keyText}>0</Text>
            </TouchableOpacity>

            {/* Backspace/Delete button */}
            <TouchableOpacity style={styles.keySpecial} onPress={handleDelete}>
              <Text style={styles.keySpecialText}>⌫</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  // ─── Brand / Welcome Section ────────────────────────────────
  brandSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: colors.primary + '12',
    borderWidth: 2,
    borderColor: colors.primary + '25',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
  },
  brandName: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 30,
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  brandTagline: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 16,
  },

  // ─── Features Card ──────────────────────────────────────────
  featuresCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    marginBottom: 28,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.text,
    marginBottom: 2,
  },
  featureDesc: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  featureDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 6,
  },

  // ─── Sign Up Button ─────────────────────────────────────────
  signUpBtn: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 20,
  },
  signUpBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 17,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  welcomeFooterText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  signUpLink: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: colors.primary,
  },

  // ─── PIN Header ─────────────────────────────────────────────
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 26,
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
    color: colors.textMuted,
  },
  lockoutSub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  attemptsBadge: {
    backgroundColor: (colors.danger || '#FF3B30') + '20',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  attemptsBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.danger || '#FF3B30',
  },

  // ─── PIN Dots ───────────────────────────────────────────────
  dotsRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  dotActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  // ─── Error ──────────────────────────────────────────────────
  errorContainer: {
    height: 24,
    marginBottom: 32,
  },
  errorContainerPlaceholder: {
    height: 24,
    marginBottom: 32,
  },
  errorText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.danger || '#FF3B30',
  },

  // ─── Numpad ─────────────────────────────────────────────────
  keypad: {
    width: '100%',
    maxWidth: 280,
    gap: 16,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  key: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  keyText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    color: colors.text,
  },
  keySpecial: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keySpecialText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: colors.primary,
  },
  keyEmpty: {
    width: 64,
    height: 64,
  },
});
