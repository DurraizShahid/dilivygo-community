import { commonEn, commonFr, commonAr, commonEs, commonDe, commonTr, commonPt, commonUr, commonHi, commonFa, commonZh, commonKo, commonJa, commonRu, commonIt, commonEt, commonSw } from "@dilivygo/i18n";
import mobileEn from "./locales/en.json";
import mobileFr from "./locales/fr.json";
import mobileAr from "./locales/ar.json";
import mobileEs from "./locales/es.json";
import mobileDe from "./locales/de.json";
import mobileTr from "./locales/tr.json";
import mobilePt from "./locales/pt.json";
import mobileUr from "./locales/ur.json";
import mobileHi from "./locales/hi.json";
import mobileFa from "./locales/fa.json";
import mobileZh from "./locales/zh.json";
import mobileKo from "./locales/ko.json";
import mobileJa from "./locales/ja.json";
import mobileRu from "./locales/ru.json";
import mobileIt from "./locales/it.json";
import mobileEt from "./locales/et.json";
import mobileSw from "./locales/sw.json";

export const resources = {
  en: { common: commonEn, mobile: mobileEn },
  fr: { common: commonFr, mobile: mobileFr },
  ar: { common: commonAr, mobile: mobileAr },
  es: { common: commonEs, mobile: mobileEs },
  de: { common: commonDe, mobile: mobileDe },
  tr: { common: commonTr, mobile: mobileTr },
  pt: { common: commonPt, mobile: mobilePt },
  ur: { common: commonUr, mobile: mobileUr },
  hi: { common: commonHi, mobile: mobileHi },
  fa: { common: commonFa, mobile: mobileFa },
  zh: { common: commonZh, mobile: mobileZh },
  ko: { common: commonKo, mobile: mobileKo },
  ja: { common: commonJa, mobile: mobileJa },
  ru: { common: commonRu, mobile: mobileRu },
  it: { common: commonIt, mobile: mobileIt },
  et: { common: commonEt, mobile: mobileEt },
  sw: { common: commonSw, mobile: mobileSw },
};

export const ns = ["common", "mobile"];
export const defaultNS = "mobile";
