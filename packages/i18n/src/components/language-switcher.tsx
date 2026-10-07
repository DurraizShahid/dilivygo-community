"use client";

import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@dilivygo/ui";
import { useLanguage } from "../provider";
import { LANGUAGE_LIST } from "../languages";
import type { SupportedLanguage } from "../types";

/**
 * Styled language switcher using @dilivygo/ui Select.
 * Apps can override with their own styled component using useLanguage().
 */
export function LanguageSwitcher({
  className,
}: {
  className?: string;
}) {
  const { language, locked, setLanguage } = useLanguage();

  if (locked) return null;

  return (
    <Select
      value={language}
      onValueChange={(v) => setLanguage(v as SupportedLanguage)}
    >
      <SelectTrigger className={className} aria-label="Select language">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGE_LIST.map((l) => (
          <SelectItem key={l.code} value={l.code}>
            {l.nativeName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
