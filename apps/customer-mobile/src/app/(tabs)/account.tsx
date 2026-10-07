import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Image,
  Platform,
  ActionSheetIOS,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import * as Location from "expo-location";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/stores/auth-store";
import { useAppTheme } from "@/providers/theme-provider";
import { api } from "@/lib/api";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { SCREEN_H_PAD, elevatedCardShadow } from "@/lib/screen-layout";
import type { ThemeMode } from "@/stores/theme-store";
import {
  useTranslation,
  useLanguage,
  markLanguageUserPicked,
  SUPPORTED_LANGUAGES,
} from "@dilivygo/i18n";
import type { SupportedLanguage } from "@dilivygo/i18n";
import { hasCustomProfilePhoto, resolveProfileAvatarUrl } from "@dilivygo/types";
import { LanguagePickerSheet } from "@/components/language-picker-sheet";
import { regionCodeToFlagEmoji } from "@/lib/flag-emoji";
import { useCurrencyStore } from "@/lib/currency";
import {
  getNotificationPermissionStatus,
  isPushNotificationsUnavailableInExpoGo,
  registerForPushNotifications,
} from "@/lib/notifications";
import type { NotificationPermissionStatus } from "@/lib/notifications";

const AVATAR_SIZE = 104;
/** Glow halo thickness on each side (outer ring = avatar + 2×this). */
const AVATAR_GLOW_INSET = 6;
const AVATAR_RING_OUTER = AVATAR_SIZE + AVATAR_GLOW_INSET * 2;
const EDIT_PHOTO_BADGE = 34;

