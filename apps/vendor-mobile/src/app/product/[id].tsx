import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { api } from "@/lib/api";
import { formatPrice, useCurrencyStore } from "@/lib/currency";
import { DIETARY_TAG_OPTIONS, type Product, type Category, type DietaryTag, type ProductVariant } from "@dilivygo/types";
import { MobileImageUpload } from "@/components/image-upload";
import { useShopStore } from "@/stores/shop-store";

function createEditProductFormStyles(c: AppColors) {
  return {
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.xl, gap: spacing.lg },
    muted: { color: c.mutedForeground },
    field: { gap: spacing.xs },
    label: { fontSize: fontSize.sm, fontWeight: "600" as const, color: c.foreground },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      color: c.foreground,
    },
    multiline: { minHeight: 90, textAlignVertical: "top" as const },
    picker: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
    },
    pickerText: { color: c.foreground, fontSize: fontSize.base },
    tagWrap: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: spacing.sm },
    tag: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: borderRadius.full,
      backgroundColor: c.card,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
    },
    tagActive: { borderColor: c.primary, backgroundColor: c.primary + "1A" },
    tagText: { color: c.foreground, fontSize: fontSize.sm, fontWeight: "600" as const },
    tagTextActive: { color: c.primary },
    toggle: {
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.md,
      alignItems: "center" as const,
      borderWidth: 1,
    },
    toggleOn: { backgroundColor: c.success + "22", borderColor: c.success },
    toggleOff: { backgroundColor: c.muted, borderColor: c.border },
    toggleText: { color: c.foreground, fontWeight: "700" as const },
    primary: {
      backgroundColor: c.primary,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.md + 2,
      alignItems: "center" as const,
    },
    danger: {
      backgroundColor: c.destructive,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.md + 2,
      alignItems: "center" as const,
    },
    disabled: { opacity: 0.6 },
    primaryText: { color: c.primaryForeground, fontWeight: "700" as const, fontSize: fontSize.base },
    dangerText: { color: "#fff", fontWeight: "700" as const, fontSize: fontSize.base },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center" as const,
      padding: spacing.xl,
    },
    modalCard: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: c.border,
      maxHeight: "70%" as const,
    },
    modalTitle: { fontSize: fontSize.lg, fontWeight: "700" as const, color: c.foreground, marginBottom: spacing.md },
    modalRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
    modalRowText: { color: c.foreground, fontSize: fontSize.base },
    mutedText: { color: c.mutedForeground, paddingVertical: spacing.md },
    modalClose: {
      marginTop: spacing.md,
      backgroundColor: c.muted,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.md,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: c.border,
    },
    modalCloseText: { color: c.foreground, fontWeight: "700" as const },
    sectionTitle: {
      fontSize: fontSize.lg,
      fontWeight: "700" as const,
      color: c.foreground,
      marginTop: spacing.lg,
    },
    variantCard: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      backgroundColor: c.card,
    },
    variantCardTitle: { fontSize: fontSize.base, fontWeight: "700" as const, color: c.foreground },
    variantCardMeta: { fontSize: fontSize.sm, color: c.mutedForeground, marginTop: spacing.xs },
    variantActions: { flexDirection: "row" as const, gap: spacing.sm, marginTop: spacing.md },
    outlineBtn: {
      flex: 1,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.sm,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.muted,
    },
    outlineBtnText: { color: c.foreground, fontWeight: "600" as const, fontSize: fontSize.sm },
  };
}

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createEditProductFormStyles);
  const activeShopId = useShopStore((s) => s.activeShop?.id);
  const currencyCode = useCurrencyStore((s) => s.code);

  const { data, isLoading } = useQuery<{ products: Product[] }>({
    queryKey: ["vendor-products", activeShopId],
    queryFn: () => api.catalog.listProducts(undefined, activeShopId),
    enabled: !!activeShopId,
  });

  const { data: catRes } = useQuery<{ categories: Category[] }>({
    queryKey: ["catalog", "categories", activeShopId],
    queryFn: () => api.catalog.listCategories(activeShopId),
    enabled: !!activeShopId,
  });

  const product = useMemo(
    () => (data?.products ?? []).find((p) => p.id === id) ?? null,
    [data, id]
  );

  const sortedVariants = useMemo((): ProductVariant[] => {
    const v = product?.variants ?? [];
    return v.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [product]);

  const [name, setName] = useState("");
  const [priceCents, setPriceCents] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [available, setAvailable] = useState(true);
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>([]);
  const [barcode, setBarcode] = useState("");
  const [sku, setSku] = useState("");
  const [sortOrderStr, setSortOrderStr] = useState("");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [variantEditingId, setVariantEditingId] = useState<string | null>(null);
  const [vfName, setVfName] = useState("");
  const [vfPrice, setVfPrice] = useState("");
  const [vfSku, setVfSku] = useState("");
  const [vfBarcode, setVfBarcode] = useState("");
  const [vfImageUrl, setVfImageUrl] = useState("");
  const [vfStock, setVfStock] = useState("");
  const [vfAvailable, setVfAvailable] = useState(true);
  const categoryOptions = useMemo(
    () => (catRes?.categories ?? []).map((c) => c.name).sort(),
    [catRes]
  );
  useEffect(() => {
    if (!product) return;
    setName(product.name ?? "");
    setPriceCents(String(product.priceCents ?? ""));
    setCategory(product.category ?? "");
    setImageUrl(product.imageUrl ?? "");
    setDescription(product.description ?? "");
    setAvailable(!!product.available);
    setDietaryTags(product.dietaryTags ?? []);
    setBarcode(product.barcode ?? "");
    setSku(product.sku ?? "");
    setSortOrderStr(
      product.sortOrder != null && Number.isFinite(product.sortOrder)
        ? String(product.sortOrder)
        : ""
    );
  }, [product]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const so = sortOrderStr.trim();
      let sortOrder: number | undefined;
      if (so !== "") {
        const n = Number(so);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 10_000) {
          throw new Error("Menu order must be a whole number from 0 to 10000.");
        }
        sortOrder = n;
      }
      return api.catalog.updateProduct(
        id!,
        {
          name: name.trim(),
          priceCents: Number(priceCents),
          category: category.trim() || null,
          imageUrl: imageUrl.trim() || null,
          description: description.trim() || null,
          barcode: barcode.trim() || null,
          sku: sku.trim() || null,
          ...(sortOrder !== undefined ? { sortOrder } : {}),
          available,
          dietaryTags,
        },
        activeShopId
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["vendor-products", activeShopId] });
      await qc.invalidateQueries({ queryKey: ["catalog", "categories", activeShopId] });
      router.back();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Failed to update product";
      Alert.alert("Error", message);
    },
  });

  function toggleDietaryTag(tag: DietaryTag) {
    setDietaryTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function openVariantModal(v?: ProductVariant) {
    if (v) {
      setVariantEditingId(v.id);
      setVfName(v.name);
      setVfPrice(String(v.priceCents));
      setVfSku(v.sku ?? "");
      setVfBarcode(v.barcode ?? "");
      setVfImageUrl(v.imageUrl ?? "");
      setVfStock(
        v.stockQuantity != null && Number.isFinite(v.stockQuantity) ? String(v.stockQuantity) : ""
      );
      setVfAvailable(!!v.available);
    } else {
      setVariantEditingId(null);
      setVfName("");
      setVfPrice("");
      setVfSku("");
      setVfBarcode("");
      setVfImageUrl("");
      setVfStock("");
      setVfAvailable(true);
    }
    setVariantModalOpen(true);
  }

  const variantSaveMutation = useMutation({
    mutationFn: async () => {
      const pc = Number(vfPrice);
      if (!vfName.trim() || !Number.isFinite(pc) || pc < 0) {
        throw new Error("Variant name and a valid price (cents) are required.");
      }
      const stockRaw = vfStock.trim();
      const payload = {
        name: vfName.trim(),
        priceCents: Math.floor(pc),
        sku: vfSku.trim() || null,
        barcode: vfBarcode.trim() || null,
        imageUrl: vfImageUrl.trim() || null,
        available: vfAvailable,
        stockQuantity: stockRaw === "" ? null : Math.max(0, Math.floor(Number(stockRaw))),
      };
      if (variantEditingId) {
        return api.catalog.updateProductVariant(variantEditingId, payload, activeShopId);
      }
      return api.catalog.createProductVariant(id!, payload, activeShopId);
    },
    onSuccess: async () => {
      setVariantModalOpen(false);
      await qc.invalidateQueries({ queryKey: ["vendor-products", activeShopId] });
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Failed to save variant";
      Alert.alert("Error", message);
    },
  });

  const variantDeleteMutation = useMutation({
    mutationFn: (variantId: string) => api.catalog.deleteProductVariant(variantId, activeShopId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["vendor-products", activeShopId] });
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Failed to delete variant";
      Alert.alert("Error", message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.catalog.deleteProduct(id!, activeShopId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["vendor-products", activeShopId] });
      await qc.invalidateQueries({ queryKey: ["catalog", "categories", activeShopId] });
      router.back();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Failed to delete product";
      Alert.alert("Error", message);
    },
  });

  const title = product ? `Edit ${product.name}` : "Edit Product";

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        {children}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground },
          headerShadowVisible: false,
        }}
      />

      {isLoading ? (
        <View style={styles.content}>
          <Text style={styles.muted}>Loading...</Text>
        </View>
      ) : !activeShopId ? (
        <View style={styles.content}>
          <Text style={styles.muted}>Select a shop to edit the menu.</Text>
        </View>
      ) : !product ? (
        <View style={styles.content}>
          <Text style={styles.muted}>Product not found</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Field label="Name">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Burger"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
            />
          </Field>
          <Field label="Price (cents)">
            <TextInput
              value={priceCents}
              onChangeText={(v) => setPriceCents(v.replace(/[^\d]/g, ""))}
              placeholder="e.g. 1299"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              style={styles.input}
            />
          </Field>
          <Field label="Category (optional)">
            <TouchableOpacity
              style={styles.picker}
              activeOpacity={0.8}
              onPress={() => setCategoryPickerOpen(true)}
            >
              <Text style={styles.pickerText}>
                {category.trim() ? category : categoryOptions.length ? "Select a category" : "Type a category"}
              </Text>
            </TouchableOpacity>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="Or type a category"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
            />
          </Field>
          <Field label="Barcode (optional)">
            <TextInput
              value={barcode}
              onChangeText={setBarcode}
              placeholder="e.g. UPC / EAN"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={64}
            />
          </Field>
          <Field label="SKU (optional)">
            <TextInput
              value={sku}
              onChangeText={setSku}
              placeholder="Internal code"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={64}
            />
          </Field>
          <MobileImageUpload
            value={imageUrl || null}
            onChange={(url) => setImageUrl(url ?? "")}
            disabled={updateMutation.isPending}
          />
          <Field label="Description (optional)">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Short description"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, styles.multiline]}
              multiline
            />
          </Field>
          <Field label="Menu order (optional)">
            <TextInput
              value={sortOrderStr}
              onChangeText={(v) => setSortOrderStr(v.replace(/[^\d]/g, ""))}
              placeholder="Lower numbers appear first (0–10000)"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              style={styles.input}
            />
            <Text style={[styles.muted, { fontSize: fontSize.xs, marginTop: spacing.xs }]}>
              Leave blank to keep the current order. Matches vendor web / POS catalog sorting.
            </Text>
          </Field>
          <Field label="Dietary / Allergy tags">
            <View style={styles.tagWrap}>
              {DIETARY_TAG_OPTIONS.map((tag) => {
                const selected = dietaryTags.includes(tag.value);
                return (
                  <TouchableOpacity
                    key={tag.value}
                    style={[styles.tag, selected && styles.tagActive]}
                    onPress={() => toggleDietaryTag(tag.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tagText, selected && styles.tagTextActive]}>
                      {tag.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Field>

          <Text style={styles.sectionTitle}>Variants</Text>
          <Text style={[styles.muted, { fontSize: fontSize.xs, marginBottom: spacing.md }]}>
            Optional sellable SKUs (size, pack, etc.). When variants exist, customers must pick one at checkout.
            SKU and barcode must be unique in this shop.
          </Text>
          <TouchableOpacity
            style={[styles.outlineBtn, { marginBottom: spacing.md }]}
            onPress={() => openVariantModal()}
            activeOpacity={0.85}
          >
            <Text style={styles.outlineBtnText}>Add variant</Text>
          </TouchableOpacity>
          {sortedVariants.length === 0 ? (
            <Text style={styles.muted}>No variants — product uses the base price above.</Text>
          ) : (
            sortedVariants.map((v) => (
              <View key={v.id} style={styles.variantCard}>
                <Text style={styles.variantCardTitle}>{v.name}</Text>
                <Text style={styles.variantCardMeta}>
                  {formatPrice(v.priceCents, currencyCode)} · {v.available ? "Available" : "Unavailable"}
                  {v.sku ? ` · SKU ${v.sku}` : ""}
                </Text>
                <View style={styles.variantActions}>
                  <TouchableOpacity style={styles.outlineBtn} onPress={() => openVariantModal(v)}>
                    <Text style={styles.outlineBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.outlineBtn, { borderColor: colors.destructive }]}
                    onPress={() => {
                      Alert.alert("Delete variant?", "This cannot be undone.", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => variantDeleteMutation.mutate(v.id),
                        },
                      ]);
                    }}
                  >
                    <Text style={[styles.outlineBtnText, { color: colors.destructive }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <TouchableOpacity
            style={[styles.toggle, available ? styles.toggleOn : styles.toggleOff]}
            onPress={() => setAvailable((v) => !v)}
            activeOpacity={0.8}
          >
            <Text style={styles.toggleText}>
              {available ? "Available" : "Unavailable"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primary, updateMutation.isPending && styles.disabled]}
            onPress={() => updateMutation.mutate()}
            disabled={
              updateMutation.isPending ||
              !name.trim() ||
              !priceCents ||
              Number.isNaN(Number(priceCents))
            }
            activeOpacity={0.85}
          >
            <Text style={styles.primaryText}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.danger, deleteMutation.isPending && styles.disabled]}
            onPress={() => {
              Alert.alert(
                "Delete product?",
                "This cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
                ]
              );
            }}
            disabled={deleteMutation.isPending}
            activeOpacity={0.85}
          >
            <Text style={styles.dangerText}>
              {deleteMutation.isPending ? "Deleting..." : "Delete Product"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal
        visible={categoryPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select category</Text>
            <FlatList
              data={categoryOptions}
              keyExtractor={(c) => c}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => {
                    setCategory(item);
                    setCategoryPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowText}>{item}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.mutedText}>No categories yet</Text>
              }
            />
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setCategoryPickerOpen(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={variantModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVariantModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: "85%" }]}>
            <Text style={styles.modalTitle}>
              {variantEditingId ? "Edit variant" : "Add variant"}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Field label="Name">
                <TextInput
                  value={vfName}
                  onChangeText={setVfName}
                  placeholder="e.g. Large"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.input}
                />
              </Field>
              <Field label="Price (cents)">
                <TextInput
                  value={vfPrice}
                  onChangeText={(v) => setVfPrice(v.replace(/[^\d]/g, ""))}
                  placeholder="1299"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
              <Field label="SKU (optional)">
                <TextInput
                  value={vfSku}
                  onChangeText={setVfSku}
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.input}
                  autoCapitalize="none"
                />
              </Field>
              <Field label="Barcode (optional)">
                <TextInput
                  value={vfBarcode}
                  onChangeText={setVfBarcode}
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.input}
                  autoCapitalize="none"
                />
              </Field>
              <Field label="Image URL (optional)">
                <TextInput
                  value={vfImageUrl}
                  onChangeText={setVfImageUrl}
                  placeholder="https://"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.input}
                  autoCapitalize="none"
                />
              </Field>
              <Field label="Stock (optional, blank = unlimited)">
                <TextInput
                  value={vfStock}
                  onChangeText={(v) => setVfStock(v.replace(/[^\d]/g, ""))}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
              <TouchableOpacity
                style={[styles.toggle, vfAvailable ? styles.toggleOn : styles.toggleOff]}
                onPress={() => setVfAvailable((x) => !x)}
                activeOpacity={0.8}
              >
                <Text style={styles.toggleText}>{vfAvailable ? "Available" : "Unavailable"}</Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity
              style={[styles.primary, variantSaveMutation.isPending && styles.disabled, { marginTop: spacing.md }]}
              onPress={() => variantSaveMutation.mutate()}
              disabled={
                variantSaveMutation.isPending || !vfName.trim() || !vfPrice.trim() || Number.isNaN(Number(vfPrice))
              }
            >
              <Text style={styles.primaryText}>
                {variantSaveMutation.isPending ? "Saving…" : "Save variant"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setVariantModalOpen(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
