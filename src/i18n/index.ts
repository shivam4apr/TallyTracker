/**
 * TallyTracker — i18n Initialization
 *
 * Setup i18next with react-i18next support.
 * Currently supports English (en) and Hindi (hi).
 * Persists selected language to AsyncStorage.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { safeStorage } from '@/utils/safeStorage';

import en from './en.json';
import hi from './hi.json';

export const LANGUAGE_KEY = '@tallytracker/language';

const resources = {
  en: { translation: en },
  hi: { translation: hi },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // Default language
    fallbackLng: 'en',
    compatibilityJSON: 'v4', // Required for React Native compatibility
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

// Load saved language asynchronously
safeStorage.getItem(LANGUAGE_KEY).then((savedLng) => {
  if (savedLng && ['en', 'hi'].includes(savedLng)) {
    i18n.changeLanguage(savedLng);
  }
});

export default i18n;
