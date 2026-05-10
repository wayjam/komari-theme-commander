import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

export const supportedLanguages = [
  { code: 'en', label: 'English' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]['code'];

const SUPPORTED_CODES = supportedLanguages.map((l) => l.code) as readonly string[];
const STORAGE_KEY = 'komari-language';

async function loadLocale(lng: string): Promise<Record<string, unknown>> {
  switch (lng) {
    case 'zh-Hans':
      return (await import('./locales/zh-Hans.json')).default as Record<string, unknown>;
    case 'zh-Hant':
      return (await import('./locales/zh-Hant.json')).default as Record<string, unknown>;
    case 'en':
    default:
      return (await import('./locales/en.json')).default as Record<string, unknown>;
  }
}

/**
 * Resolve the initial language synchronously from localStorage / navigator,
 * so we only ship one locale JSON in the entry chunk.
 */
function detectInitialLanguage(): SupportedLanguage {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED_CODES.includes(stored)) return stored as SupportedLanguage;
    } catch {
      // ignore localStorage errors (privacy mode, etc.)
    }
    const nav = window.navigator?.language ?? 'en';
    if (nav.startsWith('zh')) {
      // Treat traditional Chinese variants (Hant / TW / HK / MO) explicitly
      if (/Hant|TW|HK|MO/i.test(nav)) return 'zh-Hant';
      return 'zh-Hans';
    }
  }
  return 'en';
}

const initialLng = detectInitialLanguage();
const loadedLngs = new Set<string>([initialLng]);

// Top-level await is supported by Vite/ESM. We block module evaluation until
// the initial locale resource is ready, so React components never see an
// empty translation table on first render.
const initialResource = await loadLocale(initialLng);

await i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      [initialLng]: { translation: initialResource },
    },
    lng: initialLng,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_CODES as unknown as string[],
    defaultNS: 'translation',
    ns: ['translation'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
    partialBundledLanguages: true,
  });

/**
 * Switch language at runtime, lazily loading the bundle on first use.
 */
export async function changeLanguage(lng: SupportedLanguage): Promise<void> {
  if (!loadedLngs.has(lng)) {
    const resource = await loadLocale(lng);
    i18n.addResourceBundle(lng, 'translation', resource, true, true);
    loadedLngs.add(lng);
  }
  await i18n.changeLanguage(lng);
}

export default i18n;
