"use client";

import { useMemo } from "react";
import PhoneInput, {
  type FlagProps,
  type Country,
  isSupportedCountry,
  getCountryCallingCode,
} from "react-phone-number-input";
import enLabels from "react-phone-number-input/locale/en.json";
import "react-phone-number-input/style.css";
import ReactCountryFlag from "react-country-flag";
import { cn } from "../lib/utils";
import { Select, SelectTrigger, SelectContent, SelectItem } from "./select";

type PhoneFlagProps = FlagProps & { className?: string };

function PhoneCountryFlag({ country, countryName, className }: PhoneFlagProps) {
  return (
    <span className="flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-muted/30 shadow-sm">
      <ReactCountryFlag
        countryCode={country}
        svg
        className={cn("!block !h-full !w-full object-cover object-center", className)}
        title={countryName}
        aria-label={countryName}
      />
    </span>
  );
}

interface CountrySelectProps {
  value?: Country;
  onChange: (country: Country) => void;
  options: Array<{ value?: Country; label: string; divider?: boolean }>;
  iconComponent: React.ComponentType<{ country: Country; label: string }>;
  disabled?: boolean;
  name?: string;
  "aria-label"?: string;
}

function CountrySelect({
  value,
  onChange,
  options,
  iconComponent: Icon,
  disabled,
  ...rest
}: CountrySelectProps) {
  const countryOptions = useMemo(
    () => options.filter((o): o is { value: Country; label: string } => !!o.value && !o.divider),
    [options]
  );

  const selectedLabel = value
    ? countryOptions.find((o) => o.value === value)?.label || ""
    : "";

  return (
    <Select
      value={value || ""}
      onValueChange={(v) => onChange(v as Country)}
      disabled={disabled}
    >
      <SelectTrigger
        className="h-full w-auto gap-1 rounded-none border-0 bg-transparent px-2 shadow-none focus:ring-0"
        aria-label={rest["aria-label"]}
      >
        {value ? (
          <>
            <Icon country={value} label={selectedLabel} />
            <span className="text-xs text-muted-foreground">
              +{getCountryCallingCode(value)}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Select</span>
        )}
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {countryOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              <Icon country={option.value} label={option.label} />
              <span>{option.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                +{getCountryCallingCode(option.value)}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type InternationalPhoneFieldProps = {
  id: string;
  value: string;
  onChange: (v: string) => void;
  /** When set, used as the initial country; also applied when `value` is empty. */
  defaultCountry?: Country;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  className?: string;
  numberPlaceholder?: string;
  numberInputClassName?: string;
};

const FALLBACK_COUNTRY: Country = "GB";

export function InternationalPhoneField({
  id,
  value,
  onChange,
  defaultCountry: defaultCountryProp,
  error,
  disabled,
  autoFocus,
  required,
  className,
  numberPlaceholder,
  numberInputClassName,
}: InternationalPhoneFieldProps) {
  const defaultCountry = useMemo(() => {
    if (defaultCountryProp && isSupportedCountry(defaultCountryProp)) return defaultCountryProp;
    return FALLBACK_COUNTRY;
  }, [defaultCountryProp]);

  return (
    <PhoneInput
      id={id}
      name={id}
      international
      defaultCountry={defaultCountry}
      value={value || undefined}
      onChange={(v) => onChange(v ?? "")}
      flagComponent={PhoneCountryFlag}
      countrySelectComponent={CountrySelect}
      labels={enLabels}
      limitMaxLength
      countryCallingCodeEditable={false}
      disabled={disabled}
      autoFocus={autoFocus}
      required={required}
      autoComplete="tel"
      aria-invalid={error}
      className={cn(
        "h-10 w-full rounded-xl border border-input bg-background pl-1 shadow-sm transition-colors",
        "focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/25",
        error && "border-destructive/50 focus-within:ring-destructive/30",
        "[--PhoneInputCountryFlag-height:1.375rem] [--PhoneInputCountryFlag-aspectRatio:1]",
        "[--PhoneInputCountrySelect-marginRight:0.25rem]",
        "[&_.PhoneInputCountry]:items-center [&_.PhoneInputCountry]:gap-0.5",
        "[&_.PhoneInputCountryIcon]:flex [&_.PhoneInputCountryIcon]:shrink-0 [&_.PhoneInputCountryIcon]:items-center [&_.PhoneInputCountryIcon]:justify-center",
        "[&_.PhoneInputCountrySelectArrow]:shrink-0 [&_.PhoneInputCountrySelectArrow]:self-center",
        className
      )}
      numberInputProps={{
        placeholder: numberPlaceholder,
        className: cn(
          "!h-10 min-h-0 flex-1 border-0 bg-transparent px-2 py-0 text-sm shadow-none placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-0",
          numberInputClassName,
        ),
      }}
    />
  );
}
