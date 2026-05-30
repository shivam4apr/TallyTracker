/**
 * TallyTracker — Onboarding Screen
 *
 * Implements a high-fidelity 3-step setup flow:
 * 1. CA Profile Setup (Name, Email)
 * 2. Access PIN Security (4-digit PIN setup with SecureStore)
 * 3. Client Business Seeding (Entity name, GSTIN, PAN, address)
 *
 * Employs rich aesthetics, glassmorphism-style inputs, haptic feedback, and smooth transitions.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';

import database from '@/db';
import { seedAccountTree, seedDefaultHabits } from '@/db/seed';
import { TABLE_NAMES } from '@/utils/constants';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useAuthStore } from '@/stores/authStore';
import { useEntityStore } from '@/stores/entityStore';
import { useThemedStyles } from '@/theme/useThemedStyles';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const signIn = useAuthStore((s) => s.signIn);
  const setActiveEntity = useEntityStore((s) => s.setActiveEntity);

  const [step, setStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [caName, setCaName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  
  const [entityName, setEntityName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [address, setAddress] = useState('');
  const [fyStart, setFyStart] = useState<4 | 1>(4); // Default April

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleNext = async () => {
    triggerHaptic();
    setErrorMsg('');

    if (step === 1) {
      if (!caName.trim()) {
        setErrorMsg(t('onboarding.errors.name_required'));
        return;
      }
      if (!email.trim()) {
        setErrorMsg(t('onboarding.errors.email_required'));
        return;
      }
      // Simple email validation regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setErrorMsg('Please enter a valid email address');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (password.length < 6) {
        setErrorMsg(t('onboarding.errors.password_length'));
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg(t('onboarding.errors.password_mismatch'));
        return;
      }
      
      // Attempt biometrics enrollment if toggled
      if (biometricsEnabled) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const hasBiometricSupport = supportedTypes && supportedTypes.length > 0;

        if (!hasHardware || !isEnrolled || !hasBiometricSupport) {
          setBiometricsEnabled(false);
          setErrorMsg('Biometric authentication (Face ID or fingerprint) not available or not enrolled');
          return;
        }
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    triggerHaptic();
    setErrorMsg('');
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleFinish = async () => {
    triggerHaptic();
    setErrorMsg('');

    if (!entityName.trim()) {
      setErrorMsg(t('onboarding.errors.entity_required'));
      return;
    }

    console.log('[Onboarding] handleFinish called. entityName:', entityName.trim());

    try {
      // 1. Save access credentials in Secure Store
      console.log('[Onboarding] Step 1: Saving credentials to SecureStore...');
      await SecureStore.setItemAsync('user_email', email.trim().toLowerCase());
      await SecureStore.setItemAsync('user_password', password);
      console.log('[Onboarding] Step 1: Credentials saved.');
      
      // 2. Save biometric settings preference
      console.log('[Onboarding] Step 2: Saving biometrics pref...');
      await SecureStore.setItemAsync('biometrics_enabled', String(biometricsEnabled));
      console.log('[Onboarding] Step 2: Biometrics pref saved.');

      // 3. Write CA profile to WatermelonDB
      console.log('[Onboarding] Step 3: Creating CA User in WatermelonDB...');
      const caUser = await database.write(async () => {
        return await database.get(TABLE_NAMES.CA_USERS).create((record: any) => {
          record.name = caName.trim();
          record.email = email.trim().toLowerCase();
          record.pinHash = 'secured';
          record.biometricEnabled = biometricsEnabled;
        });
      });
      console.log('[Onboarding] Step 3: CA User created. ID:', caUser.id);

      // 4. Create first client entity in WatermelonDB
      console.log('[Onboarding] Step 4: Creating Entity...');
      const entity = await database.write(async () => {
        return await database.get(TABLE_NAMES.ENTITIES).create((record: any) => {
          record.caUserId = caUser.id;
          record.name = entityName.trim();
          record.pan = pan.trim().toUpperCase();
          record.gstin = gstin.trim().toUpperCase();
          record.address = address.trim();
          record.financialYearStart = fyStart;
          record.baseCurrency = 'INR';
          record.closedFyYears = '[]';
          record.isArchived = false;
        });
      });
      console.log('[Onboarding] Step 4: Entity created. ID:', entity.id);

      // 5. Seed default Tally ERP 9 groups and ledgers
      console.log('[Onboarding] Step 5: Seeding account tree...');
      await seedAccountTree(database, entity.id);
      console.log('[Onboarding] Step 5: Account tree seeded.');

      // 5.5 Seed default compliance habits
      console.log('[Onboarding] Step 5.5: Seeding default habits...');
      await seedDefaultHabits(database, caUser.id);
      console.log('[Onboarding] Step 5.5: Habits seeded.');

      // 6. Update local stores and log in
      console.log('[Onboarding] Step 6: Signing in...');
      setActiveEntity(entity.id);
      signIn(caUser.id);
      console.log('[Onboarding] Step 6: DONE. Signup complete!');
      
      // router.replace gets called by the NavigationGuard automatically!
    } catch (e: any) {
      console.error('[Onboarding] Signup FAILED at some step:', e);
      console.error('[Onboarding] Error name:', e?.name);
      console.error('[Onboarding] Error message:', e?.message);
      console.error('[Onboarding] Error stack:', e?.stack);
      const errMsg = e.message || 'Database creation failed';
      setErrorMsg(errMsg);
      Alert.alert('Signup Failed', errMsg);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('onboarding.title')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>
          </View>

          {/* Progress Indicators */}
          <View style={styles.progressRow}>
            <View style={[styles.progressDot, step >= 1 && styles.progressDotActive]} />
            <View style={[styles.progressDot, step >= 2 && styles.progressDotActive]} />
            <View style={[styles.progressDot, step >= 3 && styles.progressDotActive]} />
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {step === 1 && t('onboarding.step_profile')}
              {step === 2 && t('onboarding.step_security')}
              {step === 3 && t('onboarding.step_entity')}
            </Text>

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            {/* STEP 1: PROFILE */}
            {step === 1 && (
              <View>
                <Text style={styles.label}>{t('onboarding.ca_name')} *</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('onboarding.ca_name_placeholder')}
                  placeholderTextColor={colors.textMuted}
                  value={caName}
                  onChangeText={setCaName}
                  maxLength={50}
                />

                <Text style={styles.label}>{t('onboarding.email')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('onboarding.email_placeholder')}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  maxLength={100}
                />
              </View>
            )}

            {/* STEP 2: SECURITY */}
            {step === 2 && (
              <View>
                <Text style={styles.label}>{t('onboarding.enter_password')} *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  maxLength={50}
                />

                <Text style={styles.label}>{t('onboarding.confirm_password')} *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  maxLength={50}
                />

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>{t('onboarding.enable_biometrics')}</Text>
                  <Switch
                    value={biometricsEnabled}
                    onValueChange={setBiometricsEnabled}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={Platform.OS === 'android' ? colors.background : undefined}
                  />
                </View>
              </View>
            )}

            {/* STEP 3: FIRST ENTITY */}
            {step === 3 && (
              <View>
                <Text style={styles.label}>{t('onboarding.entity_name')} *</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('onboarding.entity_name_placeholder')}
                  placeholderTextColor={colors.textMuted}
                  value={entityName}
                  onChangeText={setEntityName}
                  maxLength={100}
                />

                <Text style={styles.label}>{t('onboarding.gstin')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('onboarding.gstin_placeholder')}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  value={gstin}
                  onChangeText={setGstin}
                  maxLength={15}
                />

                <Text style={styles.label}>{t('onboarding.pan')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('onboarding.pan_placeholder')}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  value={pan}
                  onChangeText={setPan}
                  maxLength={10}
                />

                <Text style={styles.label}>{t('onboarding.address')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('onboarding.address_placeholder')}
                  placeholderTextColor={colors.textMuted}
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  numberOfLines={2}
                  maxLength={200}
                />

                <Text style={styles.label}>{t('onboarding.fy_start')}</Text>
                <View style={styles.tabRow}>
                  <TouchableOpacity
                    style={[styles.tabButton, fyStart === 4 && styles.tabButtonActive]}
                    onPress={() => { triggerHaptic(); setFyStart(4); }}
                  >
                    <Text style={[styles.tabText, fyStart === 4 && styles.tabTextActive]}>
                      {t('onboarding.fy_start_april')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, fyStart === 1 && styles.tabButtonActive]}
                    onPress={() => { triggerHaptic(); setFyStart(1); }}
                  >
                    <Text style={[styles.tabText, fyStart === 1 && styles.tabTextActive]}>
                      {t('onboarding.fy_start_jan')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Buttons Navigation */}
            <View style={styles.btnRow}>
              {step > 1 ? (
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleBack}>
                  <Text style={styles.secondaryBtnText}>{t('onboarding.button_back')}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flex: 1 }} />
              )}

              {step < 3 ? (
                <TouchableOpacity style={styles.primaryBtn} onPress={handleNext}>
                  <Text style={styles.primaryBtnText}>{t('onboarding.button_next')}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.primaryBtn} onPress={handleFinish}>
                  <Text style={styles.primaryBtnText}>{t('onboarding.button_finish')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 16,
  },
  title: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 28,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  progressDot: {
    width: 24,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
    width: 36,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: colors.text,
    marginBottom: 16,
  },
  label: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
    color: colors.text,
    marginBottom: 8,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  switchLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: colors.text,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
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
  },
  btnRow: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: colors.text,
  },
  errorText: {
    color: colors.danger || '#FF3B30',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    marginBottom: 12,
  },
});
