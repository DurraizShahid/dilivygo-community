import { useEffect, type ReactNode } from "react";
import { I18nManager, Platform } from "react-native";
import * as Localization from "expo-localization";
import { I18nProvider, useLanguage } from "@dilivygo/i18n";
import type { LanguageConfig } from "@dilivygo/i18n";
import { useCurrencyStore } from "@/lib/currency";
import { resources, ns, defaultNS } from "./index";

function NativeRtlSync() {
  const { direction } = useLanguage();
  useEffect(() => {
    if (Platform.OS === "web") return;
    I18nManager.allowRTL(true);
    void I18nManager.forceRTL(direction === "rtl");
  }, [direction]);
  return null;
}

export function MobileI18nRoot({ children }: { children: ReactNode }) {
  const languageConfig = useCurrencyStore((s) => s.languageConfig);
  const deviceLocale = Localization.getLocales()[0]?.languageCode ?? undefined;

  const cfg: LanguageConfig | undefined = languageConfig
    ? {
        defaultLanguage: languageConfig.defaultLanguage as LanguageConfig["defaultLanguage"],
        locked: languageConfig.locked,
      }
    : undefined;

  return (
    <I18nProvider
      languageConfig={cfg}
      resources={resources}
      defaultNS={defaultNS}
      ns={ns}
      deviceLocale={deviceLocale}
    >
      <NativeRtlSync />
      {children}
    </I18nProvider>
  );
}
