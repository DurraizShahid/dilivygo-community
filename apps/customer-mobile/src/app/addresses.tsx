import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@dilivygo/api";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import { SCREEN_H_PAD, elevatedCardShadow } from "@/lib/screen-layout";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import type { CustomerAddress } from "@dilivygo/types";

const QUICK_LABELS = ["Home", "Work", "Office"];
const LABEL_ICONS: Record<string, string> = {
  Home: "home-outline",
  Work: "briefcase-outline",
  Office: "business-outline",
};

interface AddressForm {
  label: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  isDefault: boolean;
}

const emptyForm: AddressForm = {
  label: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postcode: "",
  isDefault: false,
};

function createAddressesStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: {
      paddingHorizontal: SCREEN_H_PAD,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    formCard: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      padding: spacing.lg,
      marginBottom: spacing.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      ...elevatedCardShadow(),
    },
    formTitle: {
      fontSize: fontSize.lg,
      fontFamily: fonts.bold,
      color: c.foreground,
      marginBottom: spacing.lg,
      letterSpacing: -0.2,
    },
    fieldLabel: {
      fontSize: fontSize.xs,
      fontWeight: "600",
      color: c.mutedForeground,
      marginBottom: spacing.xs,
      marginTop: spacing.md,
    },
    labelRow: {
      flexDirection: "row",
      gap: spacing.sm,
      flexWrap: "wrap",
    },
    labelChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: c.border,
    },
    labelChipActive: {
      borderColor: c.primary,
      backgroundColor: `${c.primary}18`,
    },
    labelChipText: {
      fontSize: fontSize.xs,
      fontWeight: "600",
      color: c.mutedForeground,
    },
    labelChipTextActive: { color: c.primary },
    input: {
      backgroundColor: c.muted,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: fontSize.base,
      color: c.foreground,
    },
    row: {
      flexDirection: "row",
      gap: spacing.md,
    },
    defaultToggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    defaultToggleText: {
      fontSize: fontSize.sm,
      color: c.foreground,
    },
    formButtons: {
      flexDirection: "row",
      gap: spacing.md,
      marginTop: spacing.xl,
    },
    cancelBtn: {
      flex: 1,
      height: 44,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: "center",
      alignItems: "center",
    },
    cancelBtnText: {
      fontSize: fontSize.sm,
      fontWeight: "600",
      color: c.foreground,
    },
    saveBtn: {
      flex: 1,
      height: 44,
      borderRadius: borderRadius.md,
      backgroundColor: c.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: {
      fontSize: fontSize.sm,
      fontWeight: "600",
      color: c.primaryForeground,
    },
    empty: {
      alignItems: "center",
      paddingTop: 60,
      gap: spacing.md,
    },
    emptyText: {
      fontSize: fontSize.base,
      fontWeight: "600",
      color: c.mutedForeground,
    },
    addFirstBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    addFirstText: {
      fontSize: fontSize.sm,
      fontWeight: "600",
      color: c.primary,
    },
    addrCard: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      ...elevatedCardShadow(),
    },
    addrHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    addrLabel: {
      fontSize: fontSize.base,
      fontWeight: "700",
      color: c.foreground,
      flex: 1,
    },
    defaultBadge: {
      backgroundColor: `${c.primary}28`,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
    },
    defaultBadgeText: {
      fontSize: fontSize.xs,
      fontWeight: "600",
      color: c.primary,
    },
    addrLine: {
      fontSize: fontSize.sm,
      color: c.foreground,
      marginBottom: 2,
    },
    addrLineSub: {
      fontSize: fontSize.xs,
      color: c.mutedForeground,
    },
    addrActions: {
      flexDirection: "row",
      gap: spacing.lg,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    actionText: {
      fontSize: fontSize.xs,
      fontWeight: "600",
      color: c.mutedForeground,
    },
  });
}

