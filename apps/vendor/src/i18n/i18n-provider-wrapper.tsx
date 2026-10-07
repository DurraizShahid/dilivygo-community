"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "@dilivygo/i18n";
import { useLanguageConfigFromTheme } from "@dilivygo/ui";
import { resources, ns, defaultNS } from "@/i18n";
import type { LanguageConfig } from "@dilivygo/i18n";
import { VendorI18nDebugMount } from "@/i18n/vendor-i18n-debug";

export function I18nWrapper({ children }: { children: ReactNode }) {
  const themeLanguageConfig = useLanguageConfigFromTheme();

  const languageConfig: LanguageConfig | undefined = themeLanguageConfig
    ? {
        defaultLanguage: themeLanguageConfig.defaultLanguage as LanguageConfig["defaultLanguage"],
        locked: themeLanguageConfig.locked,
      }
    : undefined;

  return (
    <I18nProvider
      languageConfig={languageConfig}
      resources={resources}
      defaultNS={defaultNS}
      ns={ns}
    >
      {process.env.NODE_ENV === "development" ? <VendorI18nDebugMount /> : null}
      {children}
    </I18nProvider>
  );
}
