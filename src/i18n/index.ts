import { en, type TranslationKey } from './en';
import { zh } from './zh';
import type { UILanguage } from '../types';

const translations: Record<UILanguage, Record<TranslationKey, string>> = {
  en,
  zh,
};

let currentLanguage: UILanguage = 'zh';

export function setLanguage(lang: UILanguage): void {
  currentLanguage = lang;
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let s = translations[currentLanguage][key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

export type { TranslationKey };
