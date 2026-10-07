"use client";

import { useMemo, type ReactNode } from "react";
import { I18nProvider } from "@dilivygo/i18n";
import { useLanguageConfigFromTheme } from "@dilivygo/ui";
import { resources, ns, defaultNS } from "@/i18n";
import type { LanguageConfig } from "@dilivygo/i18n";

export function I18nWrapper({ children }: { children: ReactNode }) {
  const themeLanguageConfig = useLanguageConfigFromTheme();

  const languageConfig = useMemo((): LanguageConfig | undefined => {
    if (!themeLanguageConfig) return undefined;
    return {
      defaultLanguage: themeLanguageConfig.defaultLanguage as LanguageConfig["defaultLanguage"],
      locked: themeLanguageConfig.locked,
    };
  }, [themeLanguageConfig?.defaultLanguage, themeLanguageConfig?.locked]);

  return (
    <I18nProvider
      languageConfig={languageConfig}
      resources={resources}
      defaultNS={defaultNS}
      ns={ns}
    >
      {children}
    </I18nProvider>
  );
}
