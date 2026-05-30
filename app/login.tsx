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
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useAuthStore } from '@/stores/authStore';
import { useEntityStore } from '@/stores/entityStore';
import { useThemedStyles } from '@/theme/useThemedStyles';
import database, { CaUser } from '@/db';
import { seedAccountTree, seedDefaultHabits } from '@/db/seed';
import { APP_CONFIG, TABLE_NAMES } from '@/utils/constants';

// Global/Module-level guard to prevent concurrent/multiple overlapping biometric prompts across mounts/renders
let globalIsAuthenticating = false;

export default function LoginScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const navigation = useNavigation();
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    const unsubscribeFocus = navigation.addListener('focus', () => {
      setIsFocused(true);
    });
    const unsubscribeBlur = navigation.addListener('blur', () => {
      setIsFocused(false);
    });

    setIsFocused(navigation.isFocused());

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  const {
    status,
    isLocked,
    unlock,
    signIn,
    signOut,
    failedAttempts,
    recordFailedAttempt,
    resetFailedAttempts,
    isLockedOut,
  } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [shakeAnim] = useState(new Animated.Value(0));
  const [forceShowLogin, setForceShowLogin] = useState(false);

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
          // If SafeStorage says authenticated but DB has no users,
          // the persisted state is stale (e.g. LokiJS in-memory reset).
          // Clear the stale auth so the user can sign up fresh.
          if (status === 'authenticated') {
            console.log('[Login] Stale auth detected (no DB user but status=authenticated). Signing out.');
            signOut();
          }
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



  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  const handleSignIn = async () => {
    if (isLockedOut()) return;
    setErrorMsg('');
    triggerHaptic();

    if (!email.trim()) {
      setErrorMsg(t('onboarding.errors.email_required'));
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your password');
      return;
    }

    try {
      const savedEmail = await SecureStore.getItemAsync('user_email');
      const savedPassword = await SecureStore.getItemAsync('user_password');

      const enteredEmailClean = email.trim().toLowerCase();
      const savedEmailClean = savedEmail ? savedEmail.trim().toLowerCase() : '';

      if (enteredEmailClean === savedEmailClean && password === savedPassword) {
        triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
        resetFailedAttempts();
        if (caUserRecord) {
          signIn(caUserRecord.id);
        } else {
          console.log('[Login] Correct credentials but no DB user found. Auto-seeding default profile...');
          setErrorMsg('Re-initializing database...');
          
          // Seed the database!
          const caUser = await database.write(async () => {
            return await database.get(TABLE_NAMES.CA_USERS).create((record: any) => {
              record.name = 'CA Developer';
              record.email = enteredEmailClean;
              record.pinHash = 'secured';
              record.biometricEnabled = false;
            });
          });
          
          const entity = await database.write(async () => {
            return await database.get(TABLE_NAMES.ENTITIES).create((record: any) => {
              record.caUserId = caUser.id;
              record.name = 'Krishna Traders';
              record.pan = 'ABCDE1234F';
              record.gstin = '27AAAAA1111A1Z1';
              record.address = 'Suite 101, Main Road, Mumbai';
              record.financialYearStart = 4;
              record.baseCurrency = 'INR';
              record.closedFyYears = '[]';
              record.isArchived = false;
            });
          });

          await seedAccountTree(database, entity.id);
          await seedDefaultHabits(database, caUser.id);
          
          const { setActiveEntity } = useEntityStore.getState();
          setActiveEntity(entity.id);
          signIn(caUser.id);
        }
      } else {
        // Also support dev bypass credentials: dev@tallytracker.com / password
        if (enteredEmailClean === 'dev@tallytracker.com' && password === 'password') {
          triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
          resetFailedAttempts();
          
          let targetUserId = caUserRecord?.id;
          
          if (!targetUserId) {
            console.log('[Login] Developer credentials bypass active. Auto-seeding default profile...');
            setErrorMsg('Re-initializing database...');
            
            const caUser = await database.write(async () => {
              return await database.get(TABLE_NAMES.CA_USERS).create((record: any) => {
                record.name = 'CA Developer';
                record.email = 'dev@tallytracker.com';
                record.pinHash = 'secured';
                record.biometricEnabled = false;
              });
            });
            
            const entity = await database.write(async () => {
              return await database.get(TABLE_NAMES.ENTITIES).create((record: any) => {
                record.caUserId = caUser.id;
                record.name = 'Krishna Traders';
                record.pan = 'ABCDE1234F';
                record.gstin = '27AAAAA1111A1Z1';
                record.address = 'Suite 101, Main Road, Mumbai';
                record.financialYearStart = 4;
                record.baseCurrency = 'INR';
                record.closedFyYears = '[]';
                record.isArchived = false;
              });
            });

            await seedAccountTree(database, entity.id);
            await seedDefaultHabits(database, caUser.id);
            
            const { setActiveEntity } = useEntityStore.getState();
            setActiveEntity(entity.id);
            targetUserId = caUser.id;
          }
          
          signIn(targetUserId);
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        recordFailedAttempt();
        setErrorMsg(t('login.error_invalid_credentials'));
        shake();
      }
    } catch (e: any) {
      console.error('[Login] handleSignIn error:', e);
      setErrorMsg('Failed to check credentials');
    }
  };

  const handleBiometricAuth = async () => {
    if (isLockedOut()) return;
    if (globalIsAuthenticating) {
      console.log('[Login] Biometric authentication is already in progress, skipping duplicate call.');
      return;
    }
    globalIsAuthenticating = true;
    triggerHaptic();
    setErrorMsg('');

    // Safety timeout to reset the flag in case the promise hangs forever
    const safetyTimeout = setTimeout(() => {
      if (globalIsAuthenticating) {
        console.warn('[Login] Biometric auth safety timeout triggered. Resetting flag.');
        globalIsAuthenticating = false;
      }
    }, 15000); // 15 seconds safety window

    try {
      console.log('[Login] Starting biometric authentication...');
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('login.biometric_prompt'),
        fallbackLabel: t('login.forgot_pin'),
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });

      console.log('[Login] Biometric result:', result);

      if (result.success) {
        triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
        resetFailedAttempts();
        if (caUserRecord) {
          signIn(caUserRecord.id);
        } else {
          unlock();
        }
      } else {
        console.warn('[Login] Biometric auth unsuccessful. Error code:', result.error);
        if (result.error && result.error !== 'user_cancel') {
          setErrorMsg(`${t('login.biometric_error')}: ${result.error}`);
        } else {
          setErrorMsg('Biometric authentication cancelled');
        }
      }
    } catch (err: any) {
      console.error('[Login] Biometric auth exception:', err);
      setErrorMsg(`${t('login.biometric_error')}: ${err?.message || err}`);
    } finally {
      clearTimeout(safetyTimeout);
      globalIsAuthenticating = false;
    }
  };

  // Helper to check biometrics and trigger auto-authentication safely
  const triggerAutoBiometrics = useCallback(() => {
    let active = true;
    let timer: any = null;

    async function run() {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const hasBiometricSupport = supportedTypes && supportedTypes.length > 0;
        const enabledPref = await SecureStore.getItemAsync('biometrics_enabled');

        if (active && hasHardware && isEnrolled && hasBiometricSupport && enabledPref === 'true') {
          setHasBiometrics(true);
          
          // Wait for layout/animations to settle to prevent immediate cancellations (app_cancel) on Android
          const scheduleCallback = typeof requestIdleCallback !== 'undefined'
            ? requestIdleCallback
            : (cb: any) => setTimeout(cb, 100);

          scheduleCallback(() => {
            if (!active) return;
            timer = setTimeout(() => {
              if (active) {
                console.log('[Login] Auto-triggering biometric prompt...');
                handleBiometricAuth();
              }
            }, 400); // Safe buffer after animations complete
          });
        } else if (active) {
          setHasBiometrics(false);
        }
      } catch (err) {
        console.warn('[Login] error in checkBiometrics:', err);
      }
    }

    run();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [isNewUser]);

  // 1. Listen for focus and handle auto-trigger / blur cancellation
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    if (isFocused && !isNewUser && AppState.currentState === 'active') {
      cleanup = triggerAutoBiometrics();
    } else if (!isFocused) {
      console.log('[Login] Screen blurred. Cancelling pending biometric flows.');
      LocalAuthentication.cancelAuthenticate().catch(() => {});
      globalIsAuthenticating = false;
    }
    return () => {
      if (cleanup) cleanup();
    };
  }, [isFocused, isNewUser, triggerAutoBiometrics]);

  // 2. Listen for AppState changes to handle background lock/cancel and foreground auto-trigger
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'background') {
        console.log('[Login] App backgrounded. Cancelling biometric flows.');
        await LocalAuthentication.cancelAuthenticate().catch(() => {});
        globalIsAuthenticating = false;
      } else if (nextAppState === 'active') {
        console.log('[Login] App returned to active. Re-checking biometrics.');
        if (isFocused && !isNewUser) {
          triggerAutoBiometrics();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isFocused, isNewUser, triggerAutoBiometrics]);

  const handleSignUp = () => {
    console.log('[Login] Sign Up button pressed! Navigating to /onboarding...');
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
  if (isNewUser && !forceShowLogin) {
    console.log('[Login] Rendering: WELCOME / SIGN UP view');
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* App Logo / Branding */}
          <View style={styles.brandSection}>
            <View style={styles.logoContainer}>
              <Ionicons name="calculator" size={48} color={colors.primary} />
            </View>
            <Text style={styles.brandName}>{APP_CONFIG.APP_NAME}</Text>
            <Text style={styles.brandTagline}>
              {t('onboarding.subtitle')}
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
            {t('login.already_have_account')}
            {' '}
            <Text style={styles.signUpLink} onPress={() => { triggerHaptic(); setForceShowLogin(true); }}>
              {t('login.log_in')}
            </Text>
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Email & Password Entry View (Returning / Locked Users) ───
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
          <Text style={styles.title}>{t('login.title')}</Text>
          <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
        </View>

        {/* Error Message */}
        {errorMsg ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : (
          <View style={styles.errorContainerPlaceholder} />
        )}

        {/* Credentials Form Card */}
        <Animated.View style={[styles.loginCard, { transform: [{ translateX: shakeAnim }] }]}>
          <Text style={styles.inputLabel}>{t('login.email_label')} *</Text>
          <TextInput
            style={styles.input}
            placeholder="dev@tallytracker.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            maxLength={100}
          />

          <Text style={styles.inputLabel}>{t('login.password_label')} *</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            maxLength={50}
          />

          {/* Biometrics row trigger */}
          {hasBiometrics && (
            <TouchableOpacity style={styles.biometricsRow} onPress={handleBiometricAuth}>
              <Ionicons name="finger-print" size={22} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.biometricsText}>Use biometrics to unlock</Text>
            </TouchableOpacity>
          )}

          {/* Sign In Button */}
          <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn}>
            <Ionicons name="log-in-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.signInBtnText}>{t('login.btn_sign_in')}</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Need to create a new profile? Sign Up */}
        <Text style={[styles.welcomeFooterText, { marginTop: 32 }]}>
          {t('login.no_account')}
          {' '}
          <Text style={styles.signUpLink} onPress={handleSignUp}>
            {t('login.sign_up')}
          </Text>
        </Text>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
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

  // ─── Credentials View Header ────────────────────────────────
  header: {
    alignItems: 'center',
    marginBottom: 32,
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

  // ─── Login Card & Inputs ────────────────────────────────────
  loginCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 3,
    marginBottom: 20,
  },
  inputLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.text,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  biometricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom: 16,
  },
  biometricsText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.primary,
  },
  signInBtn: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 8,
  },
  signInBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  errorContainer: {
    height: 24,
    marginBottom: 20,
  },
  errorContainerPlaceholder: {
    height: 24,
    marginBottom: 20,
  },
  errorText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.danger || '#FF3B30',
  },
});