export default function AddressesScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createAddressesStyles);
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressForm>(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.addresses.list(),
  });
  const addresses = data?.addresses ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        return api.addresses.update(editingId, {
          label: form.label || undefined,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2 || undefined,
          city: form.city || undefined,
          postcode: form.postcode || undefined,
          isDefault: form.isDefault,
        });
      }
      return api.addresses.create({
        label: form.label || "",
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2 || undefined,
        city: form.city || "",
        postcode: form.postcode || "",
        isDefault: form.isDefault,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      closeForm();
    },
    onError: (err: unknown) =>
      Alert.alert("Error", getApiErrorMessage(err, "Failed to save address")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.addresses.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["addresses"] }),
    onError: (err: unknown) =>
      Alert.alert("Error", getApiErrorMessage(err, "Failed to delete")),
  });

  const defaultMutation = useMutation({
    mutationFn: (id: string) => api.addresses.setDefault(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["addresses"] }),
  });

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(addr: CustomerAddress) {
    setEditingId(addr.id);
    setForm({
      label: addr.label || "",
      addressLine1: addr.addressLine1 || "",
      addressLine2: addr.addressLine2 || "",
      city: addr.city || "",
      postcode: addr.postcode || "",
      isDefault: addr.isDefault,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function patch(partial: Partial<AddressForm>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Saved Addresses",
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground },
          headerShadowVisible: false,
          headerRight: () =>
            !showForm ? (
              <TouchableOpacity onPress={openNew}>
                <Ionicons name="add" size={24} color={colors.primary} />
              </TouchableOpacity>
            ) : null,
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>
              {editingId ? "Edit Address" : "New Address"}
            </Text>

            <Text style={styles.fieldLabel}>Label</Text>
            <View style={styles.labelRow}>
              {QUICK_LABELS.map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[
                    styles.labelChip,
                    form.label === l && styles.labelChipActive,
                  ]}
                  onPress={() =>
                    patch({ label: form.label === l ? "" : l })
                  }
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={(LABEL_ICONS[l] || "location-outline") as any}
                    size={14}
                    color={
                      form.label === l
                        ? colors.primary
                        : colors.mutedForeground
                    }
                  />
                  <Text
                    style={[
                      styles.labelChipText,
                      form.label === l && styles.labelChipTextActive,
                    ]}
                  >
                    {l}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Address line 1</Text>
            <TextInput
              style={styles.input}
              placeholder="123 High Street"
              placeholderTextColor={colors.mutedForeground}
              value={form.addressLine1}
              onChangeText={(t) => patch({ addressLine1: t })}
            />

            <Text style={styles.fieldLabel}>Address line 2</Text>
            <TextInput
              style={styles.input}
              placeholder="Flat 4B (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={form.addressLine2}
              onChangeText={(t) => patch({ addressLine2: t })}
            />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>City</Text>
                <TextInput
                  style={styles.input}
                  placeholder="London"
                  placeholderTextColor={colors.mutedForeground}
                  value={form.city}
                  onChangeText={(t) => patch({ city: t })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Postcode</Text>
                <TextInput
                  style={styles.input}
                  placeholder="SW1A 1AA"
                  placeholderTextColor={colors.mutedForeground}
                  value={form.postcode}
                  onChangeText={(t) => patch({ postcode: t })}
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.defaultToggle}
              onPress={() => patch({ isDefault: !form.isDefault })}
              activeOpacity={0.7}
            >
              <Ionicons
                name={form.isDefault ? "checkbox" : "square-outline"}
                size={22}
                color={form.isDefault ? colors.primary : colors.mutedForeground}
              />
              <Text style={styles.defaultToggleText}>
                Set as default address
              </Text>
            </TouchableOpacity>

            <View style={styles.formButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={closeForm}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  (!form.addressLine1.trim() || saveMutation.isPending) &&
                    styles.saveBtnDisabled,
                ]}
                onPress={() => saveMutation.mutate()}
                disabled={
                  !form.addressLine1.trim() || saveMutation.isPending
                }
                activeOpacity={0.8}
              >
                {saveMutation.isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primaryForeground}
                  />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingId ? "Update" : "Save"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: 40 }}
          />
        ) : addresses.length === 0 && !showForm ? (
          <View style={styles.empty}>
            <Ionicons
              name="location-outline"
              size={40}
              color={colors.mutedForeground}
            />
            <Text style={styles.emptyText}>No saved addresses</Text>
            <TouchableOpacity
              style={styles.addFirstBtn}
              onPress={openNew}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={18} color={colors.primary} />
              <Text style={styles.addFirstText}>
                Add your first address
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          addresses.map((addr) => (
            <View key={addr.id} style={styles.addrCard}>
              <View style={styles.addrHeader}>
                <Ionicons
                  name={
                    (LABEL_ICONS[addr.label || ""] ||
                      "location-outline") as any
                  }
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.addrLabel}>
                  {addr.label || "Address"}
                </Text>
                {addr.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                )}
              </View>
              <Text style={styles.addrLine}>{addr.addressLine1}</Text>
              {addr.addressLine2 && (
                <Text style={styles.addrLineSub}>{addr.addressLine2}</Text>
              )}
              {(addr.city || addr.postcode) && (
                <Text style={styles.addrLineSub}>
                  {[addr.city, addr.postcode].filter(Boolean).join(", ")}
                </Text>
              )}
              <View style={styles.addrActions}>
                {!addr.isDefault && (
                  <TouchableOpacity
                    onPress={() => defaultMutation.mutate(addr.id)}
                    style={styles.actionBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="star-outline"
                      size={16}
                      color={colors.mutedForeground}
                    />
                    <Text style={styles.actionText}>Default</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => openEdit(addr)}
                  style={styles.actionBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="create-outline"
                    size={16}
                    color={colors.mutedForeground}
                  />
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert(
                      "Delete Address",
                      "Remove this address?",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () =>
                            deleteMutation.mutate(addr.id),
                        },
                      ]
                    )
                  }
                  style={styles.actionBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={colors.destructive}
                  />
                  <Text
                    style={[
                      styles.actionText,
                      { color: colors.destructive },
                    ]}
                  >
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}
