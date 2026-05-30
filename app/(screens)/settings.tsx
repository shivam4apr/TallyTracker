/**
 * TallyTracker — Technical Settings Screen
 *
 * Implements standard technical options migrated from More:
 * - Localization languages (English, Hindi)
 * - Accent color theme picker (7 color options)
 * - Appearance mode switch (Light, Dark, System)
 * - Backup & Restore utilities (Base64 manually or binary Pickers)
 * - Cloud integration sync configuration
 * - Danger zone reset
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { safeStorage } from '@/utils/safeStorage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import database, { CaUser } from '@/db';
import { TABLE_NAMES } from '@/utils/constants';
import { exportBackupFile, restoreBackup } from '@/services/backup';
import { syncDatabase, getLastSyncedAt, getSyncEndpoint, setSyncEndpoint } from '@/services/sync';
import { THEMES } from '@/theme/themes';
import { useTheme, ColorMode } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useAuthStore } from '@/stores/authStore';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { LANGUAGE_KEY } from '@/i18n';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, themeKey, setThemeKey, colorMode, setColorMode } = useTheme();
  const styles = useThemedStyles(createStyles);

  const { caUserId, signOut, isPremium } = useAuthStore();

  // Backup & Recovery States
  const [showBackupModal, setShowBackupModal] = useState<boolean>(false);
  const [backupText, setBackupText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Cloud Sync States
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false);
  const [syncEndpointText, setSyncEndpointText] = useState<string>('');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncStatusText, setSyncStatusText] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    getLastSyncedAt().then(setLastSyncedAt);
    getSyncEndpoint().then(setSyncEndpointText);
  }, [caUserId, showSyncModal]);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleSyncDatabase = async () => {
    triggerHaptic();
    if (!syncEndpointText.trim()) {
      Alert.alert('Validation Error', 'Please enter a valid sync server endpoint URL');
      return;
    }
    setIsSyncing(true);
    setSyncStatusText('Connecting to cloud server...');
    try {
      await setSyncEndpoint(syncEndpointText.trim());
      await syncDatabase((status) => {
        setSyncStatusText(status);
      });
      const now = await getLastSyncedAt();
      setLastSyncedAt(now);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Sync Succeeded', 'Your database is successfully synced!');
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Sync Failed', err.message || 'Make sure the cloud server is online.');
    } finally {
      setIsSyncing(false);
      setSyncStatusText('');
    }
  };

  const handleCreateBackup = async () => {
    triggerHaptic();
    setIsProcessing(true);
    try {
      await exportBackupFile();
      Alert.alert('Success', 'Backup generated successfully!');
    } catch (err: any) {
      Alert.alert('Backup Failed', err.message || 'Unable to share backup data');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportBackupFile = async () => {
    triggerHaptic();
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      setIsProcessing(true);
      const uri = result.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await restoreBackup(content);
      setIsProcessing(false);
      setShowBackupModal(false);

      Alert.alert(
        'Restore Completed',
        'Database has been restored successfully. Logging out to apply changes.',
        [
          {
            text: 'OK',
            onPress: () => {
              signOut();
            },
          },
        ]
      );
    } catch (err: any) {
      setIsProcessing(false);
      Alert.alert('Restore Failed', err.message || 'Corrupted file payload');
    }
  };

  const handleTextRestore = async () => {
    triggerHaptic();
    if (!backupText.trim()) {
      Alert.alert('Validation Error', 'Please paste a valid backup string');
      return;
    }

    Alert.alert(
      'Restore Database',
      'This will replace all existing client sheets and voucher records with the backup state. Do you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await restoreBackup(backupText);
              setIsProcessing(false);
              setShowBackupModal(false);
              setBackupText('');
              Alert.alert(
                'Restore Completed',
                'Database restored successfully. Logging out to reload session.',
                [{ text: 'OK', onPress: () => signOut() }]
              );
            } catch (err: any) {
              setIsProcessing(false);
              Alert.alert('Restore Failed', err.message || 'Corrupted backup string');
            }
          },
        },
      ]
    );
  };

  const handleChangeLanguage = async (lng: 'en' | 'hi') => {
    triggerHaptic();
    await i18n.changeLanguage(lng);
    await safeStorage.setItem(LANGUAGE_KEY, lng);
  };

  const handleResetApp = () => {
    triggerHaptic();
    Alert.alert(
      'Reset TallyTracker',
      'Are you sure you want to log out and clear all local database records? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset All',
          style: 'destructive',
          onPress: async () => {
            await database.write(async () => {
              await database.unsafeResetDatabase();
            });
            signOut();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Language Picker */}
        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                i18n.language === 'en' && styles.toggleBtnActive,
              ]}
              onPress={() => handleChangeLanguage('en')}
            >
              <Text
                style={[
                  styles.toggleBtnText,
                  i18n.language === 'en' && styles.toggleBtnTextActive,
                ]}
              >
                English
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                i18n.language === 'hi' && styles.toggleBtnActive,
              ]}
              onPress={() => handleChangeLanguage('hi')}
            >
              <Text
                style={[
                  styles.toggleBtnText,
                  i18n.language === 'hi' && styles.toggleBtnTextActive,
                ]}
              >
                हिन्दी
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Accent Color Theme */}
        <Text style={styles.sectionTitle}>{t('settings.theme')}</Text>
        <View style={styles.card}>
          <View style={styles.themesGrid}>
            {Object.keys(THEMES).map((key) => {
              const theme = THEMES[key]!;
              const themeColor = theme.light.primary;
              const isSelected = key === themeKey;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.themeBubble,
                    { backgroundColor: themeColor },
                    isSelected && styles.themeBubbleSelected,
                  ]}
                  onPress={() => {
                    triggerHaptic();
                    const isFreeTheme = key === 'default' || key === 'forest';
                    if (!isFreeTheme && !isPremium) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                      Alert.alert(
                        'Pro Theme Locked',
                        'Accent themes like Slate, Sunset, Plum, and Ocean are Pro-only features. Upgrade now to fully customize TallyTracker!',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Upgrade to Pro', onPress: () => router.push('/premium') }
                        ]
                      );
                      return;
                    }
                    setThemeKey(key);
                  }}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  )}
                  {!isSelected && !(key === 'default' || key === 'forest') && !isPremium && (
                    <Ionicons name="lock-closed" size={12} color="#FFFFFF" style={{ opacity: 0.8 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.themeNameHelp}>
            Selected: {themeKey.charAt(0).toUpperCase() + themeKey.slice(1)}
          </Text>
        </View>

        {/* Appearance Mode */}
        <Text style={styles.sectionTitle}>{t('settings.appearance')}</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            {(['light', 'dark', 'system'] as ColorMode[]).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.toggleBtn,
                  colorMode === mode && styles.toggleBtnActive,
                ]}
                onPress={() => {
                  triggerHaptic();
                  setColorMode(mode);
                }}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    colorMode === mode && styles.toggleBtnTextActive,
                  ]}
                >
                  {mode.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Backup & Recovery */}
        <Text style={styles.sectionTitle}>{t('settings.data')}</Text>
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            triggerHaptic();
            setShowBackupModal(true);
          }}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="cloud-upload-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>{t('settings.backup_restore')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Cloud Sync Integration */}
        <Text style={styles.sectionTitle}>{t('settings.cloud')}</Text>
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            triggerHaptic();
            if (!isPremium) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
              Alert.alert(
                'Pro Sync Locked',
                'Cloud Sync is a premium tier feature. Upgrade to TallyTracker Pro to sync books across devices in real time!',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Upgrade to Pro', onPress: () => router.push('/premium') }
                ]
              );
              return;
            }
            setShowSyncModal(true);
          }}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="cloud-done-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>{t('settings.cloud_sync')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {!isPremium && (
              <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
            )}
            {lastSyncedAt && (
              <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'PlusJakartaSans_500Medium' }}>
                Synced
              </Text>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>

        {/* System Reset (Danger Zone) */}
        <Text style={[styles.sectionTitle, { color: colors.danger || '#FF3B30', marginTop: 12 }]}>
          {t('settings.danger')}
        </Text>
        <TouchableOpacity
          style={[styles.actionRow, styles.dangerRow]}
          onPress={handleResetApp}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="trash-outline" size={20} color={colors.danger || '#FF3B30'} />
            <Text style={[styles.actionText, { color: colors.danger || '#FF3B30' }]}>
              {t('settings.reset_data')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.danger || '#FF3B30'} />
        </TouchableOpacity>
      </ScrollView>

      {/* Backup Modal */}
      <Modal
        visible={showBackupModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBackupModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBg}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Backup & Recovery</Text>
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic();
                  setShowBackupModal(false);
                }}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalSubtitle}>
                Export your financial records securely, or import an existing backup payload to restore your ledger sheets.
              </Text>

              {isProcessing && (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loaderText}>Processing database transaction...</Text>
                </View>
              )}

              {!isProcessing && (
                <>
                  <View style={styles.actionsGrid}>
                    <TouchableOpacity style={styles.gridBtn} onPress={handleCreateBackup}>
                      <Ionicons name="share-outline" size={24} color={colors.primary} />
                      <Text style={styles.gridBtnText}>Generate Backup</Text>
                      <Text style={styles.gridBtnHelp}>Share or save backup file (.ttbak)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.gridBtn} onPress={handleImportBackupFile}>
                      <Ionicons name="document-attach-outline" size={24} color={colors.primary} />
                      <Text style={styles.gridBtnText}>Restore File</Text>
                      <Text style={styles.gridBtnHelp}>Select a .ttbak file to restore</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.separator} />

                  <Text style={styles.manualTitle}>Manual Text Recovery</Text>
                  <Text style={styles.manualSubtitle}>
                    If native sharing or file picking is sandboxed, paste the raw Base64 backup text directly below to import:
                  </Text>

                  <TextInput
                    style={styles.textArea}
                    multiline
                    numberOfLines={6}
                    placeholder="Paste Base64 backup string here..."
                    placeholderTextColor={colors.textMuted}
                    value={backupText}
                    onChangeText={setBackupText}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <TouchableOpacity style={styles.restoreBtn} onPress={handleTextRestore}>
                    <Text style={styles.restoreBtnText}>Restore from Paste</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cloud Sync Modal */}
      <Modal
        visible={showSyncModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSyncModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBg}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cloud Sync Integration</Text>
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic();
                  setShowSyncModal(false);
                }}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalSubtitle}>
                Synchronize your offline Tally ERP ledgers and double-entry vouchers with your team's remote PostgreSQL database in real time.
              </Text>

              <View style={styles.syncStatusCard}>
                <Ionicons name="cloud-outline" size={32} color={colors.primary} />
                <Text style={styles.syncStatusTitle}>
                  {isSyncing ? 'Syncing in Progress...' : 'Ready to Synchronize'}
                </Text>
                <Text style={styles.syncStatusSubtitle}>
                  {lastSyncedAt
                    ? `Last Sync: ${new Date(lastSyncedAt).toLocaleString()}`
                    : 'Never Synced'}
                </Text>
              </View>

              {isSyncing && (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loaderText}>{syncStatusText}</Text>
                </View>
              )}

              {!isSyncing && (
                <>
                  <Text style={styles.manualTitle}>Sync Server Endpoint</Text>
                  <Text style={styles.manualSubtitle}>
                    Enter the URL of your Fastify TallyTracker Cloud synchronization gateway:
                  </Text>

                  <TextInput
                    style={styles.modalInput}
                    placeholder="Enter sync server endpoint URL..."
                    placeholderTextColor={colors.textMuted}
                    value={syncEndpointText}
                    onChangeText={setSyncEndpointText}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <TouchableOpacity style={styles.restoreBtn} onPress={handleSyncDatabase}>
                    <Text style={styles.restoreBtnText}>Synchronize Now</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
    paddingVertical: 16,
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
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },
  themesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'center',
    marginVertical: 4,
  },
  themeBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeBubbleSelected: {
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  themeNameHelp: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  dangerRow: {
    borderColor: (colors.danger || '#FF3B30') + '40',
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14.5,
    color: colors.text,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: colors.text,
  },
  modalScroll: {
    padding: 24,
  },
  modalSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13.5,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: 20,
  },
  loaderContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.textMuted,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  gridBtn: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  gridBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  gridBtnHelp: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 14,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 20,
  },
  manualTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.text,
    marginBottom: 6,
  },
  manualSubtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12.5,
    color: colors.textMuted,
    lineHeight: 16,
    marginBottom: 12,
  },
  textArea: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontFamily: 'Courier New',
    fontSize: 12,
    color: colors.text,
    textAlignVertical: 'top',
    height: 110,
    marginBottom: 16,
  },
  restoreBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restoreBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  syncStatusCard: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  syncStatusTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: colors.text,
  },
  syncStatusSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
  },
  modalInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 46,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13.5,
    color: colors.text,
    marginBottom: 16,
  },
});
