"use client";

import { useMemo } from "react";
import { isSupportedCountry, type Country } from "react-phone-number-input";
import {
  InternationalPhoneField,
  type InternationalPhoneFieldProps,
} from "@dilivygo/ui/international-phone-field";
import { useLocationStore } from "@/stores/location-store";

type Props = Omit<InternationalPhoneFieldProps, "defaultCountry">;

export function CustomerPhoneField(props: Props) {
  const geoCountry = useLocationStore((s) => s.countryCode);
  const defaultCountry = useMemo((): Country => {
    if (geoCountry && isSupportedCountry(geoCountry)) return geoCountry;
    return "GB";
  }, [geoCountry]);

  return <InternationalPhoneField {...props} defaultCountry={defaultCountry} />;
}
