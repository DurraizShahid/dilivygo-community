import type { SupportedLanguage } from "./types";
import { isSupportedLanguage } from "./languages";

export const LANG_STORAGE_KEY = "dilivygo-lang";
export const LANG_USER_PICKED_KEY = "dilivygo-lang-user-picked";

export function markLanguageUserPicked(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LANG_USER_PICKED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isLanguageUserPicked(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(LANG_USER_PICKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function readStoredLanguage(): SupportedLanguage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const val = localStorage.getItem(LANG_STORAGE_KEY);
    if (val && isSupportedLanguage(val)) return val;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredLanguage(lang: SupportedLanguage): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}
