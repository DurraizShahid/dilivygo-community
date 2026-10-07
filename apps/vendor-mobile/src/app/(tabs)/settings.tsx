import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { resolveProfileAvatarUrl } from "@dilivygo/types";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { DeliveryMode, VendorSettings } from "@dilivygo/types";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { api } from "@/lib/api";
import { useCurrencyStore } from "@/lib/currency";
import { useAuthStore } from "@/stores/auth-store";
import { useShopStore } from "@/stores/shop-store";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import type { ThemeMode } from "@/stores/theme-store";

function createSettingsStyles(c: AppColors) {
  return {
    container: {
      flex: 1,
      backgroundColor: c.background,
      paddingHorizontal: spacing.lg,
    },
    centered: {
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    screenTitle: {
      fontSize: fontSize["2xl"],
      fontWeight: "700" as const,
      color: c.foreground,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg,
    },
    profileCard: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      backgroundColor: c.card,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.xl,
      borderWidth: 1,
      borderColor: c.border,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      marginRight: spacing.lg,
      overflow: "hidden" as const,
      backgroundColor: c.muted,
    },
    avatarImage: {
      width: 52,
      height: 52,
    },
    profileInfo: { flex: 1 },
    profileName: {
      fontSize: fontSize.lg,
      fontWeight: "600" as const,
      color: c.foreground,
    },
    profileRole: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      textTransform: "capitalize" as const,
      marginTop: 2,
    },
    section: {
      backgroundColor: c.card,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: spacing.xl,
      padding: spacing.lg,
    },
    sectionTitle: {
      fontSize: fontSize.xs,
      fontWeight: "600" as const,
      color: c.mutedForeground,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
      marginBottom: spacing.md,
    },
    row: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowLabel: { fontSize: fontSize.sm, color: c.mutedForeground, flex: 1 },
    rowValue: {
      fontSize: fontSize.sm,
      fontWeight: "500" as const,
      color: c.foreground,
    },
    rowInput: {
      width: 80,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs + 2,
      fontSize: fontSize.sm,
      color: c.foreground,
    },
    modeButtons: { flexDirection: "row" as const, gap: spacing.sm },
    modeBtn: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      alignItems: "center" as const,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    modeBtnActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    modeBtnText: { fontSize: fontSize.sm, color: c.foreground },
    modeBtnTextActive: {
      color: c.primaryForeground,
      fontWeight: "600" as const,
    },
    saveBtn: {
      marginTop: spacing.md,
      backgroundColor: c.primary,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md + 2,
      alignItems: "center" as const,
    },
    saveBtnText: {
      color: c.primaryForeground,
      fontWeight: "600" as const,
      fontSize: fontSize.base,
    },
    logoutBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: c.destructive + "0F",
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.md + 2,
      gap: spacing.sm,
    },
    logoutText: {
      fontSize: fontSize.base,
      fontWeight: "600" as const,
      color: c.destructive,
    },
    scroll: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
    },
  };
}

const THEME_OPTIONS: {
  value: ThemeMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
  { value: "system", label: "System", icon: "phone-portrait-outline" },
];

