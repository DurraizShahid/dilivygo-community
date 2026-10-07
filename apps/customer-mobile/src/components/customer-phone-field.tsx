import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  isSupportedCountry,
  type CountryCode,
} from "libphonenumber-js/max";
import { useAppTheme } from "@/providers/theme-provider";
import { fonts } from "@/lib/theme";

function flagEmoji(iso2: string): string {
  const u = iso2.toUpperCase();
  if (u.length !== 2) return "\u{1F3F3}";
  const A = 0x1f1e6;
  const a = u.charCodeAt(0);
  const b = u.charCodeAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return "\u{1F3F3}";
  return String.fromCodePoint(A + a - 65, A + b - 65);
}

type CountryRow = { code: CountryCode; label: string; calling: string };

function buildCountryRows(): CountryRow[] {
  let displayNames: Intl.DisplayNames;
  try {
    displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    displayNames = null as unknown as Intl.DisplayNames;
  }
  const rows = getCountries().map((code) => {
    const c = code as CountryCode;
    let label: string = code;
    try {
      label = String(displayNames?.of(code) ?? code);
    } catch {
      label = code;
    }
    return {
      code: c,
      label,
      calling: getCountryCallingCode(c),
    };
  });
  rows.sort((a, b) => a.label.localeCompare(b.label, "en"));
  return rows;
}

const COUNTRY_ROWS = buildCountryRows();
/** Longest calling codes first so e.g. +1242 wins over +1. */
const COUNTRY_ROWS_BY_CALLING_LEN = [...COUNTRY_ROWS].sort(
  (a, b) => b.calling.length - a.calling.length
);

function defaultCountry(geo: string | null): CountryCode {
  if (geo && isSupportedCountry(geo)) return geo as CountryCode;
  return "GB";
}

function toE164(country: CountryCode, nationalDigits: string): string {
  const digits = nationalDigits.replace(/\D/g, "");
  if (!digits) return "";
  const p = parsePhoneNumberFromString(digits, country);
  if (p?.isValid()) return p.format("E.164");
  return `+${getCountryCallingCode(country)}${digits}`;
}

export function CustomerPhoneField({
  value,
  onChange,
  geoCountryCode,
  error,
  disabled,
  autoFocus,
  placeholder = "Phone number",
}: {
  value: string;
  onChange: (v: string) => void;
  geoCountryCode: string | null;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const [country, setCountry] = useState<CountryCode>(() =>
    defaultCountry(geoCountryCode)
  );
  const [national, setNational] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const syncFromValue = useCallback((v: string) => {
    if (!v?.trim()) {
      setNational("");
      return;
    }
    const p = parsePhoneNumberFromString(v);
    if (p?.country) {
      setCountry(p.country);
      setNational(p.nationalNumber);
      return;
    }
    const stripped = v.replace(/\D/g, "");
    for (const row of COUNTRY_ROWS_BY_CALLING_LEN) {
      const cc = row.calling;
      if (stripped.startsWith(cc)) {
        setCountry(row.code);
        setNational(stripped.slice(cc.length));
        return;
      }
    }
  }, []);

  const skipSyncFromParent = useRef(false);

  useEffect(() => {
    if (skipSyncFromParent.current) {
      skipSyncFromParent.current = false;
      return;
    }
    syncFromValue(value);
  }, [value, syncFromValue]);

  useEffect(() => {
    if (value) return;
    setCountry(defaultCountry(geoCountryCode));
  }, [geoCountryCode, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_ROWS;
    return COUNTRY_ROWS.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.calling.includes(q.replace(/^\+/, ""))
    );
  }, [query]);

  function applyNational(digits: string) {
    const d = digits.replace(/\D/g, "");
    setNational(d);
    skipSyncFromParent.current = true;
    onChange(toE164(country, d));
  }

  function pickCountry(c: CountryCode) {
    setCountry(c);
    setPickerOpen(false);
    setQuery("");
    skipSyncFromParent.current = true;
    onChange(toE164(c, national));
  }

  const borderColor = error ? colors.destructive : colors.border;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.row,
          {
            borderColor,
            backgroundColor: colors.background,
            shadowColor: "#000",
          },
        ]}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Country calling code"
          disabled={disabled}
          onPress={() => !disabled && setPickerOpen(true)}
          style={[
            styles.countryBtn,
            { borderRightColor: colors.border },
            disabled && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.flag}>{flagEmoji(country)}</Text>
          <Text
            style={[styles.calling, { color: colors.mutedForeground }]}
          >{`+${getCountryCallingCode(country)}`}</Text>
          <Ionicons
            name="chevron-down"
            size={16}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
        <TextInput
          style={[
            styles.input,
            {
              color: colors.foreground,
              fontFamily: fonts.regular,
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType="phone-pad"
          editable={!disabled}
          autoFocus={autoFocus}
          autoComplete="tel"
          value={national}
          onChangeText={applyNational}
        />
      </View>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View
          style={[
            styles.modalRoot,
            {
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 12,
              backgroundColor: colors.background,
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Country or region
            </Text>
            <Pressable
              onPress={() => {
                setPickerOpen(false);
                setQuery("");
              }}
              hitSlop={12}
            >
              <Text style={[styles.doneBtn, { color: colors.primary }]}>
                Done
              </Text>
            </Pressable>
          </View>
          <View
            style={[
              styles.searchRow,
              {
                backgroundColor: colors.muted,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name="search"
              size={18}
              color={colors.mutedForeground}
              style={styles.searchIcon}
            />
            <TextInput
              style={[
                styles.searchInput,
                { color: colors.foreground, fontFamily: fonts.regular },
              ]}
              placeholder="Search"
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: windowH * 0.62 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pickCountry(item.code)}
                style={({ pressed }) => [
                  styles.listRow,
                  pressed && { backgroundColor: colors.muted },
                  item.code === country && {
                    backgroundColor: colors.muted,
                  },
                ]}
              >
                <Text style={styles.listFlag}>{flagEmoji(item.code)}</Text>
                <Text
                  style={[styles.listLabel, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
                <Text
                  style={[styles.listCalling, { color: colors.mutedForeground }]}
                >{`+${item.calling}`}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  countryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRightWidth: 1,
    maxWidth: "42%",
  },
  flag: { fontSize: 20, lineHeight: 24 },
  calling: { fontSize: 13, fontWeight: "600" },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
  },
  modalRoot: { flex: 1, paddingHorizontal: 16 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  doneBtn: { fontSize: 16, fontWeight: "600" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 10,
    borderRadius: 10,
  },
  listFlag: { fontSize: 22, width: 36, textAlign: "center" },
  listLabel: { flex: 1, fontSize: 16 },
  listCalling: { fontSize: 14, fontWeight: "600", minWidth: 48, textAlign: "right" },
});
