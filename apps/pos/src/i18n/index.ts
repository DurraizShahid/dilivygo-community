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
  en: { common: commonEn, pos: appEn },
  fr: { common: commonFr, pos: appFr },
  ar: { common: commonAr, pos: appAr },
  es: { common: commonEs, pos: appEs },
  de: { common: commonDe, pos: appDe },
  tr: { common: commonTr, pos: appTr },
  pt: { common: commonPt, pos: appPt },
  ur: { common: commonUr, pos: appUr },
  hi: { common: commonHi, pos: appHi },
  fa: { common: commonFa, pos: appFa },
  zh: { common: commonZh, pos: appZh },
  ko: { common: commonKo, pos: appKo },
  ja: { common: commonJa, pos: appJa },
  ru: { common: commonRu, pos: appRu },
  it: { common: commonIt, pos: appIt },
  et: { common: commonEt, pos: appEt },
  sw: { common: commonSw, pos: appSw },
};

export const ns = ["common", "pos"];
export const defaultNS = "pos";
