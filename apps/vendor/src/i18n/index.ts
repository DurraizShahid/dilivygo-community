import {
  commonEn,
  commonFr,
  commonAr,
  commonEs,
  commonDe,
  commonTr,
  commonPt,
  commonUr,
  commonHi,
  commonFa,
  commonZh,
  commonKo,
  commonJa,
  commonRu,
  commonIt,
  commonEt,
  commonSw,
} from "@dilivygo/i18n";
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
  en: { common: commonEn, vendor: appEn },
  fr: { common: commonFr, vendor: appFr },
  ar: { common: commonAr, vendor: appAr },
  es: { common: commonEs, vendor: appEs },
  de: { common: commonDe, vendor: appDe },
  tr: { common: commonTr, vendor: appTr },
  pt: { common: commonPt, vendor: appPt },
  ur: { common: commonUr, vendor: appUr },
  hi: { common: commonHi, vendor: appHi },
  fa: { common: commonFa, vendor: appFa },
  zh: { common: commonZh, vendor: appZh },
  ko: { common: commonKo, vendor: appKo },
  ja: { common: commonJa, vendor: appJa },
  ru: { common: commonRu, vendor: appRu },
  it: { common: commonIt, vendor: appIt },
  et: { common: commonEt, vendor: appEt },
  sw: { common: commonSw, vendor: appSw },
};

export const ns = ["common", "vendor"];
export const defaultNS = "vendor";
