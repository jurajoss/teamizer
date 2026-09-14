import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { resources } from './resources';

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  lng: 'en',
  resources,
  returnNull: false,
});

export type SupportedLanguage = 'cs' | 'en';
