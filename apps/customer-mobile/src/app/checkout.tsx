import { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Switch,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePaymentSheet } from "@stripe/stripe-react-native";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@dilivygo/i18n";
import { hapticOrderSuccess } from "@/lib/haptics";
import { buildCheckoutDraftGroups } from "@/lib/checkout-draft";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@dilivygo/api";
import { useCartStore } from "@/stores/cart-store";
import { useAuthStore } from "@/stores/auth-store";
import { useLocationStore } from "@/stores/location-store";
import { formatCustomerAddressLine } from "@/lib/customer-address";
import { formatPrice, useCurrencyStore, computeDeliveryFee } from "@/lib/currency";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import { SCREEN_H_PAD, elevatedCardShadow, screenChromeStyles } from "@/lib/screen-layout";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { CustomerAddress, DeliveryCheck } from "@dilivygo/types";

function createCheckoutStyles(c: AppColors) {
  const chrome = screenChromeStyles(c);
  return StyleSheet.create({
    ...chrome,
    keyboardRoot: {
      flex: 1,
      backgroundColor: c.background,
    },
    scroll: {
      flex: 1,
    },
    intro: {
      marginBottom: spacing.lg,
    },
    headline: {
      fontSize: fontSize["3xl"],
      fontFamily: fonts.extrabold,
      color: c.foreground,
      letterSpacing: -0.6,
      lineHeight: 34,
      marginTop: 2,
    },
    cardPad: {
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    fieldLabel: {
      fontSize: fontSize.xs,
      fontFamily: fonts.semibold,
      color: c.mutedForeground,
      marginBottom: spacing.sm,
      letterSpacing: 0.2,
    },
    addrChipsScroll: {
      marginBottom: spacing.md,
    },
    addrChips: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingVertical: 2,
    },
    addrChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: borderRadius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}18`,
      backgroundColor: c.muted,
    },
    addrChipActive: {
      borderColor: c.primary,
      backgroundColor: `${c.primary}12`,
    },
    addrChipNew: {
      borderStyle: "dashed" as const,
    },
    addrChipText: {
      fontSize: fontSize.xs,
      fontFamily: fonts.semibold,
      color: c.mutedForeground,
      maxWidth: 120,
    },
    addrChipTextActive: {
      color: c.primary,
    },
    textField: {
      backgroundColor: c.muted,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: fontSize.base,
      fontFamily: fonts.regular,
      color: c.foreground,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
    },
    addressInput: {
      minHeight: 88,
      textAlignVertical: "top",
    },
    notesInput: {
      minHeight: 72,
      textAlignVertical: "top",
    },
    promoRow: {
      flexDirection: "row",
      gap: spacing.sm,
      alignItems: "stretch",
    },
    promoInput: {
      flex: 1,
      backgroundColor: c.muted,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: fontSize.base,
      color: c.foreground,
      fontFamily: fonts.medium,
      letterSpacing: 0.8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
    },
    promoButton: {
      backgroundColor: c.primary,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.xl,
      justifyContent: "center",
      alignItems: "center",
      minWidth: 96,
    },
    promoButtonDisabled: {
      opacity: 0.5,
    },
    promoButtonText: {
      color: c.primaryForeground,
      fontSize: fontSize.sm,
      fontFamily: fonts.bold,
    },
    promoApplied: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: `${c.success}14`,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.success}33`,
    },
    promoAppliedLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flex: 1,
      minWidth: 0,
    },
    promoAppliedCode: {
      fontSize: fontSize.sm,
      fontFamily: fonts.bold,
      color: c.success,
      letterSpacing: 0.5,
    },
    promoAppliedInfo: {
      fontSize: fontSize.xs,
      fontFamily: fonts.medium,
      color: c.mutedForeground,
      flex: 1,
    },
    promoErrorText: {
      fontSize: fontSize.xs,
      fontFamily: fonts.semibold,
      color: c.destructive,
      marginTop: spacing.sm,
    },
    itemNoteRow: {
      marginBottom: spacing.md,
    },
    itemNoteLabel: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.foreground,
      marginBottom: spacing.xs,
    },
    itemNoteInput: {
      backgroundColor: c.muted,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: fontSize.sm,
      fontFamily: fonts.regular,
      color: c.foreground,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
    },
    summaryModifiers: {
      paddingLeft: spacing.sm,
      marginBottom: spacing.xs,
      gap: 2,
    },
    summaryModifierLine: {
      fontSize: fontSize.xs,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
    },
    summaryItemNote: {
      fontSize: fontSize.xs,
      fontStyle: "italic",
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      paddingLeft: spacing.sm,
      marginBottom: spacing.xs,
    },
    summaryItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: spacing.sm,
    },
    summaryItemText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.medium,
      color: c.foreground,
      flex: 1,
      marginRight: spacing.md,
    },
    summaryItemPrice: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.foreground,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: spacing.md,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
      alignItems: "center",
    },
    summaryLabel: {
      fontSize: fontSize.sm,
      fontFamily: fonts.medium,
      color: c.mutedForeground,
    },
    summaryValue: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.foreground,
    },
    totalLabel: {
      fontSize: fontSize.lg,
      fontFamily: fonts.bold,
      color: c.foreground,
    },
    totalValue: {
      fontSize: fontSize.lg,
      fontFamily: fonts.extrabold,
      color: c.foreground,
      letterSpacing: -0.3,
    },
    scheduleToggleRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    scheduleToggle: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}14`,
      backgroundColor: c.muted,
    },
    scheduleToggleActive: {
      borderColor: c.primary,
      backgroundColor: `${c.primary}10`,
    },
    scheduleToggleText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.mutedForeground,
    },
    scheduleToggleTextActive: {
      color: c.primary,
    },
    schedulePickerRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    schedulePickerButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: c.muted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
    },
    schedulePickerText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.foreground,
    },
    footerBar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      backgroundColor: c.background,
      paddingHorizontal: SCREEN_H_PAD,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    checkingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    checkingText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.medium,
      color: c.mutedForeground,
    },
    deliveryWarning: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      backgroundColor: `${c.destructive}12`,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.destructive}40`,
    },
    deliveryWarningText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.destructive,
      flex: 1,
      lineHeight: 20,
    },
    placeOrderButton: {
      flexDirection: "row",
      backgroundColor: c.primary,
      borderRadius: borderRadius.xl,
      height: 54,
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.sm,
      ...elevatedCardShadow(2),
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    placeOrderText: {
      color: c.primaryForeground,
      fontSize: fontSize.base,
      fontFamily: fonts.bold,
    },
    cutleryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
      borderRadius: borderRadius.lg,
      backgroundColor: `${c.muted}`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}12`,
    },
    cutleryRowLabel: {
      flex: 1,
      minWidth: 0,
    },
    cutleryShopName: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.foreground,
    },
    cutleryHint: {
      fontSize: fontSize.xs,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      marginTop: 2,
    },
  });
}

export default function CheckoutScreen() {
  const router = useRouter();
  const { t } = useTranslation("mobile");
  const insets = useSafeAreaInsets();
  const items = useCartStore((s) => s.items);
  const totalCents = useCartStore((s) => s.totalCents());
  const clear = useCartStore((s) => s.clear);
  const updateItemNotes = useCartStore((s) => s.updateItemNotes);
  const projectRef = useCartStore((s) => s.projectRef);
  const shopId = useCartStore((s) => s.shopId);
  const cartCurrency = useCartStore((s) => s.currency);
  const customer = useAuthStore((s) => s.customer);
  const platformCurrencyCode = useCurrencyStore((s) => s.code);
  const deliveryFeeConfig = useCurrencyStore((s) => s.deliveryFeeConfig);
  const multiShopCartEnabled = useCurrencyStore((s) => s.multiShopCartEnabled);
  const customerWalletEnabled = useCurrencyStore((s) => s.customerWalletEnabled);
  const useCheckoutDraftFlow = multiShopCartEnabled || customerWalletEnabled;
  const customerCutleryEnabled = useCurrencyStore((s) => s.customerCutleryEnabled);
  const draftGroups = useMemo(() => {
    try {
      return buildCheckoutDraftGroups(items, { shopId, projectRef });
    } catch {
      return [];
    }
  }, [items, shopId, projectRef]);
  const useGroupedShopDetail = useCheckoutDraftFlow && draftGroups.length > 0;
  const minQueries = useQueries({
    queries: draftGroups.map((g) => ({
      queryKey: ["shop-detail", g.projectRef, g.shopId],
      queryFn: () => api.public.shopDetail(g.projectRef, g.shopId),
      enabled: useGroupedShopDetail,
    })),
  });
  const { data: shopDataSingle } = useQuery({
    queryKey: ["shop-detail", projectRef, shopId],
    queryFn: () => api.public.shopDetail(projectRef!, shopId!),
    enabled: Boolean(projectRef && shopId && !useGroupedShopDetail),
  });
  const [wantsCutlerySingle, setWantsCutlerySingle] = useState(false);
  const [cutleryByShopKey, setCutleryByShopKey] = useState<Record<string, boolean>>({});
  const currencyCode = cartCurrency?.toUpperCase() || platformCurrencyCode;
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createCheckoutStyles);

  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const { data: addrData } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.addresses.list(),
  });
  const savedAddresses = addrData?.addresses ?? [];
  const locationStoreAddress = useLocationStore((s) => s.address);

  useEffect(() => {
    if (savedAddresses.length && !address && !selectedAddressId) {
      const def =
        savedAddresses.find((a: CustomerAddress) => a.isDefault) ||
        savedAddresses[0];
      if (def) {
        setSelectedAddressId(def.id);
        setAddress(formatCustomerAddressLine(def));
      }
    }
  }, [savedAddresses]);

  const didApplyLocationPrefill = useRef(false);
  useEffect(() => {
    if (didApplyLocationPrefill.current) return;
    if (address.trim() || selectedAddressId) return;
    if (!locationStoreAddress) return;
    setAddress(locationStoreAddress);
    didApplyLocationPrefill.current = true;
  }, [locationStoreAddress, address, selectedAddressId]);

  const [deliveryCheck, setDeliveryCheck] = useState<DeliveryCheck | null>(null);
  const [multiDeliveryChecks, setMultiDeliveryChecks] = useState<DeliveryCheck[] | null>(null);
  const [checkingDelivery, setCheckingDelivery] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledDate, setScheduledDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState<{
    code: string;
    discountCents: number;
    freeDelivery: boolean;
    promoCodeId: string;
  } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [walletPayEnabled, setWalletPayEnabled] = useState(false);

  const { data: walletData } = useQuery({
    queryKey: ["customer-wallet"],
    queryFn: () => api.customerWallet.get(),
    enabled: Boolean(customer?.id && customerWalletEnabled),
  });
  const walletBalanceCents = walletData?.balanceCents ?? 0;

  async function handleApplyPromo() {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError("");
    try {
      const result = await api.promoCodes.validate({
        code: promoCode.trim(),
        shopId:
          multiShopCartEnabled && draftGroups.length !== 1
            ? undefined
            : (shopId ?? undefined),
        subtotalCents: totalCents,
        deliveryFeeCents: dynamicDeliveryFee,
      });
      if (result.valid && result.promoCodeId) {
        setPromoApplied({
          code: promoCode.trim().toUpperCase(),
          discountCents: result.discountCents,
          freeDelivery: result.freeDelivery,
          promoCodeId: result.promoCodeId,
        });
        setPromoError("");
      } else {
        setPromoError(result.message || "Invalid promo code");
        setPromoApplied(null);
      }
    } catch (err: unknown) {
      setPromoError(getApiErrorMessage(err, "Failed to validate"));
      setPromoApplied(null);
    } finally {
      setPromoLoading(false);
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!address.trim()) {
      setDeliveryCheck(null);
      setMultiDeliveryChecks(null);
      return;
    }
    if (multiShopCartEnabled && draftGroups.length > 0) {
      debounceRef.current = setTimeout(async () => {
        setCheckingDelivery(true);
        setMultiDeliveryChecks(null);
        try {
          const geo = await api.public.geocode(address.trim());
          if (geo.lat == null || geo.lon == null) {
            setMultiDeliveryChecks([]);
            return;
          }
          const checks = await Promise.all(
            draftGroups.map((g) =>
              api.public.shopDeliveryCheck(g.projectRef, g.shopId, geo.lat!, geo.lon!)
            )
          );
          setMultiDeliveryChecks(checks);
        } catch {
          setMultiDeliveryChecks([]);
        } finally {
          setCheckingDelivery(false);
        }
      }, 800);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
    if (!projectRef) {
      setDeliveryCheck(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setCheckingDelivery(true);
      try {
        const geo = await api.public.geocode(address.trim());
        if (geo.lat == null || geo.lon == null) {
          setDeliveryCheck(null);
          return;
        }
        const check = shopId
          ? await api.public.shopDeliveryCheck(
              projectRef,
              shopId,
              geo.lat,
              geo.lon
            )
          : await api.public.deliveryCheck(projectRef, geo.lat, geo.lon);
        setDeliveryCheck(check);
      } catch {
        setDeliveryCheck(null);
      } finally {
        setCheckingDelivery(false);
      }
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [address, projectRef, shopId, multiShopCartEnabled, draftGroups]);

  const dynamicDeliveryFee = computeDeliveryFee(deliveryFeeConfig, totalCents);
  const effectiveDeliveryFee = promoApplied?.freeDelivery ? 0 : dynamicDeliveryFee;
  const discount = promoApplied?.discountCents ?? 0;
  const cutlerySumCents = useMemo(() => {
    if (!customerCutleryEnabled) return 0;
    if (useGroupedShopDetail) {
      let sum = 0;
      draftGroups.forEach((g, i) => {
        const detail = minQueries[i]?.data;
        if (!detail?.cutleryOffered) return;
        const key = `${g.projectRef}::${g.shopId}`;
        if (cutleryByShopKey[key]) {
          sum += detail.cutleryFeeCents ?? 0;
        }
      });
      return sum;
    }
    if (!shopDataSingle?.cutleryOffered) return 0;
    return wantsCutlerySingle ? (shopDataSingle.cutleryFeeCents ?? 0) : 0;
  }, [
    customerCutleryEnabled,
    useGroupedShopDetail,
    draftGroups,
    minQueries,
    shopDataSingle,
    cutleryByShopKey,
    wantsCutlerySingle,
  ]);
  const grandTotal = Math.max(totalCents - discount + effectiveDeliveryFee + cutlerySumCents, 0);

  const effectiveWalletApply = useMemo(() => {
    if (!customerWalletEnabled || !useCheckoutDraftFlow || !walletPayEnabled) return 0;
    return Math.min(walletBalanceCents, grandTotal);
  }, [customerWalletEnabled, useCheckoutDraftFlow, walletPayEnabled, walletBalanceCents, grandTotal]);

  const stripeChargeCents = Math.max(0, grandTotal - effectiveWalletApply);

  useEffect(() => {
    if (!customerWalletEnabled || !useCheckoutDraftFlow) setWalletPayEnabled(false);
  }, [customerWalletEnabled, useCheckoutDraftFlow]);

  const cannotDeliver =
    multiShopCartEnabled && draftGroups.length > 0
      ? Array.isArray(multiDeliveryChecks) &&
        multiDeliveryChecks.length === draftGroups.length &&
        multiDeliveryChecks.some((c) => !c.deliverable)
      : deliveryCheck !== null && !deliveryCheck.deliverable;

  const deliveryCheckPending =
    multiShopCartEnabled && draftGroups.length > 0 && address.trim().length > 0
      ? multiDeliveryChecks === null && checkingDelivery
      : false;

  const payAmountLabel =
    stripeChargeCents === 0 && effectiveWalletApply > 0
      ? formatPrice(0, currencyCode)
      : formatPrice(stripeChargeCents, currencyCode);

  const payLabel =
    scheduleMode === "later"
      ? t("screens.checkout.schedulePayCta", {
          amount: payAmountLabel,
        })
      : t("screens.checkout.payCta", { amount: payAmountLabel });

  async function handlePlaceOrder() {
    if (!address.trim()) {
      Alert.alert(
        t("screens.checkout.alertAddressTitle"),
        t("screens.checkout.alertAddressBody")
      );
      return;
    }
    if (items.length === 0) {
      Alert.alert(t("screens.checkout.alertEmptyTitle"), t("screens.checkout.alertEmptyBody"));
      return;
    }

    setLoading(true);
    try {
      const intentPayload = useCheckoutDraftFlow
        ? {
            amountCents: stripeChargeCents,
            currency: currencyCode.toLowerCase(),
            ...(customerWalletEnabled && effectiveWalletApply > 0
              ? { walletAmountCents: effectiveWalletApply }
              : {}),
            checkoutDraft: {
              groups: buildCheckoutDraftGroups(items, { shopId, projectRef }).map((g, i) => ({
                ...g,
                wantsCutlery: Boolean(
                  customerCutleryEnabled &&
                    cutleryByShopKey[`${g.projectRef}::${g.shopId}`] &&
                    minQueries[i]?.data?.cutleryOffered,
                ),
              })),
              deliveryFeeCents: dynamicDeliveryFee,
              address: address.trim(),
              notes: notes.trim() || null,
              scheduledFor: scheduleMode === "later" ? scheduledDate.toISOString() : null,
              promoCode: promoApplied?.code ?? null,
            },
          }
        : (() => {
            const serializedItems = JSON.stringify(
              items.map((i) => ({
                productId: i.productId,
                name: i.name,
                quantity: i.quantity,
                unitPriceCents: i.unitPriceCents,
                ...(i.productVariantId ? { productVariantId: i.productVariantId } : {}),
                ...(i.notes ? { notes: i.notes } : {}),
                ...(i.selectedModifiers?.length
                  ? {
                      modifiers: i.selectedModifiers.map((m) => ({
                        modifierOptionId: m.modifierOptionId,
                        groupName: m.groupName,
                        optionName: m.optionName,
                        priceCents: m.priceCents,
                      })),
                    }
                  : {}),
              }))
            );

            const metadata: Record<string, string> = {
              customerId: customer?.id ?? "",
              shopId: shopId ?? "",
              totalCents: String(totalCents),
              subtotalCents: String(totalCents),
              deliveryFeeCents: String(effectiveDeliveryFee),
              currency: currencyCode.toLowerCase(),
              address: address.trim(),
              notes: notes.trim(),
              items: serializedItems,
            };
            if (promoApplied) {
              metadata.promoCode = promoApplied.code;
            }
            if (scheduleMode === "later") {
              metadata.scheduledFor = scheduledDate.toISOString();
            }
            if (customerCutleryEnabled && shopDataSingle?.cutleryOffered && wantsCutlerySingle) {
              metadata.wantsCutlery = "1";
            } else {
              metadata.wantsCutlery = "0";
            }

            return {
              amountCents: grandTotal,
              currency: currencyCode.toLowerCase(),
              metadata,
            };
          })();

      const { clientSecret, isDummy, isWalletOnly, paymentIntentId } =
        await api.payments.createIntent(intentPayload);

      if (isWalletOnly && paymentIntentId) {
        clear();
        hapticOrderSuccess();
        Alert.alert(
          scheduleMode === "later"
            ? t("screens.checkout.alertScheduledTitle")
            : t("screens.checkout.alertPlacedTitle"),
          t("screens.checkout.walletOnlyPaid"),
          [{ text: t("screens.checkout.viewOrders"), onPress: () => router.replace("/(tabs)/orders") }]
        );
        return;
      }

      if (isDummy) {
        if (__DEV__) {
          console.warn(
            "[Checkout] Dummy payment mode active - Stripe is not configured. " +
              "This bypass is only available in development."
          );
          clear();
          hapticOrderSuccess();
          Alert.alert(
            scheduleMode === "later"
              ? t("screens.checkout.alertScheduledTitle")
              : t("screens.checkout.alertPlacedTitle"),
            scheduleMode === "later"
              ? t("screens.checkout.alertScheduledBody")
              : t("screens.checkout.alertPlacedBody"),
            [{ text: t("screens.checkout.viewOrders"), onPress: () => router.replace("/(tabs)/orders") }]
          );
          return;
        } else {
          Alert.alert(
            t("screens.checkout.alertPaymentUnavailableTitle"),
            t("screens.checkout.alertPaymentUnavailableBody"),
            [{ text: t("screens.checkout.ok") }]
          );
          return;
        }
      }

      if (!clientSecret) {
        Alert.alert(
          t("screens.checkout.alertPaymentUnavailableTitle"),
          t("screens.checkout.paymentIntentMissing")
        );
        return;
      }

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: "Dilivygo",
        allowsDelayedPaymentMethods: false,
      });

      if (initError) {
        Alert.alert("Payment Error", initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === "Canceled") {
          return;
        }
        Alert.alert("Payment Failed", presentError.message);
        return;
      }

      clear();
      hapticOrderSuccess();
      Alert.alert(
        t("screens.checkout.alertPlacedTitle"),
        t("screens.checkout.alertPlacedBody"),
        [{ text: t("screens.checkout.viewOrders"), onPress: () => router.replace("/(tabs)/orders") }]
      );
    } catch (err: unknown) {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to place order"));
    } finally {
      setLoading(false);
    }
  }

  const cannotDeliverCopy =
    multiShopCartEnabled && draftGroups.length > 1
      ? t("screens.checkout.cannotDeliverMulti")
      : t("screens.checkout.cannotDeliverSingle");

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("screens.checkout.navTitle"),
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground, fontFamily: fonts.semibold },
          headerShadowVisible: false,
        }}
      />

      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.listContentFlat, { paddingBottom: spacing.md }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.intro}>
            <Text style={styles.headerEyebrow}>{t("screens.checkout.eyebrow")}</Text>
            <Text style={styles.headline}>{t("screens.checkout.headline")}</Text>
            <Text style={styles.headerSubtitle}>{t("screens.checkout.subtitle")}</Text>
          </View>

          <View style={[styles.elevatedCard, styles.cardPad]}>
            <Text style={styles.sectionLabel}>{t("screens.checkout.deliveryAddress")}</Text>
            {savedAddresses.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.addrChipsScroll}
                contentContainerStyle={styles.addrChips}
              >
                {savedAddresses.map((sa: CustomerAddress) => (
                  <TouchableOpacity
                    key={sa.id}
                    style={[
                      styles.addrChip,
                      selectedAddressId === sa.id && styles.addrChipActive,
                    ]}
                    onPress={() => {
                      setSelectedAddressId(sa.id);
                      setAddress(
                        [sa.addressLine1, sa.addressLine2, sa.city, sa.postcode]
                          .filter(Boolean)
                          .join(", ")
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color={
                        selectedAddressId === sa.id
                          ? colors.primary
                          : colors.mutedForeground
                      }
                    />
                    <Text
                      style={[
                        styles.addrChipText,
                        selectedAddressId === sa.id && styles.addrChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {sa.label || sa.addressLine1?.slice(0, 20)}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    styles.addrChip,
                    styles.addrChipNew,
                    !selectedAddressId && styles.addrChipActive,
                  ]}
                  onPress={() => {
                    setSelectedAddressId(null);
                    setAddress("");
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="add"
                    size={16}
                    color={!selectedAddressId ? colors.primary : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.addrChipText,
                      !selectedAddressId && styles.addrChipTextActive,
                    ]}
                  >
                    {t("screens.checkout.newChip")}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
            <TextInput
              style={[styles.textField, styles.addressInput]}
              placeholder={t("screens.checkout.addressPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={address}
              onChangeText={(txt) => {
                setAddress(txt);
                setSelectedAddressId(null);
              }}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={[styles.elevatedCard, styles.cardPad]}>
            <Text style={styles.sectionLabel}>{t("screens.checkout.deliveryNotes")}</Text>
            <TextInput
              style={[styles.textField, styles.notesInput]}
              placeholder={t("screens.checkout.notesPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={2}
            />
          </View>

          <View style={[styles.elevatedCard, styles.cardPad]}>
            <Text style={styles.sectionLabel}>{t("screens.checkout.promoCode")}</Text>
            {promoApplied ? (
              <View style={styles.promoApplied}>
                <View style={styles.promoAppliedLeft}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                  <Text style={styles.promoAppliedCode}>{promoApplied.code}</Text>
                  <Text style={styles.promoAppliedInfo} numberOfLines={2}>
                    {promoApplied.freeDelivery
                      ? t("screens.checkout.freeDelivery")
                      : t("screens.checkout.offAmount", {
                          amount: formatPrice(promoApplied.discountCents, currencyCode),
                        })}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setPromoApplied(null);
                    setPromoCode("");
                    setPromoError("");
                  }}
                  activeOpacity={0.7}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={24} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.promoRow}>
                <TextInput
                  style={styles.promoInput}
                  placeholder={t("screens.checkout.promoPlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  value={promoCode}
                  onChangeText={(txt) => {
                    setPromoCode(txt.toUpperCase());
                    setPromoError("");
                  }}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[
                    styles.promoButton,
                    (!promoCode.trim() || promoLoading) && styles.promoButtonDisabled,
                  ]}
                  onPress={handleApplyPromo}
                  disabled={!promoCode.trim() || promoLoading}
                  activeOpacity={0.7}
                >
                  {promoLoading ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Text style={styles.promoButtonText}>{t("screens.checkout.apply")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
            {promoError ? <Text style={styles.promoErrorText}>{promoError}</Text> : null}
          </View>

          <View style={[styles.elevatedCard, styles.cardPad]}>
            <Text style={styles.sectionLabel}>{t("screens.checkout.deliveryTime")}</Text>
            <View style={styles.scheduleToggleRow}>
              <TouchableOpacity
                style={[
                  styles.scheduleToggle,
                  scheduleMode === "now" && styles.scheduleToggleActive,
                ]}
                onPress={() => setScheduleMode("now")}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="flash-outline"
                  size={18}
                  color={scheduleMode === "now" ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.scheduleToggleText,
                    scheduleMode === "now" && styles.scheduleToggleTextActive,
                  ]}
                >
                  {t("screens.checkout.asap")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.scheduleToggle,
                  scheduleMode === "later" && styles.scheduleToggleActive,
                ]}
                onPress={() => setScheduleMode("later")}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={scheduleMode === "later" ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.scheduleToggleText,
                    scheduleMode === "later" && styles.scheduleToggleTextActive,
                  ]}
                >
                  {t("screens.checkout.schedule")}
                </Text>
              </TouchableOpacity>
            </View>

            {scheduleMode === "later" && (
              <View style={styles.schedulePickerRow}>
                <TouchableOpacity
                  style={styles.schedulePickerButton}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                  <Text style={styles.schedulePickerText}>
                    {scheduledDate.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.schedulePickerButton}
                  onPress={() => setShowTimePicker(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="time-outline" size={18} color={colors.primary} />
                  <Text style={styles.schedulePickerText}>
                    {scheduledDate.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {showDatePicker && (
              <DateTimePicker
                value={scheduledDate}
                mode="date"
                minimumDate={new Date()}
                onChange={(_, selected) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (selected) {
                    const merged = new Date(scheduledDate);
                    merged.setFullYear(
                      selected.getFullYear(),
                      selected.getMonth(),
                      selected.getDate()
                    );
                    setScheduledDate(merged);
                  }
                }}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={scheduledDate}
                mode="time"
                is24Hour
                onChange={(_, selected) => {
                  setShowTimePicker(Platform.OS === "ios");
                  if (selected) {
                    const merged = new Date(scheduledDate);
                    merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                    setScheduledDate(merged);
                  }
                }}
              />
            )}
          </View>

          {customerCutleryEnabled &&
            (useGroupedShopDetail
              ? draftGroups.some((g, i) => minQueries[i]?.data?.cutleryOffered)
              : Boolean(shopDataSingle?.cutleryOffered)) && (
            <View style={[styles.elevatedCard, styles.cardPad]}>
              <Text style={styles.sectionLabel}>{t("screens.checkout.cutleryTitle")}</Text>
              <Text style={[styles.fieldLabel, { marginBottom: spacing.md }]}>
                {t("screens.checkout.cutlerySubtitle")}
              </Text>
              {useGroupedShopDetail ? (
                <>
                  {draftGroups.map((g, i) => {
                    const detail = minQueries[i]?.data;
                    if (!detail?.cutleryOffered) return null;
                    const key = `${g.projectRef}::${g.shopId}`;
                    const fee = detail.cutleryFeeCents ?? 0;
                    return (
                      <View key={key} style={styles.cutleryRow}>
                        <View style={styles.cutleryRowLabel}>
                          <Text style={styles.cutleryShopName} numberOfLines={1}>
                            {detail.name}
                          </Text>
                          <Text style={styles.cutleryHint}>
                            {fee > 0
                              ? t("screens.checkout.cutleryAdds", {
                                  amount: formatPrice(fee, currencyCode),
                                })
                              : t("screens.checkout.cutleryNoExtra")}
                          </Text>
                        </View>
                        <Switch
                          value={Boolean(cutleryByShopKey[key])}
                          onValueChange={(v) =>
                            setCutleryByShopKey((prev) => ({ ...prev, [key]: v }))
                          }
                          trackColor={{ false: colors.muted, true: `${colors.primary}88` }}
                          thumbColor={cutleryByShopKey[key] ? colors.primary : colors.background}
                        />
                      </View>
                    );
                  })}
                </>
              ) : (
                <View style={styles.cutleryRow}>
                  <View style={styles.cutleryRowLabel}>
                    <Text style={styles.cutleryShopName}>{t("screens.checkout.cutleryInclude")}</Text>
                    <Text style={styles.cutleryHint}>
                      {(shopDataSingle?.cutleryFeeCents ?? 0) > 0
                        ? t("screens.checkout.cutleryAdds", {
                            amount: formatPrice(shopDataSingle!.cutleryFeeCents!, currencyCode),
                          })
                        : t("screens.checkout.cutleryNoExtra")}
                    </Text>
                  </View>
                  <Switch
                    value={wantsCutlerySingle}
                    onValueChange={setWantsCutlerySingle}
                    trackColor={{ false: colors.muted, true: `${colors.primary}88` }}
                    thumbColor={wantsCutlerySingle ? colors.primary : colors.background}
                  />
                </View>
              )}
            </View>
          )}

          <View style={[styles.elevatedCard, styles.cardPad]}>
            <Text style={styles.sectionLabel}>{t("screens.checkout.itemInstructions")}</Text>
            {items.map((item) => (
              <View key={item.id} style={styles.itemNoteRow}>
                <Text style={styles.itemNoteLabel} numberOfLines={2}>
                  {item.name}
                </Text>
                <TextInput
                  style={styles.itemNoteInput}
                  placeholder={t("screens.checkout.itemNotePlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  value={item.notes ?? ""}
                  onChangeText={(txt) => updateItemNotes(item.id, txt)}
                  maxLength={500}
                />
              </View>
            ))}
          </View>

          <View style={[styles.elevatedCard, styles.cardPad]}>
            <Text style={styles.sectionLabel}>{t("screens.checkout.orderSummary")}</Text>
            {items.map((item) => (
              <View key={item.id}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemText} numberOfLines={2}>
                    {item.quantity}× {item.name}
                  </Text>
                  <Text style={styles.summaryItemPrice}>
                    {formatPrice(item.unitPriceCents * item.quantity, currencyCode)}
                  </Text>
                </View>
                {item.selectedModifiers?.length ? (
                  <View style={styles.summaryModifiers}>
                    {item.selectedModifiers.map((m, idx) => (
                      <Text
                        key={`${m.groupName}-${m.optionName}-${idx}`}
                        style={styles.summaryModifierLine}
                        numberOfLines={2}
                      >
                        {m.groupName}: {m.optionName}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {item.notes ? (
                  <Text style={styles.summaryItemNote} numberOfLines={2}>
                    &ldquo;{item.notes}&rdquo;
                  </Text>
                ) : null}
              </View>
            ))}

            <View style={styles.divider} />

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t("screens.checkout.subtotal")}</Text>
              <Text style={styles.summaryValue}>{formatPrice(totalCents, currencyCode)}</Text>
            </View>
            {discount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.success }]}>
                  {t("screens.checkout.discount")}
                </Text>
                <Text style={[styles.summaryValue, { color: colors.success }]}>
                  −{formatPrice(discount, currencyCode)}
                </Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t("screens.checkout.deliveryFee")}</Text>
              <Text style={styles.summaryValue}>
                {promoApplied?.freeDelivery
                  ? t("screens.checkout.free")
                  : formatPrice(dynamicDeliveryFee, currencyCode)}
              </Text>
            </View>
            {cutlerySumCents > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t("screens.checkout.cutleryLine")}</Text>
                <Text style={styles.summaryValue}>
                  {formatPrice(cutlerySumCents, currencyCode)}
                </Text>
              </View>
            )}

            {customerWalletEnabled && useCheckoutDraftFlow && walletBalanceCents > 0 ? (
              <View style={{ marginTop: spacing.md }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing.md,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.summaryLabel}>{t("screens.checkout.useWallet")}</Text>
                    <Text style={[styles.summaryModifierLine, { marginTop: 4 }]} numberOfLines={2}>
                      {t("screens.checkout.walletAvailable", {
                        amount: formatPrice(walletBalanceCents, currencyCode),
                      })}
                    </Text>
                  </View>
                  <Switch
                    value={walletPayEnabled}
                    onValueChange={setWalletPayEnabled}
                    trackColor={{ false: colors.muted, true: `${colors.primary}88` }}
                    thumbColor={walletPayEnabled ? colors.primaryForeground : colors.background}
                  />
                </View>
                {walletPayEnabled && effectiveWalletApply > 0 ? (
                  <>
                    <View style={[styles.summaryRow, { marginTop: spacing.sm }]}>
                      <Text style={styles.summaryLabel}>{t("screens.checkout.walletApplied")}</Text>
                      <Text style={[styles.summaryValue, { color: colors.success }]}>
                        −{formatPrice(effectiveWalletApply, currencyCode)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{t("screens.checkout.cardCharge")}</Text>
                      <Text style={styles.summaryValue}>
                        {formatPrice(stripeChargeCents, currencyCode)}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}

            <View style={styles.divider} />

            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>{t("screens.checkout.total")}</Text>
              <Text style={styles.totalValue}>{formatPrice(grandTotal, currencyCode)}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footerBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          {checkingDelivery && (
            <View style={styles.checkingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.checkingText}>{t("screens.checkout.checkingDelivery")}</Text>
            </View>
          )}

          {cannotDeliver && (
            <View style={styles.deliveryWarning}>
              <Ionicons name="warning-outline" size={20} color={colors.destructive} />
              <Text style={styles.deliveryWarningText}>{cannotDeliverCopy}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.placeOrderButton,
              (loading || cannotDeliver || deliveryCheckPending) && styles.buttonDisabled,
            ]}
            onPress={handlePlaceOrder}
            disabled={loading || cannotDeliver || deliveryCheckPending}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Ionicons name="lock-closed-outline" size={20} color={colors.primaryForeground} />
                <Text style={styles.placeOrderText}>{payLabel}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
