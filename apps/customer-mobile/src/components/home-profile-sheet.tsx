import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@dilivygo/i18n";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import type { AppColors } from "@/lib/theme";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import { useAuthStore } from "@/stores/auth-store";
import { useCurrencyStore } from "@/lib/currency";
import { useMemo } from "react";
import { resolveProfileAvatarUrl } from "@dilivygo/types";

const AVATAR_SIZE = 72;

function createSheetStyles(c: AppColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: "flex-end",
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: borderRadius.xl + 4,
      borderTopRightRadius: borderRadius.xl + 4,
      maxHeight: "82%",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderBottomWidth: 0,
    },
    grabberWrap: {
      alignItems: "center",
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    grabber: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.mutedForeground,
      opacity: 0.35,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    headerMain: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    avatarRing: {
      width: AVATAR_SIZE + 6,
      height: AVATAR_SIZE + 6,
      borderRadius: (AVATAR_SIZE + 6) / 2,
      backgroundColor: c.muted,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: `${c.foreground}10`,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
    },
    avatarInitial: {
      fontSize: fontSize["2xl"],
      fontFamily: fonts.extrabold,
      color: c.primary,
    },
    headerTextCol: {
      flex: 1,
      minWidth: 0,
    },
    sheetTitle: {
      fontSize: fontSize.lg,
      fontFamily: fonts.bold,
      color: c.foreground,
      letterSpacing: -0.2,
    },
    sheetSubtitle: {
      fontSize: fontSize.sm,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      marginTop: 4,
      lineHeight: 20,
    },
    closeHit: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.muted,
    },
    menuScroll: {
      maxHeight: 360,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    rowIconWrap: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.lg,
      backgroundColor: c.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    rowTextCol: {
      flex: 1,
      minWidth: 0,
    },
    rowPrimary: {
      fontSize: fontSize.base,
      fontFamily: fonts.semibold,
      color: c.foreground,
    },
    rowSecondary: {
      fontSize: fontSize.sm,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      marginTop: 2,
      lineHeight: 18,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginLeft: spacing.lg + 44 + spacing.md,
    },
    signOutSection: {
      paddingHorizontal: spacing.lg,
      marginTop: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    signOutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      height: 48,
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.destructive}55`,
      backgroundColor: `${c.destructive}10`,
    },
    signOutBtnText: {
      fontSize: fontSize.base,
      fontFamily: fonts.bold,
      color: c.destructive,
    },
    signOutHint: {
      fontSize: fontSize.xs,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      textAlign: "center",
      marginTop: spacing.sm,
      lineHeight: 18,
    },
  });
}

type MenuItem = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  path: string;
};

export interface HomeProfileSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function HomeProfileSheet({ visible, onClose }: HomeProfileSheetProps) {
  const router = useRouter();
  const { t } = useTranslation("mobile");
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createSheetStyles);
  const insets = useSafeAreaInsets();
  const customer = useAuthStore((s) => s.customer);
  const logout = useAuthStore((s) => s.logout);
  const defaultProfilePhotoUrls = useCurrencyStore((s) => s.defaultProfilePhotoUrls);

  const profileUri = useMemo(
    () =>
      resolveProfileAvatarUrl(
        customer?.avatarUrl,
        customer?.id ?? "",
        defaultProfilePhotoUrls
      ),
    [customer?.avatarUrl, customer?.id, defaultProfilePhotoUrls]
  );

  const displayName = customer?.name?.trim() || t("home.profileDrawerGuestName");
  const detailLine =
    customer?.phone?.trim() ||
    customer?.email?.trim() ||
    t("home.profileDrawerSignedIn");

  const menuItems: MenuItem[] = useMemo(
    () => [
      {
        key: "settings",
        title: t("home.profileDrawerSettings"),
        subtitle: t("home.profileDrawerSettingsSub"),
        icon: "person-circle-outline",
        path: "/(tabs)/account",
      },
      {
        key: "favorites",
        title: t("home.profileDrawerFavorites"),
        subtitle: t("home.profileDrawerFavoritesSub"),
        icon: "heart-outline",
        path: "/(tabs)/favorites",
      },
      {
        key: "orders",
        title: t("home.profileDrawerOrders"),
        subtitle: t("home.profileDrawerOrdersSub"),
        icon: "receipt-outline",
        path: "/(tabs)/orders",
      },
      {
        key: "addresses",
        title: t("home.profileDrawerAddresses"),
        subtitle: t("home.profileDrawerAddressesSub"),
        icon: "location-outline",
        path: "/addresses",
      },
      {
        key: "chat",
        title: t("home.profileDrawerMessages"),
        subtitle: t("home.profileDrawerMessagesSub"),
        icon: "chatbubble-outline",
        path: "/(tabs)/chat",
      },
    ],
    [t]
  );

  function navigateTo(path: string) {
    onClose();
    router.push(path as any);
  }

  function handleSignOut() {
    Alert.alert(
      t("account.signOutConfirmTitle"),
      t("account.signOutConfirmMessage"),
      [
        { text: t("account.cancel"), style: "cancel" },
        {
          text: t("account.signOutConfirm"),
          style: "destructive",
          onPress: async () => {
            await logout();
            onClose();
            router.replace("/login");
          },
        },
      ]
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel={t("home.profileDrawerCloseA11y")}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>
          <View style={styles.sheetHeader}>
            <View style={styles.headerMain}>
              <View style={styles.avatarRing}>
                {profileUri ? (
                  <Image
                    source={{ uri: profileUri }}
                    style={styles.avatar}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <Text style={styles.avatarInitial}>
                    {(displayName[0] || "G").toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.headerTextCol}>
                <Text style={styles.sheetTitle} numberOfLines={2}>
                  {displayName}
                </Text>
                <Text style={styles.sheetSubtitle} numberOfLines={2}>
                  {detailLine}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeHit}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("account.close")}
            >
              <Ionicons name="close" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.menuScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {menuItems.map((item, index) => (
              <View key={item.key}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => navigateTo(item.path)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                >
                  <View style={styles.rowIconWrap}>
                    <Ionicons name={item.icon} size={22} color={colors.primary} />
                  </View>
                  <View style={styles.rowTextCol}>
                    <Text style={styles.rowPrimary}>{item.title}</Text>
                    <Text style={styles.rowSecondary} numberOfLines={2}>
                      {item.subtitle}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          <View style={styles.signOutSection}>
            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={handleSignOut}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t("account.signOut")}
            >
              <Ionicons name="log-out-outline" size={22} color={colors.destructive} />
              <Text style={styles.signOutBtnText}>{t("account.signOut")}</Text>
            </TouchableOpacity>
            <Text style={styles.signOutHint}>{t("account.signOutSubtext")}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
