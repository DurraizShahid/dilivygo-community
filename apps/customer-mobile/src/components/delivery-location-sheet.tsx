import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@dilivygo/i18n";
import type { CustomerAddress } from "@dilivygo/types";
import { useAuthStore } from "@/stores/auth-store";
import { useLocationStore } from "@/stores/location-store";
import { api } from "@/lib/api";
import { formatCustomerAddressLine } from "@/lib/customer-address";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";

function createSheetStyles(c: AppColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    sheet: {
      maxHeight: "85%",
      zIndex: 1,
      backgroundColor: c.card,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      borderWidth: 1,
      borderColor: c.border,
      borderBottomWidth: 0,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: {
      fontSize: fontSize.base,
      fontWeight: "700",
      color: c.foreground,
    },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    scroll: {
      maxHeight: 420,
    },
    scrollContent: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      paddingBottom: spacing.lg,
    },
    gpsRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: c.muted + "55",
    },
    gpsRowActive: {
      backgroundColor: c.primary + "12",
    },
    gpsIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary + "18",
      alignItems: "center",
      justifyContent: "center",
    },
    gpsTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    gpsTitle: {
      fontSize: fontSize.sm,
      fontWeight: "700",
      color: c.foreground,
    },
    gpsSubtitle: {
      marginTop: 4,
      fontSize: fontSize.xs,
      color: c.mutedForeground,
      lineHeight: 18,
    },
    divider: {
      height: 1,
      backgroundColor: c.border,
      marginVertical: spacing.md,
      marginHorizontal: spacing.sm,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: c.mutedForeground,
      letterSpacing: 0.6,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.xs,
    },
    signInBox: {
      marginHorizontal: spacing.sm,
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: c.border,
      alignItems: "center",
    },
    signInText: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      textAlign: "center",
    },
    signInLink: {
      marginTop: spacing.sm,
      fontSize: fontSize.sm,
      fontWeight: "700",
      color: c.primary,
    },
    addrRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
    },
    addrRowActive: {
      backgroundColor: c.primary + "10",
    },
    addrIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    addrTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flexWrap: "wrap",
    },
    addrTitle: {
      fontSize: fontSize.sm,
      fontWeight: "600",
      color: c.foreground,
      flex: 1,
    },
    defaultBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
      backgroundColor: c.primary + "22",
    },
    defaultBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: c.primary,
      textTransform: "uppercase",
    },
    addrSub: {
      marginTop: 4,
      fontSize: fontSize.xs,
      color: c.mutedForeground,
      lineHeight: 18,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.muted + "33",
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    footerLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
    },
    footerLinkText: {
      fontSize: fontSize.sm,
      fontWeight: "600",
      color: c.foreground,
    },
    footerLinkMuted: {
      color: c.mutedForeground,
      fontWeight: "500",
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xl,
    },
    loadingText: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
    },
    emptySaved: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: fontSize.sm,
      color: c.mutedForeground,
    },
  });
}

export function DeliveryLocationSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { t } = useTranslation("customer");
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createSheetStyles);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const {
    address,
    status,
    lat,
    savedAddressId,
    detectLocation,
    applySavedAddress,
    clearSavedAddressSelection,
  } = useLocationStore();

  const { data: addressData, isLoading: addressesLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.addresses.list(),
    enabled: visible && isAuthenticated,
  });
  const savedAddresses = addressData?.addresses ?? [];

  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const clearStaleSaved = useCallback(() => {
    const id = useLocationStore.getState().savedAddressId;
    if (!id || !savedAddresses.length) return;
    if (!savedAddresses.some((a) => a.id === id)) {
      useLocationStore.getState().clearSavedAddressSelection();
    }
  }, [savedAddresses]);

  useEffect(() => {
    if (visible) clearStaleSaved();
  }, [visible, clearStaleSaved]);

  const gpsActive = !savedAddressId;
  const gpsSubtitle =
    status === "loading" && gpsActive
      ? t("locationPicker.detecting")
      : address && gpsActive
        ? address
        : status === "denied"
          ? t("locationPicker.allowLocationHint")
          : t("locationPicker.useGpsSubtitle");

  async function onSelectSaved(addr: CustomerAddress) {
    setResolvingId(addr.id);
    try {
      await applySavedAddress(addr);
      onClose();
    } catch (e: unknown) {
      Alert.alert(
        t("locationPicker.deliverTo"),
        e instanceof Error ? e.message : t("locationPicker.addressLookupFailed")
      );
    } finally {
      setResolvingId(null);
    }
  }

  function onUseCurrentLocation() {
    clearSavedAddressSelection();
    detectLocation();
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t("locationPicker.deliverTo")}</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common:close")}
            >
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <TouchableOpacity
              style={[styles.gpsRow, gpsActive && styles.gpsRowActive]}
              onPress={onUseCurrentLocation}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t("locationPicker.useCurrentLocation")}
            >
              <View style={styles.gpsIconWrap}>
                <Ionicons name="navigate" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.gpsTitleRow}>
                  <Text style={styles.gpsTitle}>
                    {t("locationPicker.useCurrentLocation")}
                  </Text>
                  {gpsActive && status === "granted" && lat != null && (
                    <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                  )}
                </View>
                <Text style={styles.gpsSubtitle} numberOfLines={3}>
                  {gpsSubtitle}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>{t("locationPicker.savedAddresses")}</Text>

            {!isAuthenticated && (
              <View style={styles.signInBox}>
                <Text style={styles.signInText}>
                  {t("locationPicker.signInForSaved")}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    router.push("/login");
                  }}
                >
                  <Text style={styles.signInLink}>{t("nav.signIn")}</Text>
                </TouchableOpacity>
              </View>
            )}

            {isAuthenticated && addressesLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingText}>
                  {t("locationPicker.loadingAddresses")}
                </Text>
              </View>
            )}

            {isAuthenticated && !addressesLoading && savedAddresses.length === 0 && (
              <Text style={styles.emptySaved}>{t("locationPicker.noSavedAddresses")}</Text>
            )}

            {isAuthenticated &&
              savedAddresses.map((addr) => {
                const selected = savedAddressId === addr.id;
                const busy = resolvingId === addr.id;
                const title =
                  addr.label?.trim() || formatCustomerAddressLine(addr);
                return (
                  <TouchableOpacity
                    key={addr.id}
                    style={[styles.addrRow, selected && styles.addrRowActive]}
                    onPress={() => void onSelectSaved(addr)}
                    disabled={busy}
                    activeOpacity={0.75}
                  >
                    <View style={styles.addrIconWrap}>
                      <Ionicons
                        name="location-outline"
                        size={18}
                        color={colors.mutedForeground}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.addrTitleRow}>
                        <Text style={styles.addrTitle} numberOfLines={1}>
                          {title}
                        </Text>
                        {addr.isDefault && (
                          <View style={styles.defaultBadge}>
                            <Text style={styles.defaultBadgeText}>
                              {t("locationPicker.defaultBadge")}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.addrSub} numberOfLines={2}>
                        {formatCustomerAddressLine(addr)}
                      </Text>
                    </View>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : selected ? (
                      <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.footerLink}
              onPress={() => {
                onClose();
                router.push("/addresses");
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.footerLinkText}>
                {t("locationPicker.addNewAddress")}
              </Text>
            </TouchableOpacity>
            {isAuthenticated && (
              <TouchableOpacity
                style={styles.footerLink}
                onPress={() => {
                  onClose();
                  router.push("/addresses");
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={18} color={colors.mutedForeground} />
                <Text style={[styles.footerLinkText, styles.footerLinkMuted]}>
                  {t("locationPicker.manageAddresses")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
