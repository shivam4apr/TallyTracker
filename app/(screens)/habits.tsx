/**
 * TallyTracker — Compliance Habits Screen
 *
 * Implements a high-fidelity habit tracking dashboard for CA compliance.
 * - Streak progress aggregates
 * - Horizontal frequency pill filters
 * - Touch-interactive checklists with haptic feedback
 * - Streak counter calculations (fire icons)
 * - Custom habit creations with segmented selectors
 * - Custom habit deletions with dialog confirmations
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
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import database, { Habit } from '@/db';
import { TABLE_NAMES, HabitFrequency, HABIT_FREQUENCIES } from '@/utils/constants';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useAuthStore } from '@/stores/authStore';

// Frequency metadata for badges and filtering
const FREQUENCY_META: Record<
  HabitFrequency,
  { label: string; bg: string; text: string; icon: string }
> = {
  daily: { label: 'Daily', bg: '#D1FAE5', text: '#065F46', icon: 'sunny-outline' },
  weekly: { label: 'Weekly', bg: '#DBEAFE', text: '#1E40AF', icon: 'calendar-outline' },
  monthly: { label: 'Monthly', bg: '#F3E8FF', text: '#5B21B6', icon: 'document-text-outline' },
  quarterly: { label: 'Quarterly', bg: '#FEF3C7', text: '#92400E', icon: 'pie-chart-outline' },
  annual: { label: 'Annual', bg: '#FCE7F3', text: '#9D174D', icon: 'trophy-outline' },
};

export default function HabitsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { caUserId } = useAuthStore();

  const [habits, setHabits] = useState<any[]>([]);
  const [selectedFreq, setSelectedFreq] = useState<string>('all');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newFreq, setNewFreq] = useState<HabitFrequency>('daily');
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // Fetch habits from database
  const fetchHabits = async () => {
    if (!caUserId) return;
    try {
      const records = await database
        .get<Habit>(TABLE_NAMES.HABITS)
        .query()
        .fetch();
      
      // Map to plain objects to avoid VirtualizedList non-configurable class exception
      const mapped = records.map((r) => ({
        id: r.id,
        caUserId: r.caUserId,
        title: r.title,
        frequency: r.frequency,
        lastCompletedDate: r.lastCompletedDate,
        streakCount: r.streakCount,
        _record: r, // Keep a reference to write updates
      }));
      setHabits(mapped);
    } catch (err) {
      console.error('Error fetching habits:', err);
    }
  };

  useEffect(() => {
    fetchHabits();
  }, [caUserId]);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  // Check if a habit was completed today
  const isCompletedToday = (lastCompletedDate: number | null): boolean => {
    if (!lastCompletedDate) return false;
    const completed = new Date(lastCompletedDate);
    const today = new Date();
    return (
      completed.getDate() === today.getDate() &&
      completed.getMonth() === today.getMonth() &&
      completed.getFullYear() === today.getFullYear()
    );
  };

  // Toggle habit completion status
  const handleToggleHabit = async (habit: any) => {
    triggerHaptic();
    const completed = isCompletedToday(habit.lastCompletedDate);

    try {
      await database.write(async () => {
        const record = habit._record;
        await record.update((rec: Habit) => {
          if (completed) {
            // Uncomplete: Clear last date, decrement streak
            rec.lastCompletedDate = null;
            rec.streakCount = Math.max(0, rec.streakCount - 1);
          } else {
            // Complete: Set today's date, increment streak
            rec.lastCompletedDate = Date.now();
            rec.streakCount = rec.streakCount + 1;
          }
        });
      });
      // Refresh list
      fetchHabits();
    } catch (err) {
      Alert.alert('Error', 'Failed to update habit status');
    }
  };

  // Create a new custom habit
  const handleAddHabit = async () => {
    triggerHaptic();
    if (!newTitle.trim()) {
      Alert.alert('Validation Error', 'Habit title cannot be empty');
      return;
    }

    try {
      await database.write(async () => {
        await database.get<Habit>(TABLE_NAMES.HABITS).create((record: Habit) => {
          record.caUserId = caUserId!;
          record.title = newTitle.trim();
          record.frequency = newFreq;
          record.lastCompletedDate = null;
          record.streakCount = 0;
        });
      });
      setNewTitle('');
      setShowAddForm(false);
      fetchHabits();
    } catch (err) {
      Alert.alert('Error', 'Failed to add custom habit');
    }
  };

  // Delete a habit
  const handleDeleteHabit = (habitId: string, title: string) => {
    triggerHaptic();
    Alert.alert(
      'Delete Habit',
      `Are you sure you want to delete "${title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const habitRecord = habits.find((h) => h.id === habitId)?._record;
              if (habitRecord) {
                await database.write(async () => {
                  await habitRecord.destroyPermanently();
                });
                fetchHabits();
              }
            } catch (err) {
              Alert.alert('Error', 'Failed to delete habit');
            }
          },
        },
      ]
    );
  };

  // Filter habits list by frequency
  const filteredHabits = habits.filter((h) => {
    if (selectedFreq === 'all') return true;
    return h.frequency === selectedFreq;
  });

  // Calculate Aggregates
  const totalToday = habits.filter((h) => h.frequency === 'daily').length;
  const completedToday = habits.filter(
    (h) => h.frequency === 'daily' && isCompletedToday(h.lastCompletedDate)
  ).length;

  const maxStreak = habits.reduce((max, h) => Math.max(max, h.streakCount), 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            triggerHaptic();
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Compliance Habits</Text>
        <TouchableOpacity
          style={styles.addIconBtn}
          onPress={() => {
            triggerHaptic();
            setShowAddForm(!showAddForm);
          }}
        >
          <Ionicons
            name={showAddForm ? 'close-circle-outline' : 'add-circle-outline'}
            size={26}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Streak and Progress Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.streakCol}>
              <View style={styles.fireRing}>
                <Ionicons name="flame" size={32} color="#F59E0B" />
              </View>
              <Text style={styles.streakNum}>{maxStreak}</Text>
              <Text style={styles.streakLabel}>Max Streak</Text>
            </View>
            <View style={styles.progressCol}>
              <Text style={styles.progressTitle}>Daily Compliance</Text>
              <Text style={styles.progressSub}>
                {completedToday} of {totalToday} habits done today
              </Text>
              
              {/* Custom ProgressBar */}
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${totalToday > 0 ? (completedToday / totalToday) * 100 : 0}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.motivationalText}>
                {completedToday === totalToday && totalToday > 0
                  ? 'Perfect! You are 100% compliant today! 🌟'
                  : 'Keep it going! Every check counts towards streaks! 💪'}
              </Text>
            </View>
          </View>
        </View>

        {/* Dynamic Add Form */}
        {showAddForm && (
          <View style={styles.addFormCard}>
            <Text style={styles.formTitle}>Add Custom Compliance Habit</Text>
            
            <TextInput
              style={styles.input}
              placeholder="e.g. Verify TDS deposit challan"
              placeholderTextColor={colors.textMuted}
              value={newTitle}
              onChangeText={setNewTitle}
            />

            <Text style={styles.fieldLabel}>Frequency</Text>
            <View style={styles.freqPillsContainer}>
              {HABIT_FREQUENCIES.map((freq) => {
                const isSelected = newFreq === freq;
                return (
                  <TouchableOpacity
                    key={freq}
                    style={[
                      styles.freqSegmentBtn,
                      isSelected && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => {
                      triggerHaptic();
                      setNewFreq(freq);
                    }}
                  >
                    <Text
                      style={[
                        styles.freqSegmentBtnText,
                        isSelected && styles.freqSegmentBtnTextActive,
                      ]}
                    >
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddHabit}>
              <Text style={styles.submitBtnText}>Add Compliance Habit</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Frequency Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsScroll}
        >
          <TouchableOpacity
            style={[
              styles.filterPill,
              selectedFreq === 'all' && styles.filterPillActive,
            ]}
            onPress={() => {
              triggerHaptic();
              setSelectedFreq('all');
            }}
          >
            <Text
              style={[
                styles.filterPillText,
                selectedFreq === 'all' && styles.filterPillTextActive,
              ]}
            >
              All Frequency
            </Text>
          </TouchableOpacity>

          {HABIT_FREQUENCIES.map((freq) => {
            const isSelected = selectedFreq === freq;
            return (
              <TouchableOpacity
                key={freq}
                style={[
                  styles.filterPill,
                  isSelected && styles.filterPillActive,
                ]}
                onPress={() => {
                  triggerHaptic();
                  setSelectedFreq(freq);
                }}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    isSelected && styles.filterPillTextActive,
                  ]}
                >
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Habits List */}
        {filteredHabits.length === 0 ? (
          <View style={styles.emptyView}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No habits matching this frequency.</Text>
            <Text style={styles.emptySub}>Tap the "+" icon at the top to add one!</Text>
          </View>
        ) : (
          filteredHabits.map((habit) => {
            const completed = isCompletedToday(habit.lastCompletedDate);
            const meta = FREQUENCY_META[habit.frequency as HabitFrequency];

            return (
              <View key={habit.id} style={[styles.habitCard, completed && styles.habitCardCompleted]}>
                {/* Complete Checkbox */}
                <TouchableOpacity
                  style={styles.checkboxTouch}
                  onPress={() => handleToggleHabit(habit)}
                >
                  <Ionicons
                    name={completed ? 'checkmark-circle' : 'ellipse-outline'}
                    size={28}
                    color={completed ? colors.success : colors.textMuted}
                  />
                </TouchableOpacity>

                {/* Habit details */}
                <View style={styles.habitInfo}>
                  <Text
                    style={[
                      styles.habitTitle,
                      completed && styles.habitTitleCompleted,
                    ]}
                  >
                    {habit.title}
                  </Text>
                  
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon as any} size={10} color={meta.text} />
                      <Text style={[styles.badgeText, { color: meta.text }]}>
                        {meta.label}
                      </Text>
                    </View>

                    {habit.streakCount > 0 && (
                      <View style={styles.streakBadge}>
                        <Ionicons name="flame" size={10} color="#F59E0B" />
                        <Text style={styles.streakBadgeText}>
                          {habit.streakCount} Streak
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Actions: Delete Button */}
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteHabit(habit.id, habit.title)}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      padding: 4,
    },
    headerTitle: {
      fontFamily: 'PlusJakartaSans_800ExtraBold',
      fontSize: 20,
      color: colors.text,
    },
    addIconBtn: {
      padding: 4,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 48,
    },
    summaryCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      padding: 20,
      marginBottom: 24,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.03,
      shadowRadius: 12,
      elevation: 2,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    streakCol: {
      alignItems: 'center',
      borderRightWidth: 1,
      borderRightColor: colors.border,
      paddingRight: 20,
      width: 100,
    },
    fireRing: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: '#FEF3C7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    streakNum: {
      fontFamily: 'PlusJakartaSans_800ExtraBold',
      fontSize: 24,
      color: colors.text,
      marginTop: 8,
    },
    streakLabel: {
      fontFamily: 'PlusJakartaSans_600SemiBold',
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    progressCol: {
      flex: 1,
      paddingLeft: 20,
    },
    progressTitle: {
      fontFamily: 'PlusJakartaSans_700Bold',
      fontSize: 16,
      color: colors.text,
    },
    progressSub: {
      fontFamily: 'PlusJakartaSans_500Medium',
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    progressBarBg: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      marginTop: 8,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: '#10B981',
      borderRadius: 3,
    },
    motivationalText: {
      fontFamily: 'PlusJakartaSans_500Medium',
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 8,
      fontStyle: 'italic',
    },
    addFormCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 24,
    },
    formTitle: {
      fontFamily: 'PlusJakartaSans_700Bold',
      fontSize: 14,
      color: colors.text,
      marginBottom: 12,
    },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      fontFamily: 'PlusJakartaSans_500Medium',
      fontSize: 14,
      color: colors.text,
      marginBottom: 16,
    },
    fieldLabel: {
      fontFamily: 'PlusJakartaSans_600SemiBold',
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    freqPillsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 20,
    },
    freqSegmentBtn: {
      backgroundColor: colors.borderLight,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    freqSegmentBtnText: {
      fontFamily: 'PlusJakartaSans_600SemiBold',
      fontSize: 12,
      color: colors.textSecondary,
    },
    freqSegmentBtnTextActive: {
      color: '#FFFFFF',
      fontFamily: 'PlusJakartaSans_700Bold',
    },
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    submitBtnText: {
      fontFamily: 'PlusJakartaSans_700Bold',
      fontSize: 14,
      color: '#FFFFFF',
    },
    filterPillsScroll: {
      gap: 8,
      paddingBottom: 16,
      marginBottom: 8,
    },
    filterPill: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterPillActive: {
      backgroundColor: colors.primaryLight,
      borderColor: colors.primary,
    },
    filterPillText: {
      fontFamily: 'PlusJakartaSans_600SemiBold',
      fontSize: 12,
      color: colors.textSecondary,
    },
    filterPillTextActive: {
      color: colors.primary,
      fontFamily: 'PlusJakartaSans_700Bold',
    },
    emptyView: {
      alignItems: 'center',
      paddingVertical: 64,
    },
    emptyText: {
      fontFamily: 'PlusJakartaSans_700Bold',
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 16,
    },
    emptySub: {
      fontFamily: 'PlusJakartaSans_500Medium',
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 4,
    },
    habitCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.01,
      shadowRadius: 4,
      elevation: 1,
    },
    habitCardCompleted: {
      borderColor: colors.success + '20',
      backgroundColor: colors.success + '04',
    },
    checkboxTouch: {
      padding: 4,
    },
    habitInfo: {
      flex: 1,
      marginLeft: 12,
    },
    habitTitle: {
      fontFamily: 'PlusJakartaSans_700Bold',
      fontSize: 14,
      color: colors.text,
    },
    habitTitleCompleted: {
      color: colors.textMuted,
      textDecorationLine: 'line-through',
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    badgeText: {
      fontFamily: 'PlusJakartaSans_700Bold',
      fontSize: 10,
    },
    streakBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#FEF3C7',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    streakBadgeText: {
      fontFamily: 'PlusJakartaSans_700Bold',
      fontSize: 10,
      color: '#92400E',
    },
    deleteBtn: {
      padding: 8,
    },
  });
