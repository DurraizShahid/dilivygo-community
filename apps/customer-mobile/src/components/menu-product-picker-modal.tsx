import { useMemo, useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type {
  Product,
  ProductVariant,
  ModifierGroup,
  ModifierOption,
  SelectedModifier,
} from "@dilivygo/types";
import { formatPrice } from "@/lib/currency";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";

type Props = {
  visible: boolean;
  product: Product | null;
  currency?: string;
  onClose: () => void;
  onAdd: (payload: {
    quantity: number;
    unitPriceCents: number;
    selectedModifiers: SelectedModifier[];
    productVariantId?: string;
    lineName?: string;
  }) => void;
};

export function MenuProductPickerModal({
  visible,
  product,
  currency,
  onClose,
  onAdd,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const variants = useMemo(
    () =>
      [...(product?.variants ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
    [product?.variants]
  );
  const hasVariants = variants.length > 0;

  const groups = useMemo(
    () =>
      [...(product?.modifierGroups ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
    [product?.modifierGroups]
  );

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null
  );
  const [selections, setSelections] = useState<Record<string, Set<string>>>(
    {}
  );
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!visible || !product) return;
    const v = [...(product.variants ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    const first = v.find((x) => x.available) ?? v[0];
    setSelectedVariantId(first?.id ?? null);
    setQuantity(1);
    const init: Record<string, Set<string>> = {};
    for (const g of product.modifierGroups ?? []) {
      const defaults = g.options
        .filter((o) => o.isDefault)
        .map((o) => o.id);
      init[g.id] = new Set(defaults);
    }
    setSelections(init);
  }, [visible, product?.id, product]);

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) ?? null,
    [variants, selectedVariantId]
  );

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const g of groups) {
      const count = selections[g.id]?.size ?? 0;
      if (g.required && count < g.minSelections) {
        errors[g.id] =
          g.minSelections === 1
            ? "Required"
            : `Select at least ${g.minSelections}`;
      }
    }
    return errors;
  }, [groups, selections]);

  const variantOk =
    !hasVariants ||
    (Boolean(selectedVariantId) && Boolean(selectedVariant?.available));

  const isValid = Object.keys(validationErrors).length === 0 && variantOk;

  const modifierTotal = useMemo(() => {
    let total = 0;
    for (const g of groups) {
      for (const optId of selections[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) total += opt.priceCents;
      }
    }
    return total;
  }, [groups, selections]);

  const baseUnit =
    hasVariants && selectedVariant
      ? selectedVariant.priceCents
      : product?.priceCents ?? 0;
  const unitPrice = baseUnit + modifierTotal;
  const lineTotal = unitPrice * quantity;

  function toggleOption(group: ModifierGroup, option: ModifierOption) {
    setSelections((prev) => {
      const next = { ...prev };
      const set = new Set(prev[group.id] ?? []);
      if (group.maxSelections === 1) {
        if (set.has(option.id)) {
          if (!group.required) set.delete(option.id);
        } else {
          set.clear();
          set.add(option.id);
        }
      } else {
        if (set.has(option.id)) {
          set.delete(option.id);
        } else if (set.size < group.maxSelections) {
          set.add(option.id);
        }
      }
      next[group.id] = set;
      return next;
    });
  }

  function submit() {
    if (!product || !isValid) return;
    const selectedModifiers: SelectedModifier[] = [];
    for (const g of groups) {
      for (const optId of selections[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) {
          selectedModifiers.push({
            groupName: g.name,
            optionName: opt.name,
            priceCents: opt.priceCents,
            modifierOptionId: opt.id,
          });
        }
      }
    }
    const lineName =
      hasVariants && selectedVariant
        ? `${product.name} — ${selectedVariant.name}`
        : undefined;
    onAdd({
      quantity,
      unitPriceCents: unitPrice,
      selectedModifiers,
      productVariantId: hasVariants ? selectedVariantId ?? undefined : undefined,
      lineName,
    });
    onClose();
  }

  if (!product) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{product.name}</Text>
              {product.description ? (
                <Text style={styles.desc} numberOfLines={3}>
                  {product.description}
                </Text>
              ) : null}
              <Text style={styles.priceLine}>
                {formatPrice(unitPrice, currency)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={26} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {hasVariants && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Option</Text>
                {!variantOk ? (
                  <Text style={styles.errorText}>Select an available option</Text>
                ) : null}
                {variants.map((v: ProductVariant) => {
                  const sel = v.id === selectedVariantId;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[styles.row, sel && styles.rowSelected, !v.available && styles.rowDisabled]}
                      disabled={!v.available}
                      onPress={() => setSelectedVariantId(v.id)}
                    >
                      <Ionicons
                        name={sel ? "radio-button-on" : "radio-button-off"}
                        size={22}
                        color={sel ? colors.primary : colors.mutedForeground}
                      />
                      <Text style={[styles.rowLabel, { flex: 1 }]}>
                        {v.name}
                        {!v.available ? " (Unavailable)" : ""}
                      </Text>
                      <Text style={styles.rowMeta}>{formatPrice(v.priceCents, currency)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {groups.map((group) => {
              const isSingle = group.maxSelections === 1;
              const selected = selections[group.id] ?? new Set();
              const err = validationErrors[group.id];
              return (
                <View key={group.id} style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    {group.name}
                    {group.required ? " *" : ""}
                  </Text>
                  {err ? <Text style={styles.errorText}>{err}</Text> : null}
                  {[...group.options]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((option) => {
                      const on = selected.has(option.id);
                      return (
                        <TouchableOpacity
                          key={option.id}
                          style={[styles.row, on && styles.rowSelected]}
                          onPress={() => toggleOption(group, option)}
                        >
                          <Ionicons
                            name={isSingle ? (on ? "radio-button-on" : "radio-button-off") : on ? "checkbox" : "square-outline"}
                            size={22}
                            color={on ? colors.primary : colors.mutedForeground}
                          />
                          <Text style={[styles.rowLabel, { flex: 1 }]}>{option.name}</Text>
                          {option.priceCents > 0 ? (
                            <Text style={styles.rowMeta}>+{formatPrice(option.priceCents, currency)}</Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Ionicons name="remove" size={20} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{quantity}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity((q) => q + 1)}>
                <Ionicons name="add" size={20} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={styles.totalText}>{formatPrice(lineTotal, currency)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.addBtn, !isValid && styles.addBtnDisabled]}
              disabled={!isValid}
              onPress={submit}
            >
              <Text style={styles.addBtnText}>Add to cart</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    sheet: {
      maxHeight: "88%",
      backgroundColor: colors.background,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    title: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.foreground,
    },
    desc: {
      marginTop: 4,
      fontSize: fontSize.sm,
      color: colors.mutedForeground,
    },
    priceLine: {
      marginTop: 6,
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.primary,
    },
    scroll: { maxHeight: 420 },
    section: { marginBottom: spacing.lg },
    sectionTitle: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      color: colors.mutedForeground,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
      marginBottom: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowSelected: {
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}12`,
    },
    rowDisabled: { opacity: 0.45 },
    rowLabel: { fontSize: fontSize.sm, color: colors.foreground },
    rowMeta: { fontSize: fontSize.sm, color: colors.mutedForeground },
    errorText: { color: colors.destructive, fontSize: fontSize.xs, marginBottom: 6 },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: spacing.md,
    },
    qtyRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    qtyBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    qtyText: { fontFamily: fonts.bold, fontSize: fontSize.lg, minWidth: 28, textAlign: "center" },
    totalText: { marginLeft: "auto", fontFamily: fonts.bold, fontSize: fontSize.base },
    addBtn: {
      backgroundColor: colors.primary,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      alignItems: "center",
    },
    addBtnDisabled: { opacity: 0.45 },
    addBtnText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.primaryForeground,
    },
  });
}
