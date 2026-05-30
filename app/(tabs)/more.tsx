/**
 * TallyTracker — Settings (More) Tab Screen
 *
 * Streamlined menu for CA management tasks:
 * 1. Profile Details & Active tier badges
 * 2. Settings [NEW] (navigates to standalone settings configurator)
 * 3. Manage Client Entities
 * 4. Compliance Habits Tracker
 * 5. Upgrade / Premium membership
 * 6. Quick Lock trigger
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import database, { CaUser, Habit } from '@/db';
import { TABLE_NAMES } from '@/utils/constants';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useAuthStore } from '@/stores/authStore';
import { useThemedStyles } from '@/theme/useThemedStyles';

export default function MoreScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const { caUserId, lock, signOut, isPremium } = useAuthStore();
  const [caProfile, setCaProfile] = useState<CaUser | null>(null);
  const [maxStreak, setMaxStreak] = useState<number>(0);

  // Profile editing states
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');

  // Password editing states
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');

  useEffect(() => {
    if (caUserId) {
      database
        .get<CaUser>(TABLE_NAMES.CA_USERS)
        .find(caUserId)
        .then(setCaProfile)
        .catch(() => setCaProfile(null));

      // Calculate the maximum streak from CA habits
      database
        .get<Habit>(TABLE_NAMES.HABITS)
        .query()
        .fetch()
        .then((records) => {
          const streak = records.reduce((max, h) => Math.max(max, h.streakCount), 0);
          setMaxStreak(streak);
        })
        .catch(() => setMaxStreak(0));
    }
  }, [caUserId]);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleLockNow = () => {
    triggerHaptic();
    lock(); // This will auto-lock and redirect to the PIN login screen
  };

  const handleOpenProfileModal = () => {
    triggerHaptic();
    if (caProfile) {
      setEditName(caProfile.name);
      setEditEmail(caProfile.email);
      setShowProfileModal(true);
    }
  };

  const handleSaveProfile = async () => {
    triggerHaptic();
    if (!editName.trim()) {
      Alert.alert('Validation Error', 'Please enter your name');
      return;
    }

    try {
      if (caProfile) {
        // 1. Write CA name changes to DB
        await database.write(async () => {
          await caProfile.update((record: any) => {
            record.name = editName.trim();
          });
        });

        // 2. Update component state
        setCaProfile((prev: any) => {
          if (!prev) return null;
          const updated = Object.create(Object.getPrototypeOf(prev));
          Object.assign(updated, prev, {
            name: editName.trim(),
          });
          return updated;
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Success', 'Profile updated successfully!');
        setShowProfileModal(false);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile');
    }
  };

  const handleSavePassword = async () => {
    triggerHaptic();
    if (!currentPassword) {
      Alert.alert('Validation Error', 'Please enter your current password');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Validation Error', 'New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Validation Error', 'New passwords do not match');
      return;
    }

    try {
      const savedPassword = await SecureStore.getItemAsync('user_password');
      if (currentPassword === savedPassword) {
        // Save new password securely
        await SecureStore.setItemAsync('user_password', newPassword);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Success', 'Password updated successfully!');
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert('Security Error', 'Incorrect current password. Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update password');
    }
  };

  const handleSignOut = () => {
    triggerHaptic();
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of your profile?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: () => {
            signOut();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('tabs.more')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        {caProfile && (
          <TouchableOpacity
            style={styles.profileCard}
            onPress={handleOpenProfileModal}
            activeOpacity={0.7}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {caProfile.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileDetails}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.profileName}>{caProfile.name}</Text>
                {isPremium && (
                  <View style={styles.proBadge}>
                    <Text style={styles.proBadgeText}>PRO</Text>
                  </View>
                )}
              </View>
              <Text style={styles.profileEmail}>
                {caProfile.email || 'No email configured'}
              </Text>
              <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, color: colors.primary, marginTop: 4 }}>
                Tap to edit profile
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Operational Options */}
        <Text style={styles.sectionTitle}>Preferences & Tools</Text>

        {/* 1. STANDALONE SETTINGS OPTION */}
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            triggerHaptic();
            router.push('/(screens)/settings');
          }}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="settings-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>{t('tabs.settings')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* 2. CLIENT MANAGEMENT */}
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            triggerHaptic();
            router.push('/entities');
          }}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="business-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>Manage Client Entities</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* 2b. PARTY CONTACT MASTER */}
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            triggerHaptic();
            router.push('/parties');
          }}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="people-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>Party Contact Master (Customers/Suppliers)</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* 2c. BANK RECONCILIATION */}
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            triggerHaptic();
            router.push('/(screens)/bank-reconciliation');
          }}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>Bank Reconciliation Clearance</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* 2f. STOCK SUMMARY */}
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            triggerHaptic();
            router.push('/(screens)/stock-summary');
          }}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="cube-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>Inventory Stock Summary</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* 2d. FINANCIAL YEAR CLOSING */}
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            triggerHaptic();
            router.push('/(screens)/fy-close');
          }}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="calendar-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>Financial Year Close & Lock</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* 2e. AUDIT LOGS */}
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            triggerHaptic();
            router.push('/(screens)/audit-log');
          }}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="receipt-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>Compliance Auditing & Edit Logs</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* 3. COMPLIANCE HABITS TRACKER */}
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            triggerHaptic();
            router.push('/habits');
          }}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="checkbox-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>Compliance Habits Tracker</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {maxStreak > 0 && (
              <View style={styles.streakBadge}>
                <Ionicons name="flame" size={12} color="#F59E0B" />
                <Text style={styles.streakBadgeText}>{maxStreak} Streak</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>

        {/* 4. PREMIUM TIERS */}
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            triggerHaptic();
            router.push('/premium');
          }}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="gift-outline" size={20} color={isPremium ? "#F59E0B" : colors.text} />
            <Text style={styles.actionText}>
              {isPremium ? "You are a Pro Subscriber" : "Upgrade to TallyTracker Pro"}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isPremium ? (
              <View style={styles.proActiveBadge}>
                <Text style={styles.proActiveBadgeText}>PRO ACTIVE</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 13, color: colors.primary, fontFamily: 'PlusJakartaSans_700Bold' }}>
                UPGRADE
              </Text>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>

        {/* 5. PIN LOCK */}
        <TouchableOpacity style={styles.actionRow} onPress={handleLockNow}>
          <View style={styles.actionLeft}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>Lock Application Now</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* 6. LOG OUT */}
        <TouchableOpacity style={[styles.actionRow, styles.logoutRow]} onPress={handleSignOut}>
          <View style={styles.actionLeft}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger || '#FF3B30'} />
            <Text style={[styles.actionText, { color: colors.danger || '#FF3B30' }]}>Log Out of Profile</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.danger || '#FF3B30'} />
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={showProfileModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProfileModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBg}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit User Profile</Text>
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic();
                  setShowProfileModal(false);
                }}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalSubtitle}>
                Update your CA profile details. Your email address is locked for account integrity.
              </Text>

              <Text style={styles.inputLabel}>CA Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g., CA Rajesh Sharma"
                placeholderTextColor={colors.textMuted}
                value={editName}
                onChangeText={setEditName}
                maxLength={50}
              />

              <Text style={styles.inputLabel}>Email Address (Locked)</Text>
              <TextInput
                style={[styles.modalInput, { opacity: 0.6 }]}
                editable={false}
                value={editEmail}
                maxLength={100}
              />

              {/* Change Password Button */}
              <TouchableOpacity
                style={styles.changePasswordBtn}
                onPress={() => {
                  triggerHaptic();
                  setShowPasswordModal(true);
                }}
              >
                <Ionicons name="key-outline" size={16} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.changePasswordBtnText}>Change Profile Password</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile}>
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBg}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Access Password</Text>
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic();
                  setShowPasswordModal(false);
                }}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalSubtitle}>
                Verify your current password to set a new access password for TallyTracker.
              </Text>

              <Text style={styles.inputLabel}>Current Password *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
                maxLength={50}
              />

              <Text style={styles.inputLabel}>New Password *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                maxLength={50}
              />

              <Text style={styles.inputLabel}>Confirm New Password *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
                maxLength={50}
              />

              <TouchableOpacity style={styles.saveBtn} onPress={handleSavePassword}>
                <Text style={styles.saveBtnText}>Update Password</Text>
              </TouchableOpacity>
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
    paddingHorizontal: 24,
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
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  profileDetails: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: colors.text,
  },
  profileEmail: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  proBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  proBadgeText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 9,
    color: '#92400E',
  },
  proActiveBadge: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proActiveBadgeText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 9,
    color: colors.primary,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 12,
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
    paddingVertical: 18,
    marginBottom: 12,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 16,
  },
  actionText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  streakBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#92400E',
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
  modalInput: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14.5,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  inputLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
    color: colors.text,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 10,
  },
  saveBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  logoutRow: {
    borderColor: (colors.danger || '#FF3B30') + '40',
  },
  changePasswordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 20,
    marginTop: 10,
  },
  changePasswordBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14.5,
    color: colors.primary,
  },
});
