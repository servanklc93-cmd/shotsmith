// Store screenshot requirements, from Apple's "Screenshot specifications" and
// Google Play's "Add preview assets" help pages (checked October 2026).

export type Store = 'apple' | 'google';
export type DeviceKind = 'iphone' | 'ipad' | 'android-phone' | 'android-tablet';

export interface Target {
  id: string;
  store: Store;
  label: string;
  device: DeviceKind;
  width: number;            // portrait
  height: number;
  required: boolean;
  note?: string;
  // the folder fastlane expects, so an export can be dropped straight in
  fastlaneDir: (locale: string) => string;
}

const appleDir = (locale: string) => `fastlane/screenshots/${locale}`;
const playDir = (kind: string) => (locale: string) => `fastlane/metadata/android/${locale}/images/${kind}`;

export const TARGETS: Target[] = [
  {
    id: 'iphone-6.9', store: 'apple', label: 'iPhone 6.9" (Dynamic Island, large)', device: 'iphone',
    width: 1320, height: 2868, required: false,
    note: 'Optional, but if you skip it you must provide the 6.5" set',
    fastlaneDir: appleDir,
  },
  {
    id: 'iphone-6.3', store: 'apple', label: 'iPhone 6.3" (Dynamic Island, medium)', device: 'iphone',
    width: 1206, height: 2622, required: true, fastlaneDir: appleDir,
  },
  {
    id: 'iphone-6.5', store: 'apple', label: 'iPhone 6.5" (Face ID, large)', device: 'iphone',
    width: 1284, height: 2778, required: false,
    note: 'Required when there is no 6.9" set',
    fastlaneDir: appleDir,
  },
  {
    id: 'ipad-13', store: 'apple', label: 'iPad 13"', device: 'ipad',
    width: 2064, height: 2752, required: false, note: 'Required if the app runs on iPad',
    fastlaneDir: appleDir,
  },
  {
    id: 'play-phone', store: 'google', label: 'Google Play phone (9:16)', device: 'android-phone',
    width: 1080, height: 1920, required: true, fastlaneDir: playDir('phoneScreenshots'),
  },
  {
    id: 'play-tablet', store: 'google', label: 'Google Play 10" tablet (9:16)', device: 'android-tablet',
    width: 1620, height: 2880, required: false, fastlaneDir: playDir('tenInchScreenshots'),
  },
];

export const LIMITS = {
  apple: { maxScreenshots: 10, minScreenshots: 1 },
  google: { maxScreenshots: 8, minScreenshots: 2, maxSide: 3840, maxRatio: 2, maxCaptionShare: 0.2 },
};

export function target(id: string): Target {
  const t = TARGETS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown target ${id}`);
  return t;
}

// The two stores spell locales differently: Apple "de-DE" / "tr", Play "de-DE" / "tr-TR".
export interface Locale {
  code: string;
  name: string;
  apple: string;
  google: string;
  rtl?: boolean;
}

export const LOCALES: Locale[] = [
  { code: 'en', name: 'English (US)', apple: 'en-US', google: 'en-US' },
  { code: 'en-GB', name: 'English (UK)', apple: 'en-GB', google: 'en-GB' },
  { code: 'tr', name: 'Türkçe', apple: 'tr', google: 'tr-TR' },
  { code: 'de', name: 'Deutsch', apple: 'de-DE', google: 'de-DE' },
  { code: 'fr', name: 'Français', apple: 'fr-FR', google: 'fr-FR' },
  { code: 'es', name: 'Español', apple: 'es-ES', google: 'es-ES' },
  { code: 'es-MX', name: 'Español (México)', apple: 'es-MX', google: 'es-419' },
  { code: 'it', name: 'Italiano', apple: 'it', google: 'it-IT' },
  { code: 'pt-BR', name: 'Português (Brasil)', apple: 'pt-BR', google: 'pt-BR' },
  { code: 'nl', name: 'Nederlands', apple: 'nl-NL', google: 'nl-NL' },
  { code: 'ru', name: 'Русский', apple: 'ru', google: 'ru-RU' },
  { code: 'pl', name: 'Polski', apple: 'pl', google: 'pl-PL' },
  { code: 'ja', name: '日本語', apple: 'ja', google: 'ja-JP' },
  { code: 'ko', name: '한국어', apple: 'ko', google: 'ko-KR' },
  { code: 'zh-Hans', name: '简体中文', apple: 'zh-Hans', google: 'zh-CN' },
  { code: 'zh-Hant', name: '繁體中文', apple: 'zh-Hant', google: 'zh-TW' },
  { code: 'ar', name: 'العربية', apple: 'ar-SA', google: 'ar', rtl: true },
  { code: 'he', name: 'עברית', apple: 'he', google: 'iw-IL', rtl: true },
  { code: 'hi', name: 'हिन्दी', apple: 'hi', google: 'hi-IN' },
  { code: 'id', name: 'Bahasa Indonesia', apple: 'id', google: 'id' },
];

export function locale(code: string): Locale {
  const l = LOCALES.find((x) => x.code === code);
  if (!l) throw new Error(`unknown locale ${code}`);
  return l;
}