function createAccountStyles(c: AppColors, isDark: boolean) {
  const heroGlow = isDark ? `${c.primary}35` : `${c.primary}28`;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: SCREEN_H_PAD,
    },
    masthead: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    mastEyebrow: {
      fontSize: 11,
      fontFamily: fonts.bold,
      color: c.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      marginBottom: 6,
    },
    mastTitle: {
      fontSize: fontSize["3xl"],
      fontFamily: fonts.extrabold,
      color: c.foreground,
      letterSpacing: -0.65,
      lineHeight: 36,
    },
    mastSubtitle: {
      fontSize: fontSize.sm,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      marginTop: spacing.sm,
      lineHeight: 21,
      maxWidth: 340,
    },
    heroSection: {
      marginBottom: spacing.xl,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    heroGlowRing: {
      alignSelf: "center",
      position: "relative",
      width: AVATAR_RING_OUTER,
      height: AVATAR_RING_OUTER,
      borderRadius: AVATAR_RING_OUTER / 2,
      backgroundColor: heroGlow,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: spacing.md,
    },
    avatarTouch: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: c.muted,
      overflow: "hidden",
      borderWidth: 3,
      borderColor: c.background,
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },
    editPhotoBadge: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: EDIT_PHOTO_BADGE,
      height: EDIT_PHOTO_BADGE,
      borderRadius: EDIT_PHOTO_BADGE / 2,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: c.background,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.18,
          shadowRadius: 4,
        },
        android: { elevation: 4 },
        default: {},
      }),
    },
    photoHint: {
      textAlign: "center",
      fontSize: fontSize.xs,
      fontFamily: fonts.medium,
      color: c.mutedForeground,
      marginBottom: spacing.lg,
    },
    greeting: {
      fontSize: fontSize["2xl"],
      fontFamily: fonts.extrabold,
      color: c.foreground,
      textAlign: "center",
      letterSpacing: -0.5,
    },
    welcomeLine: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.mutedForeground,
      textAlign: "center",
      marginTop: 4,
    },
    metaBlock: {
      marginTop: spacing.lg,
      gap: spacing.sm,
      width: "100%",
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: isDark ? `${c.foreground}08` : `${c.primary}08`,
    },
    metaIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: c.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    metaTextCol: {
      flex: 1,
      minWidth: 0,
    },
    metaLabel: {
      fontSize: 10,
      fontFamily: fonts.bold,
      color: c.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 2,
    },
    metaValue: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.foreground,
    },
    memberPill: {
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: spacing.md,
      paddingVertical: 8,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      backgroundColor: c.muted,
    },
    memberPillText: {
      fontSize: fontSize.xs,
      fontFamily: fonts.semibold,
      color: c.mutedForeground,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: fonts.bold,
      color: c.foreground,
      letterSpacing: 1.4,
      textTransform: "uppercase",
      marginBottom: spacing.sm,
      marginTop: spacing.xs,
    },
    sectionLabelSpaced: {
      marginTop: spacing.xl,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      padding: spacing.lg,
      marginBottom: spacing.md,
      ...elevatedCardShadow(2),
    },
    cardTitle: {
      fontSize: fontSize.lg,
      fontFamily: fonts.bold,
      color: c.foreground,
      letterSpacing: -0.25,
      marginBottom: spacing.xs,
    },
    cardHint: {
      fontSize: fontSize.sm,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      lineHeight: 20,
      marginBottom: spacing.md,
    },
    fieldLabel: {
      fontSize: 11,
      fontFamily: fonts.bold,
      color: c.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.9,
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
    },
    fieldLabelFirst: {
      marginTop: 0,
    },
    input: {
      minHeight: 52,
      borderRadius: borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: isDark ? `${c.foreground}06` : c.muted,
      color: c.foreground,
      paddingHorizontal: spacing.md,
      fontSize: fontSize.base,
      fontFamily: fonts.regular,
    },
    inputError: {
      borderColor: c.destructive,
      borderWidth: 1.5,
    },
    inputErrorText: {
      fontSize: fontSize.xs,
      fontFamily: fonts.medium,
      marginTop: spacing.xs,
    },
    saveButton: {
      height: 52,
      borderRadius: borderRadius.xl,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      marginTop: spacing.lg,
      ...elevatedCardShadow(2),
    },
    saveButtonDisabled: {
      opacity: 0.42,
    },
    saveButtonText: {
      color: c.primaryForeground,
      fontSize: fontSize.base,
      fontFamily: fonts.bold,
    },
    upToDateHint: {
      textAlign: "center",
      fontSize: fontSize.xs,
      fontFamily: fonts.medium,
      color: c.mutedForeground,
      marginTop: spacing.sm,
    },
    prefRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    prefIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: isDark ? `${c.foreground}10` : `${c.primary}12`,
      alignItems: "center",
      justifyContent: "center",
    },
    prefBody: {
      flex: 1,
      minWidth: 0,
    },
    prefTitle: {
      fontSize: fontSize.base,
      fontFamily: fonts.semibold,
      color: c.foreground,
    },
    prefValue: {
      fontSize: fontSize.sm,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      marginTop: 2,
    },
    hairline: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
    },
    appearanceHint: {
      fontSize: 11,
      fontFamily: fonts.bold,
      color: c.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 1.1,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    themeRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    themePill: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderRadius: borderRadius.lg,
      borderWidth: 2,
      borderColor: "transparent",
      backgroundColor: isDark ? `${c.foreground}08` : c.muted,
    },
    themePillActive: {
      borderColor: c.primary,
      backgroundColor: isDark ? `${c.primary}22` : `${c.primary}14`,
    },
    themePillLabel: {
      fontSize: 11,
      fontFamily: fonts.semibold,
      color: c.mutedForeground,
      marginTop: 6,
      textAlign: "center",
    },
    themePillLabelActive: {
      color: c.foreground,
    },
    deliveryCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.lg,
      gap: spacing.md,
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      marginBottom: spacing.md,
      ...elevatedCardShadow(3),
    },
    deliveryIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: isDark ? `${c.primary}28` : `${c.primary}18`,
      alignItems: "center",
      justifyContent: "center",
    },
    deliveryTextCol: {
      flex: 1,
      minWidth: 0,
    },
    deliveryTitle: {
      fontSize: fontSize.lg,
      fontFamily: fonts.bold,
      color: c.foreground,
      letterSpacing: -0.2,
    },
    deliverySubtitle: {
      fontSize: fontSize.sm,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      marginTop: 4,
      lineHeight: 19,
    },
    deliveryHint: {
      fontSize: fontSize.xs,
      fontFamily: fonts.medium,
      color: c.mutedForeground,
      marginTop: 6,
      opacity: 0.9,
    },
    signOutBlock: {
      marginTop: spacing.lg,
      marginBottom: spacing.md,
      alignItems: "center",
    },
    signOutSub: {
      fontSize: fontSize.xs,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      textAlign: "center",
      lineHeight: 18,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
    },
    signOutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      width: "100%",
      height: 52,
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.destructive}55`,
      backgroundColor: isDark ? `${c.destructive}12` : `${c.destructive}08`,
    },
    signOutText: {
      fontSize: fontSize.base,
      fontFamily: fonts.bold,
      color: c.destructive,
    },
    aboutFooterHint: {
      fontSize: fontSize.xs,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      lineHeight: 18,
      marginTop: spacing.md,
    },
  });
}

export default function AccountScreen() {
  const { t } = useTranslation("mobile");
  const { locked, language, setLanguage } = useLanguage();
  const router = useRouter();
  const customer = useAuthStore((s) => s.customer);
  const setCustomer = useAuthStore((s) => s.setCustomer);
  const logout = useAuthStore((s) => s.logout);
  const profilePhotoEnabled = useCurrencyStore((s) => s.customerProfilePhotoEnabled);
  const defaultProfilePhotoUrls = useCurrencyStore((s) => s.defaultProfilePhotoUrls);
  const appName = useCurrencyStore((s) => s.platformBranding.appName);
  const helpUrl = (useCurrencyStore((s) => s.platformBranding.helpUrl) || "").trim() || null;
  const supportEmail =
    (useCurrencyStore((s) => s.platformBranding.supportEmail) || "").trim() || null;
  const currencyCode = useCurrencyStore((s) => s.code);
  const { colors, mode, setMode, isDark } = useAppTheme();
  const styles = useMemo(
    () => createAccountStyles(colors, isDark),
    [colors, isDark]
  );
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermissionStatus | null>(null);
  const [locPerm, setLocPerm] = useState<{
    granted: boolean;
    canAskAgain: boolean;
  } | null>(null);

  const appVersion = Constants.expoConfig?.version ?? "—";

  const refreshDevicePermissions = useCallback(async () => {
    try {
      setNotifPerm(await getNotificationPermissionStatus());
      const fg = await Location.getForegroundPermissionsAsync();
      setLocPerm({
        granted: fg.status === Location.PermissionStatus.GRANTED,
        canAskAgain: fg.canAskAgain !== false,
      });
    } catch {
      setNotifPerm({ granted: false, canAskAgain: true });
      setLocPerm({ granted: false, canAskAgain: true });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshDevicePermissions();
    }, [refreshDevicePermissions])
  );

  const currentLangMeta = SUPPORTED_LANGUAGES[language];
  const languagePreview = `${regionCodeToFlagEmoji(currentLangMeta.flag)}  ${currentLangMeta.nativeName}`;

  const THEME_OPTIONS = useMemo(
    () =>
      [
        {
          value: "light" as const,
          label: t("account.themeLight"),
          icon: "sunny-outline" as const,
        },
        {
          value: "dark" as const,
          label: t("account.themeDark"),
          icon: "moon-outline" as const,
        },
        {
          value: "system" as const,
          label: t("account.themeSystem"),
          icon: "phone-portrait-outline" as const,
        },
      ] satisfies {
        value: ThemeMode;
        label: string;
        icon: keyof typeof Ionicons.glyphMap;
      }[],
    [t],
  );

  const customerWalletEnabled = useCurrencyStore((s) => s.customerWalletEnabled);

  const quickLinks = useMemo(() => {
    const links: {
      key: string;
      title: string;
      sub: string;
      icon: keyof typeof Ionicons.glyphMap;
      path: string;
    }[] = [
      {
        key: "orders",
        title: t("account.quickLinkOrders"),
        sub: t("account.quickLinkOrdersSub"),
        icon: "receipt-outline",
        path: "/(tabs)/orders",
      },
    ];
    if (customerWalletEnabled) {
      links.push({
        key: "wallet",
        title: t("account.quickLinkWallet"),
        sub: t("account.quickLinkWalletSub"),
        icon: "wallet-outline",
        path: "/wallet",
      });
    }
    links.push(
      {
        key: "favorites",
        title: t("account.quickLinkFavorites"),
        sub: t("account.quickLinkFavoritesSub"),
        icon: "heart-outline",
        path: "/(tabs)/favorites",
      },
      {
        key: "chat",
        title: t("account.quickLinkChat"),
        sub: t("account.quickLinkChatSub"),
        icon: "chatbubble-outline",
        path: "/(tabs)/chat",
      },
      {
        key: "search",
        title: t("account.quickLinkSearch"),
        sub: t("account.quickLinkSearchSub"),
        icon: "search-outline",
        path: "/search",
      },
    );
    return links;
  }, [t, customerWalletEnabled]);

  const notifSubtitleText = useMemo(() => {
    if (isPushNotificationsUnavailableInExpoGo()) return t("account.deviceNotifExpoGo");
    if (!notifPerm) return "";
    if (notifPerm.granted) return t("account.deviceNotifOn");
    if (notifPerm.canAskAgain) return t("account.deviceNotifEnable");
    return t("account.deviceNotifDenied");
  }, [notifPerm, t]);

  const locSubtitleText = useMemo(() => {
    if (!locPerm) return "";
    if (locPerm.granted) return t("account.deviceLocationOn");
    if (locPerm.canAskAgain) return t("account.deviceLocationEnable");
    return t("account.deviceLocationDenied");
  }, [locPerm, t]);

  useEffect(() => {
    setName(customer?.name || "");
    setEmail(customer?.email || "");
  }, [customer?.id, customer?.name, customer?.email]);

  const displayName = customer?.name?.trim() || "Customer";
  const firstName = useMemo(() => {
    const parts = displayName.trim().split(/\s+/);
    return parts[0] || displayName;
  }, [displayName]);

  const profileDirty = useMemo(
    () =>
      name.trim() !== (customer?.name || "").trim() ||
      email.trim().toLowerCase() !== (customer?.email || "").trim().toLowerCase(),
    [name, email, customer?.name, customer?.email]
  );

  const memberDateLabel = useMemo(() => {
    if (!customer?.createdAt) return null;
    return new Date(customer.createdAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  }, [customer?.createdAt]);

  const profileImageUri = useMemo(
    () =>
      resolveProfileAvatarUrl(customer?.avatarUrl, customer?.id ?? "", defaultProfilePhotoUrls),
    [customer?.avatarUrl, customer?.id, defaultProfilePhotoUrls]
  );
  const customProfilePhoto = hasCustomProfilePhoto(customer?.avatarUrl);

  async function pickAndUploadPhoto() {
    if (photoUploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("account.error"), t("account.photoPermissionDenied"));
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset?.uri) return;

    const mime = asset.mimeType || "image/jpeg";
    const ext =
      mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/gif"
            ? "gif"
            : "jpg";

    setPhotoUploading(true);
    try {
      const result = await api.auth.uploadCustomerAvatar({
        uri: asset.uri,
        name: `profile.${ext}`,
        type: mime,
      });
      await setCustomer(result.customer, result.token);
      Alert.alert(t("account.success"), t("account.profilePhotoUpdated"));
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("account.photoUploadFailed");
      Alert.alert(t("account.error"), message);
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleRemovePhoto() {
    if (photoUploading) return;
    setPhotoUploading(true);
    try {
      const result = await api.auth.deleteCustomerAvatar();
      await setCustomer(result.customer, result.token);
      Alert.alert(t("account.success"), t("account.profilePhotoRemoved"));
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("account.photoRemoveFailed");
      Alert.alert(t("account.error"), message);
    } finally {
      setPhotoUploading(false);
    }
  }

  function showPhotoMenu() {
    if (!profilePhotoEnabled || photoUploading) return;
    const cancel = t("account.cancel");
    const upload = t("account.photoOptionUpload");
    const remove = t("account.removePhoto");
    const hasCustom = hasCustomProfilePhoto(customer?.avatarUrl);

    if (Platform.OS === "ios") {
      const options = hasCustom ? [cancel, upload, remove] : [cancel, upload];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: hasCustom ? 2 : undefined,
          userInterfaceStyle: isDark ? "dark" : "light",
        },
        (buttonIndex) => {
          if (buttonIndex === 1) void pickAndUploadPhoto();
          if (hasCustom && buttonIndex === 2) void handleRemovePhoto();
        }
      );
    } else {
      Alert.alert(
        t("account.photoMenuTitle"),
        undefined,
        [
          { text: cancel, style: "cancel" },
          { text: upload, onPress: () => void pickAndUploadPhoto() },
          ...(hasCustom
            ? [
                {
                  text: remove,
                  style: "destructive" as const,
                  onPress: () => void handleRemovePhoto(),
                },
              ]
            : []),
        ]
      );
    }
  }

  function handleLogout() {
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
            router.replace("/login");
          },
        },
      ]
    );
  }

  async function handleSaveProfile() {
    setEmailFieldError(null);
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName) {
      Alert.alert(t("account.invalidName"), t("account.enterName"));
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      Alert.alert(t("account.invalidEmail"), t("account.validEmail"));
      return;
    }

    setSaving(true);
    try {
      const result = await api.auth.updateCustomerProfile({
        name: trimmedName,
        email: trimmedEmail,
      });
      await setCustomer(result.customer, result.token);
      Alert.alert(t("account.success"), t("account.profileUpdated"));
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("account.error");
      if (
        statusCode === 409 ||
        message.toLowerCase().includes("already linked")
      ) {
        setEmailFieldError(t("account.emailInUse"));
        return;
      }
      Alert.alert(t("account.error"), message);
    } finally {
      setSaving(false);
    }
  }

  async function handleNotifRowPress() {
    if (isPushNotificationsUnavailableInExpoGo()) {
      Alert.alert(t("account.deviceNotifTitle"), t("account.deviceNotifExpoGo"));
      return;
    }
    const perm = notifPerm ?? (await getNotificationPermissionStatus());
    if (perm.granted) {
      await Linking.openSettings();
      return;
    }
    if (perm.canAskAgain) {
      const r = await registerForPushNotifications();
      await refreshDevicePermissions();
      if (!r.token && r.error) {
        Alert.alert(t("account.error"), r.error);
      }
      return;
    }
    await Linking.openSettings();
  }

  async function handleLocationRowPress() {
    let base = locPerm;
    if (!base) {
      const fg = await Location.getForegroundPermissionsAsync();
      base = {
        granted: fg.status === Location.PermissionStatus.GRANTED,
        canAskAgain: fg.canAskAgain !== false,
      };
    }
    if (base.granted) {
      await Linking.openSettings();
      return;
    }
    if (base.canAskAgain) {
      const r = await Location.requestForegroundPermissionsAsync();
      await refreshDevicePermissions();
      if (r.status !== Location.PermissionStatus.GRANTED && r.canAskAgain === false) {
        await Linking.openSettings();
      }
      return;
    }
    await Linking.openSettings();
  }

  async function openHelpCenter() {
    if (!helpUrl) return;
    try {
      const can = await Linking.canOpenURL(helpUrl);
      if (!can) {
        Alert.alert(t("account.error"), t("account.supportUrlFailed"));
        return;
      }
      await Linking.openURL(helpUrl);
    } catch {
      Alert.alert(t("account.error"), t("account.supportUrlFailed"));
    }
  }

  function openSupportEmailComposer() {
    if (!supportEmail) return;
    const url = `mailto:${encodeURIComponent(supportEmail)}`;
    void Linking.openURL(url);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.masthead}>
          <Text style={styles.mastEyebrow}>{t("screens.accountEyebrow")}</Text>
          <Text style={styles.mastTitle}>{t("account.title")}</Text>
          <Text style={styles.mastSubtitle}>
            {t("account.heroSubtitle", { appName })}
          </Text>
        </View>

        <View style={styles.heroSection}>
          <View style={styles.heroGlowRing}>
            <View style={styles.avatarTouch} accessible={false}>
              <Image
                source={{ uri: profileImageUri }}
                style={styles.avatarImage}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                accessible={false}
              />
              {photoUploading ? (
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      backgroundColor: "rgba(0,0,0,0.4)",
                      alignItems: "center",
                      justifyContent: "center",
                    },
                  ]}
                >
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}
            </View>
            {profilePhotoEnabled && !photoUploading ? (
              <TouchableOpacity
                style={styles.editPhotoBadge}
                onPress={showPhotoMenu}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={t("account.editPhotoA11y")}
              >
                <Ionicons name="pencil" size={18} color={colors.primaryForeground} />
              </TouchableOpacity>
            ) : null}
          </View>

          {profilePhotoEnabled && !photoUploading ? (
            <Text style={styles.photoHint}>{t("account.photoTapHint")}</Text>
          ) : null}

          <Text style={styles.greeting}>{t("account.heroGreeting", { name: firstName })}</Text>
          <Text style={styles.welcomeLine}>{t("account.welcomeBack")}</Text>

          <View style={styles.metaBlock}>
            <View style={styles.metaRow}>
              <View style={styles.metaIconWrap}>
                <Ionicons name="call-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.metaTextCol}>
                <Text style={styles.metaLabel}>{t("account.phone")}</Text>
                <Text style={styles.metaValue} numberOfLines={1}>
                  {customer?.phone || t("account.notSet")}
                </Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaIconWrap}>
                <Ionicons name="mail-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.metaTextCol}>
                <Text style={styles.metaLabel}>{t("account.email")}</Text>
                <Text style={styles.metaValue} numberOfLines={2}>
                  {customer?.email || t("account.notSet")}
                </Text>
              </View>
            </View>
          </View>

          {memberDateLabel ? (
            <View style={styles.memberPill}>
              <Ionicons name="sparkles-outline" size={14} color={colors.mutedForeground} />
              <Text style={styles.memberPillText}>
                {t("account.memberPill", { date: memberDateLabel })}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          {t("account.categoryPersonal")}
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardHint}>{t("account.categoryPersonalHint")}</Text>
          <Text style={[styles.fieldLabel, styles.fieldLabelFirst]}>
            {t("account.fieldDisplayName")}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t("account.yourName")}
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
            autoCorrect
          />
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          {t("account.categoryContact")}
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardHint}>{t("account.categoryContactHint")}</Text>
          <Text style={[styles.fieldLabel, styles.fieldLabelFirst]}>
            {t("account.fieldEmail")}
          </Text>
          <TextInput
            style={[styles.input, emailFieldError ? styles.inputError : null]}
            placeholder={t("account.emailPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={(next) => {
              setEmail(next);
              if (emailFieldError) setEmailFieldError(null);
            }}
          />
          {emailFieldError ? (
            <Text style={[styles.inputErrorText, { color: colors.destructive }]}>
              {emailFieldError}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.saveButton, (!profileDirty || saving) && styles.saveButtonDisabled]}
            onPress={handleSaveProfile}
            disabled={!profileDirty || saving}
            activeOpacity={0.88}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.saveButtonText}>{t("account.saveProfile")}</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.upToDateHint}>
            {profileDirty ? t("account.saveReadyHint") : t("account.profileUpToDate")}
          </Text>
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          {t("account.sectionQuickLinks")}
        </Text>
        <View style={styles.card}>
          {quickLinks.map((item, i) => (
            <View key={item.key}>
              {i > 0 ? <View style={styles.hairline} /> : null}
              <TouchableOpacity
                style={styles.prefRow}
                onPress={() => router.push(item.path as any)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={item.title}
              >
                <View style={styles.prefIcon}>
                  <Ionicons name={item.icon} size={22} color={colors.primary} />
                </View>
                <View style={styles.prefBody}>
                  <Text style={styles.prefTitle}>{item.title}</Text>
                  <Text style={styles.prefValue} numberOfLines={2}>
                    {item.sub}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {!locked ? (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
              {t("account.sectionDisplay")}
            </Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.prefRow}
                onPress={() => setLanguageSheetOpen(true)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={t("account.language")}
              >
                <View style={styles.prefIcon}>
                  <Ionicons name="globe-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.prefBody}>
                  <Text style={styles.prefTitle}>{t("account.language")}</Text>
                  <Text style={styles.prefValue} numberOfLines={1}>
                    {languagePreview}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          {t("account.sectionAppearance")}
        </Text>
        <View style={styles.card}>
          <Text style={styles.appearanceHint}>{t("account.appearanceHint")}</Text>
          <Text style={[styles.cardHint, { marginBottom: spacing.md }]}>
            {t("account.themeExplainer")}
          </Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const selected = mode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.themePill, selected && styles.themePillActive]}
                  onPress={() => setMode(opt.value)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Ionicons
                    name={opt.icon}
                    size={22}
                    color={selected ? colors.primary : colors.mutedForeground}
                  />
                  <Text
                    style={[styles.themePillLabel, selected && styles.themePillLabelActive]}
                    numberOfLines={2}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          {t("account.sectionDevice")}
        </Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.prefRow}
            onPress={() => void handleNotifRowPress()}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t("account.deviceNotifTitle")}
          >
            <View style={styles.prefIcon}>
              <Ionicons name="notifications-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.prefBody}>
              <Text style={styles.prefTitle}>{t("account.deviceNotifTitle")}</Text>
              {notifSubtitleText ? (
                <Text style={styles.prefValue} numberOfLines={3}>
                  {notifSubtitleText}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View style={styles.hairline} />
          <TouchableOpacity
            style={styles.prefRow}
            onPress={() => void handleLocationRowPress()}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t("account.deviceLocationTitle")}
          >
            <View style={styles.prefIcon}>
              <Ionicons name="navigate-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.prefBody}>
              <Text style={styles.prefTitle}>{t("account.deviceLocationTitle")}</Text>
              {locSubtitleText ? (
                <Text style={styles.prefValue} numberOfLines={3}>
                  {locSubtitleText}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          {t("account.sectionDelivery")}
        </Text>
        <TouchableOpacity
          style={styles.deliveryCard}
          onPress={() => router.push("/addresses" as any)}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={t("account.savedAddresses")}
        >
          <View style={styles.deliveryIconWrap}>
            <Ionicons name="location-outline" size={26} color={colors.primary} />
          </View>
          <View style={styles.deliveryTextCol}>
            <Text style={styles.deliveryTitle}>{t("account.savedAddresses")}</Text>
            <Text style={styles.deliverySubtitle}>{t("account.addressesCardSubtitle")}</Text>
            <Text style={styles.deliveryHint}>{t("account.addressesCardHint")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>

        {helpUrl || supportEmail ? (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
              {t("account.sectionSupport")}
            </Text>
            <View style={styles.card}>
              {helpUrl ? (
                <TouchableOpacity
                  style={styles.prefRow}
                  onPress={() => void openHelpCenter()}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={t("account.supportHelp")}
                >
                  <View style={styles.prefIcon}>
                    <Ionicons name="book-outline" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.prefBody}>
                    <Text style={styles.prefTitle}>{t("account.supportHelp")}</Text>
                    <Text style={styles.prefValue} numberOfLines={2}>
                      {t("account.supportHelpSub")}
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
              {helpUrl && supportEmail ? <View style={styles.hairline} /> : null}
              {supportEmail ? (
                <TouchableOpacity
                  style={styles.prefRow}
                  onPress={openSupportEmailComposer}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={t("account.supportEmail")}
                >
                  <View style={styles.prefIcon}>
                    <Ionicons name="mail-outline" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.prefBody}>
                    <Text style={styles.prefTitle}>{t("account.supportEmail")}</Text>
                    <Text style={styles.prefValue} numberOfLines={2}>
                      {supportEmail}
                    </Text>
                    <Text
                      style={{
                        fontSize: fontSize.xs,
                        fontFamily: fonts.regular,
                        color: colors.mutedForeground,
                        marginTop: 4,
                        lineHeight: 17,
                      }}
                      numberOfLines={2}
                    >
                      {t("account.supportEmailSub")}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        ) : null}

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          {t("account.sectionAbout")}
        </Text>
        <View style={styles.card}>
          <View style={styles.prefRow}>
            <View style={styles.prefIcon}>
              <Ionicons name="information-circle-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.prefBody}>
              <Text style={styles.prefTitle}>{t("account.aboutVersion")}</Text>
              <Text style={styles.prefValue}>{appVersion}</Text>
            </View>
          </View>
          <View style={styles.hairline} />
          <View style={styles.prefRow}>
            <View style={styles.prefIcon}>
              <Ionicons name="cash-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.prefBody}>
              <Text style={styles.prefTitle}>{t("account.aboutCurrency")}</Text>
              <Text style={styles.prefValue} numberOfLines={2}>
                {t("account.aboutCurrencySub", { code: currencyCode })}
              </Text>
            </View>
          </View>
          <Text style={styles.aboutFooterHint}>{t("account.aboutTextSizeHint")}</Text>
        </View>

        <View style={styles.signOutBlock}>
          <Text style={styles.signOutSub}>{t("account.signOutSubtext")}</Text>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={22} color={colors.destructive} />
            <Text style={styles.signOutText}>{t("account.signOut")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {!locked ? (
        <LanguagePickerSheet
          visible={languageSheetOpen}
          onClose={() => setLanguageSheetOpen(false)}
          current={language}
          title={t("account.chooseLanguage")}
          onSelect={(code: SupportedLanguage) => {
            markLanguageUserPicked();
            setLanguage(code);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}
