import { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, Modal, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { api } from "@/lib/api";
import { DIETARY_TAG_OPTIONS, type Category, type DietaryTag } from "@dilivygo/types";
import { MobileImageUpload } from "@/components/image-upload";

function createNewProductFormStyles(c: AppColors) {
  return {
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.xl, gap: spacing.lg },
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
    disabled: { opacity: 0.6 },
    primaryText: { color: c.primaryForeground, fontWeight: "700" as const, fontSize: fontSize.base },
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
  };
}

export default function NewProductScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createNewProductFormStyles);

  const [name, setName] = useState("");
  const [priceCents, setPriceCents] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [available, setAvailable] = useState(true);
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>([]);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const { data: catRes } = useQuery<{ categories: Category[] }>({
    queryKey: ["catalog", "categories"],
    queryFn: () => api.catalog.listCategories(),
  });
  const categoryOptions = useMemo(
    () => (catRes?.categories ?? []).map((c) => c.name).sort(),
    [catRes]
  );
  const createMutation = useMutation({
    mutationFn: async () =>
      api.catalog.createProduct({
        name: name.trim(),
        priceCents: Number(priceCents),
        category: category.trim() || null,
        imageUrl: imageUrl.trim() || null,
        description: description.trim() || null,
        available,
        dietaryTags,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["vendor-products"] });
      await qc.invalidateQueries({ queryKey: ["catalog", "categories"] });
      router.back();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Failed to create product";
      Alert.alert("Error", message);
    },
  });

  function toggleDietaryTag(tag: DietaryTag) {
    setDietaryTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

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
          title: "New Product",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground },
          headerShadowVisible: false,
        }}
      />

      <View style={styles.content}>
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
        <MobileImageUpload
          value={imageUrl || null}
          onChange={(url) => setImageUrl(url ?? "")}
          disabled={createMutation.isPending}
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
          style={[styles.primary, createMutation.isPending && styles.disabled]}
          onPress={() => createMutation.mutate()}
          disabled={
            createMutation.isPending ||
            !name.trim() ||
            !priceCents ||
            Number.isNaN(Number(priceCents))
          }
          activeOpacity={0.85}
        >
          <Text style={styles.primaryText}>
            {createMutation.isPending ? "Saving..." : "Create Product"}
          </Text>
        </TouchableOpacity>
      </View>

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
    </SafeAreaView>
  );
}