const DELIVERY_MODES: { value: DeliveryMode; label: string }[] = [
  { value: "third_party", label: "Third Party" },
  { value: "vendor_rider", label: "Vendor Rider" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const defaultProfilePhotoUrls = useCurrencyStore((s) => s.defaultProfilePhotoUrls);
  const profileImageUri = useMemo(
    () => resolveProfileAvatarUrl(undefined, user?.id ?? "", defaultProfilePhotoUrls),
    [user?.id, defaultProfilePhotoUrls],
  );
  const logout = useAuthStore((s) => s.logout);
  const activeShop = useShopStore((s) => s.activeShop);
  const { colors, mode: themeMode, setMode: setThemeMode } = useAppTheme();
  const styles = useThemedStyles(createSettingsStyles);

  const [autoAccept, setAutoAccept] = useState(false);
  const [defaultPrepTime, setDefaultPrepTime] = useState("15");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("third_party");

  const { data: settings, isLoading } = useQuery<VendorSettings | null>({
    queryKey: ["vendor-settings", activeShop?.id],
    queryFn: () => api.vendorSettings.get(activeShop?.id),
    enabled: !!activeShop?.id,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.vendorSettings.update(
        {
          autoAccept,
          defaultPrepTimeMinutes: parseInt(defaultPrepTime, 10) || 15,
          deliveryMode,
        },
        activeShop?.id,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["vendor-settings", activeShop?.id],
      });
      Alert.alert("Saved", "Settings updated successfully.");
    },
    onError: () => Alert.alert("Error", "Failed to save settings."),
  });

  useEffect(() => {
    if (settings) {
      setAutoAccept(settings.autoAccept);
      setDefaultPrepTime(String(settings.defaultPrepTimeMinutes));
      setDeliveryMode(settings.deliveryMode);
    }
  }, [settings]);

  const handleSave = () => {
    const prep = parseInt(defaultPrepTime, 10);
    if (Number.isNaN(prep) || prep < 1 || prep > 120) {
      Alert.alert("Invalid", "Prep time must be between 1 and 120 minutes.");
      return;
    }
    updateMutation.mutate();
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  if (isLoading && !settings) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: spacing.xxl + insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <Text style={styles.screenTitle}>Settings</Text>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Image
              source={{ uri: profileImageUri }}
              style={styles.avatarImage}
              accessibilityIgnoresInvertColors
            />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.email ?? "Vendor"}</Text>
            <Text style={styles.profileRole}>{user?.role ?? "vendor"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vendor Settings</Text>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Auto-accept orders</Text>
            <Switch
              value={autoAccept}
              onValueChange={setAutoAccept}
              trackColor={{ false: colors.border, true: colors.primary + "60" }}
              thumbColor={autoAccept ? colors.primary : colors.mutedForeground}
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Default prep time (minutes)</Text>
            <TextInput
              style={styles.rowInput}
              value={defaultPrepTime}
              onChangeText={setDefaultPrepTime}
              keyboardType="number-pad"
              placeholder="15"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View
            style={[
              styles.row,
              { flexDirection: "column", alignItems: "stretch" },
            ]}
          >
            <Text style={[styles.rowLabel, { marginBottom: spacing.sm }]}>
              Delivery mode
            </Text>
            <View style={styles.modeButtons}>
              {DELIVERY_MODES.map((mode) => (
                <TouchableOpacity
                  key={mode.value}
                  style={[
                    styles.modeBtn,
                    deliveryMode === mode.value && styles.modeBtnActive,
                  ]}
                  onPress={() => setDeliveryMode(mode.value)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.modeBtnText,
                      deliveryMode === mode.value && styles.modeBtnTextActive,
                    ]}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            disabled={updateMutation.isPending}
            activeOpacity={0.8}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.saveBtnText}>Save Settings</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push("/cx/cases")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Guest cases"
          >
            <Text style={styles.rowLabel}>Guest cases</Text>
            <Text style={styles.rowValue}>›</Text>
          </TouchableOpacity>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue}>{user?.email ?? "—"}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Role</Text>
            <Text style={styles.rowValue}>{user?.role ?? "—"}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Workspace</Text>
            <Text style={styles.rowValue}>{user?.projectRef ?? "—"}</Text>
          </View>

          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={styles.rowLabel}>2FA</Text>
            <Text style={styles.rowValue}>
              {user?.totpEnabled ? "Enabled" : "Disabled"}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.section,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text
            style={[styles.sectionTitle, { color: colors.mutedForeground }]}
          >
            Appearance
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {THEME_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setThemeMode(opt.value)}
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: spacing.md,
                  borderRadius: borderRadius.md,
                  backgroundColor:
                    themeMode === opt.value ? colors.primary : colors.muted,
                }}
              >
                <Ionicons
                  name={opt.icon}
                  size={16}
                  color={
                    themeMode === opt.value
                      ? colors.primaryForeground
                      : colors.mutedForeground
                  }
                />
                <Text
                  style={{
                    fontSize: fontSize.sm,
                    fontWeight: "600",
                    color:
                      themeMode === opt.value
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons
            name="log-out-outline"
            size={20}
            color={colors.destructive}
          />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
