export type SupportedLanguage = "en" | "fr" | "ar" | "es" | "de" | "tr" | "pt" | "ur" | "hi" | "fa" | "zh" | "ko" | "ja" | "ru" | "it" | "et" | "sw";

export interface LanguageConfig {
  defaultLanguage: SupportedLanguage;
  locked: boolean;
}

export interface LanguageInfo {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  dir: "ltr" | "rtl";
  flag: string;
}

export type TranslationResources = Record<
  string,
  Record<string, Record<string, unknown>>
>;
