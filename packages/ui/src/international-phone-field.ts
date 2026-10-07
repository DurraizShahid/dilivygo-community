/** Client-only entry — do not import from `@dilivygo/ui` root (RSC-safe barrel). */
export {
  InternationalPhoneField,
  type InternationalPhoneFieldProps,
} from "./components/international-phone-field";
export type { Country } from "react-phone-number-input";
export { isValidPhoneNumber } from "react-phone-number-input";
