/**
 * TallyTracker — Premium Pro Upgrade Screen
 *
 * Implements a high-fidelity glassmorphic billing paywall screen.
 * - Elegant gradients, Outfit/Plus Jakarta typography, and smooth transitions
 * - Interactive Monthly vs Yearly Pro subscription selectors (showing 33% yearly savings)
 * - Interactive subscription flow with spinner loader and haptic feedback
 * - Restoring existing subscription status
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/theme/ThemeProvider';
import { ThemeColors } from '@/theme/themes';
import { useAuthStore } from '@/stores/authStore';
import { useThemedStyles } from '@/theme/useThemedStyles';

export default function PremiumScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  
  const { upgradeToPremium, restorePremium } = useAuthStore();
  
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const isHindi = i18n.language === 'hi';
  const getLabel = (enStr: string, hiStr: string) => (isHindi ? hiStr : enStr);

  const triggerHaptic = (style = Haptics.ImpactFeedbackStyle.Medium) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  const handleSubscribe = async () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
    setIsLoading(true);

    // Simulate app store secure checkout network transactions
    setTimeout(async () => {
      try {
        await upgradeToPremium();
        setIsLoading(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          getLabel('Welcome to PRO!', 'प्रो में आपका स्वागत है!'),
          getLabel(
            'Thank you for subscribing to TallyTracker Pro. All business limits, print exports, and visual themes are now unlocked!',
            'टैलीट्रैकर प्रो की सदस्यता लेने के लिए धन्यवाद। सभी व्यावसायिक सीमाएं, प्रिंट निर्यात और दृश्य थीम अब अनलॉक हो गए हैं!'
          ),
          [{ text: 'Get Started', onPress: () => router.back() }]
        );
      } catch (err: any) {
        setIsLoading(false);
        Alert.alert('Checkout Failed', err.message || 'Secure payment gateway error.');
      }
    }, 2000);
  };

  const handleRestore = async () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
    setIsLoading(true);

    setTimeout(async () => {
      const success = await restorePremium();
      setIsLoading(false);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          getLabel('Purchase Restored', 'खरीद बहाल की गई'),
          getLabel(
            'Your TallyTracker Pro subscription was successfully restored from secure cloud archives!',
            'आपकी टैलीट्रैकर प्रो सदस्यता को सुरक्षित क्लाउड अभिलेखागार से सफलतापूर्वक बहाल कर दिया गया था!'
          ),
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          getLabel('No Active Purchase', 'कोई सक्रिय खरीद नहीं'),
          getLabel(
            'We could not find any active Pro credentials for your account setup.',
            'हमें आपके खाता सेटअप के लिए कोई सक्रिय प्रो क्रेडेंशियल नहीं मिला।'
          )
        );
      }
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Background Gradient Simulator Card */}
      <View style={styles.gradientSimulator}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => {
              triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Pro Icon & Title */}
          <View style={styles.badgeContainer}>
            <View style={styles.badgeLabelContainer}>
              <Text style={styles.badgeText}>PRO</Text>
            </View>
          </View>
          <Text style={styles.title}>TallyTracker Pro</Text>
          <Text style={styles.subtitle}>
            {getLabel(
              'Scale your CA accounting practice with enterprise-ready utilities.',
              'एंटरप्राइज़-रेडी उपयोगिताओं के साथ अपने सीए लेखांकन अभ्यास को स्केल करें।'
            )}
          </Text>

          {/* Features Grid */}
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <View style={styles.iconCircle}>
                <Ionicons name="business" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.featureDetails}>
                <Text style={styles.featureTitle}>
                  {getLabel('Unlimited Business Clients', 'असीमित व्यावसायिक ग्राहक')}
                </Text>
                <Text style={styles.featureSubtitle}>
                  {getLabel(
                    'Manage infinite customer entities without any sandbox gates.',
                    'बिना किसी सैंडबॉक्स गेट के अनंत ग्राहक संस्थाओं का प्रबंधन करें।'
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View style={styles.iconCircle}>
                <Ionicons name="document-text" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.featureDetails}>
                <Text style={styles.featureTitle}>
                  {getLabel('Print-Ready PDF Reports', 'प्रिंट-रेडी पीडीएफ रिपोर्ट')}
                </Text>
                <Text style={styles.featureSubtitle}>
                  {getLabel(
                    'Compile elegant, balanced ledger sheets & P&L statements directly to PDF.',
                    'सीधे पीडीएफ में सुरुचिपूर्ण, संतुलित लेज़र शीट और पीएंडएल विवरण संकलित करें।'
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View style={styles.iconCircle}>
                <Ionicons name="color-palette" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.featureDetails}>
                <Text style={styles.featureTitle}>
                  {getLabel('Premium Accent Themes', 'प्रीमियम एक्सेंट थीम')}
                </Text>
                <Text style={styles.featureSubtitle}>
                  {getLabel(
                    'Unlock custom color palettes (Slate, plum, Sunset, and Ocean).',
                    'कस्टम रंग पट्टियों (स्लेट, बेर, सूर्यास्त और महासागर) को अनलॉक करें।'
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View style={styles.iconCircle}>
                <Ionicons name="cloud-done" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.featureDetails}>
                <Text style={styles.featureTitle}>
                  {getLabel('Encrypted Cloud Backup', 'एन्क्रिप्टेड क्लाउड बैकअप')}
                </Text>
                <Text style={styles.featureSubtitle}>
                  {getLabel(
                    'Secure base64 file exports and atomic recovery database restores.',
                    'सुरक्षित बेस64 फ़ाइल निर्यात और परमाणु पुनर्प्राप्ति डेटाबेस पुनर्स्थापना।'
                  )}
                </Text>
              </View>
            </View>
          </View>

          {/* Pricing Options */}
          <Text style={styles.planSectionTitle}>
            {getLabel('Choose Your Subscription', 'अपनी सदस्यता चुनें')}
          </Text>

          <View style={styles.plansContainer}>
            {/* Monthly Card */}
            <TouchableOpacity
              style={[
                styles.planCard,
                selectedPlan === 'monthly' && styles.planCardActive,
              ]}
              onPress={() => {
                triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
                setSelectedPlan('monthly');
              }}
            >
              <View style={styles.radioRow}>
                <View
                  style={[
                    styles.radioCircle,
                    selectedPlan === 'monthly' && styles.radioCircleActive,
                  ]}
                >
                  {selectedPlan === 'monthly' && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.planName}>{getLabel('Monthly Pro', 'मासिक प्रो')}</Text>
              </View>
              <Text style={styles.planPrice}>₹99</Text>
              <Text style={styles.planHelp}>{getLabel('Charged monthly, cancel anytime', 'मासिक शुल्क, कभी भी रद्द करें')}</Text>
            </TouchableOpacity>

            {/* Yearly Card (33% Savings) */}
            <TouchableOpacity
              style={[
                styles.planCard,
                selectedPlan === 'yearly' && styles.planCardActive,
              ]}
              onPress={() => {
                triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
                setSelectedPlan('yearly');
              }}
            >
              <View style={styles.savingsTag}>
                <Text style={styles.savingsTagText}>{getLabel('SAVE 33%', '३३% बचाएं')}</Text>
              </View>
              <View style={styles.radioRow}>
                <View
                  style={[
                    styles.radioCircle,
                    selectedPlan === 'yearly' && styles.radioCircleActive,
                  ]}
                >
                  {selectedPlan === 'yearly' && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.planName}>{getLabel('Annual Pro', 'वार्षिक प्रो')}</Text>
              </View>
              <Text style={styles.planPrice}>
                ₹799<Text style={styles.planPricePeriod}>/yr</Text>
              </Text>
              <Text style={styles.planHelp}>
                {getLabel('Equals ₹66/month, billed annually', '₹६६/माह के बराबर, वार्षिक बिलिंग')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Loader or Subscribe Button */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text style={styles.loadingText}>
                {getLabel('Contacting secure App Store servers...', 'सुरक्षित ऐप स्टोर सर्वर से संपर्क कर रहे हैं...')}
              </Text>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.subscribeBtn} onPress={handleSubscribe}>
                <Text style={styles.subscribeBtnText}>
                  {selectedPlan === 'yearly'
                    ? getLabel('Subscribe Yearly (₹799)', 'वार्षिक सदस्यता लें (₹७९९)')
                    : getLabel('Subscribe Monthly (₹99)', 'मासिक सदस्यता लें (₹९९)')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore}>
                <Text style={styles.restoreBtnText}>
                  {getLabel('Restore Purchases', 'खरीद बहाल करें')}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Legal Footer */}
          <Text style={styles.legalText}>
            {getLabel(
              'Subscriptions will automatically renew unless cancelled within 24 hours of the current period. Taxes included in billing values.',
              'सदस्यता स्वतः नवीनीकृत हो जाएगी जब तक कि वर्तमान अवधि के 24 घंटों के भीतर रद्द नहीं किया जाता है। बिलिंग मूल्यों में कर शामिल हैं।'
            )}
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // Slate-900 for dark mode premium contrast
  },
  gradientSimulator: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    paddingHorizontal: 24,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 48,
  },
  badgeContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  badgeLabelContainer: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  badgeText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 12,
    color: '#000000',
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 28,
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: '#94A3B8', // Slate-400
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  featuresList: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    padding: 20,
    gap: 20,
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  featureDetails: {
    flex: 1,
    marginLeft: 16,
  },
  featureTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  featureSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  planSectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  plansContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 32,
  },
  planCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
    position: 'relative',
  },
  planCardActive: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  radioCircleActive: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  planName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  planPrice: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
    color: '#FFFFFF',
  },
  planPricePeriod: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: '#94A3B8',
  },
  planHelp: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  savingsTag: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  savingsTagText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 10,
    color: '#FFFFFF',
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  loadingText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#94A3B8',
  },
  subscribeBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 16,
  },
  subscribeBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  restoreBtn: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  restoreBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#94A3B8',
  },
  legalText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 24,
    paddingHorizontal: 16,
  },
});
