import { commonEn, commonFr, commonAr, commonEs, commonDe, commonTr, commonPt, commonUr, commonHi, commonFa, commonZh, commonKo, commonJa, commonRu, commonIt, commonEt, commonSw } from "@dilivygo/i18n";
import appEn from "./locales/en.json";
import appFr from "./locales/fr.json";
import appAr from "./locales/ar.json";
import appEs from "./locales/es.json";
import appDe from "./locales/de.json";
import appTr from "./locales/tr.json";
import appPt from "./locales/pt.json";
import appUr from "./locales/ur.json";
import appHi from "./locales/hi.json";
import appFa from "./locales/fa.json";
import appZh from "./locales/zh.json";
import appKo from "./locales/ko.json";
import appJa from "./locales/ja.json";
import appRu from "./locales/ru.json";
import appIt from "./locales/it.json";
import appEt from "./locales/et.json";
import appSw from "./locales/sw.json";

export const resources = {
  en: { common: commonEn, customer: appEn },
  fr: { common: commonFr, customer: appFr },
  ar: { common: commonAr, customer: appAr },
  es: { common: commonEs, customer: appEs },
  de: { common: commonDe, customer: appDe },
  tr: { common: commonTr, customer: appTr },
  pt: { common: commonPt, customer: appPt },
  ur: { common: commonUr, customer: appUr },
  hi: { common: commonHi, customer: appHi },
  fa: { common: commonFa, customer: appFa },
  zh: { common: commonZh, customer: appZh },
  ko: { common: commonKo, customer: appKo },
  ja: { common: commonJa, customer: appJa },
  ru: { common: commonRu, customer: appRu },
  it: { common: commonIt, customer: appIt },
  et: { common: commonEt, customer: appEt },
  sw: { common: commonSw, customer: appSw },
};

export const ns = ["common", "customer"];
export const defaultNS = "customer";
