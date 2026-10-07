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

import customerEn from "../../../customer/src/i18n/locales/en.json";
import customerFr from "../../../customer/src/i18n/locales/fr.json";
import customerAr from "../../../customer/src/i18n/locales/ar.json";
import customerEs from "../../../customer/src/i18n/locales/es.json";
import customerDe from "../../../customer/src/i18n/locales/de.json";
import customerTr from "../../../customer/src/i18n/locales/tr.json";
import customerPt from "../../../customer/src/i18n/locales/pt.json";
import customerUr from "../../../customer/src/i18n/locales/ur.json";
import customerHi from "../../../customer/src/i18n/locales/hi.json";
import customerFa from "../../../customer/src/i18n/locales/fa.json";
import customerZh from "../../../customer/src/i18n/locales/zh.json";
import customerKo from "../../../customer/src/i18n/locales/ko.json";
import customerJa from "../../../customer/src/i18n/locales/ja.json";
import customerRu from "../../../customer/src/i18n/locales/ru.json";
import customerIt from "../../../customer/src/i18n/locales/it.json";
import customerEt from "../../../customer/src/i18n/locales/et.json";
import customerSw from "../../../customer/src/i18n/locales/sw.json";

export const resources = {
  en: { common: commonEn, mobile: mobileEn, customer: customerEn },
  fr: { common: commonFr, mobile: mobileFr, customer: customerFr },
  ar: { common: commonAr, mobile: mobileAr, customer: customerAr },
  es: { common: commonEs, mobile: mobileEs, customer: customerEs },
  de: { common: commonDe, mobile: mobileDe, customer: customerDe },
  tr: { common: commonTr, mobile: mobileTr, customer: customerTr },
  pt: { common: commonPt, mobile: mobilePt, customer: customerPt },
  ur: { common: commonUr, mobile: mobileUr, customer: customerUr },
  hi: { common: commonHi, mobile: mobileHi, customer: customerHi },
  fa: { common: commonFa, mobile: mobileFa, customer: customerFa },
  zh: { common: commonZh, mobile: mobileZh, customer: customerZh },
  ko: { common: commonKo, mobile: mobileKo, customer: customerKo },
  ja: { common: commonJa, mobile: mobileJa, customer: customerJa },
  ru: { common: commonRu, mobile: mobileRu, customer: customerRu },
  it: { common: commonIt, mobile: mobileIt, customer: customerIt },
  et: { common: commonEt, mobile: mobileEt, customer: customerEt },
  sw: { common: commonSw, mobile: mobileSw, customer: customerSw },
};

export const ns = ["common", "mobile", "customer"];
export const defaultNS = "mobile";
