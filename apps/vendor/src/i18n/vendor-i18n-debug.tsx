"use client";

import { useEffect } from "react";
import {
  LANG_STORAGE_KEY,
  useLanguage,
  useTranslation,
} from "@dilivygo/i18n";

/**
 * Development-only: logs active language, i18next instance language, and whether
 * Spanish resource bundles are registered (vendor + common).
 */
export function VendorI18nDebugMount() {
  const { language } = useLanguage();
  const { i18n } = useTranslation("vendor");

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const log = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(LANG_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      const langs = i18n.languages ?? [];
      console.info("[vendor i18n]", {
        contextLanguage: language,
        i18nLanguage: i18n.language,
        i18nResolvedLanguage: i18n.resolvedLanguage,
        storedLanguage: stored,
        i18nLanguages: langs,
        hasEsVendor: i18n.hasResourceBundle("es", "vendor"),
        hasEsCommon: i18n.hasResourceBundle("es", "common"),
      });
    };

    log();
    const onLang = () => log();
    i18n.on("languageChanged", onLang);
    return () => {
      i18n.off("languageChanged", onLang);
    };
  }, [language, i18n]);

  return null;
}
