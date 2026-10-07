import { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  Platform,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api, wsClient, API_BASE_URL, getMobileAuthToken } from "@/lib/api";
import { formatPrice, useCurrencyStore } from "@/lib/currency";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import { SCREEN_H_PAD, elevatedCardShadow, screenChromeStyles } from "@/lib/screen-layout";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { useTranslation } from "@dilivygo/i18n";
import { LinearGradient } from "expo-linear-gradient";
import type { Order, OrderItem, OrderStatus } from "@dilivygo/types";
import { latitudeDeltaFromMapDefaultZoom } from "@dilivygo/types";
import { canSubmitOrderRating, getApiErrorMessage } from "@dilivygo/api";

const ORDER_STEPS: { status: OrderStatus; icon: string }[] = [
  { status: "placed", icon: "receipt-outline" },
  { status: "accepted", icon: "checkmark-circle-outline" },
  { status: "preparing", icon: "restaurant-outline" },
  { status: "ready", icon: "bag-check-outline" },
  { status: "assigned", icon: "person-outline" },
  { status: "picked_up", icon: "bicycle-outline" },
  { status: "arrived", icon: "location-outline" },
  { status: "completed", icon: "home-outline" },
];

function getStepIndex(status: OrderStatus) {
  if (status === "cancelled") return -1;
  if (status === "rejected") return -1;
  if (status === "scheduled") return 0;
  return ORDER_STEPS.findIndex((s) => s.status === status);
}

const REFUND_LINK_CONVERSATION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatTimeLeft(deadline: string): string {
  const now = new Date().getTime();
  const end = new Date(deadline).getTime();
  const diff = Math.max(0, end - now);
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function createOrderDetailStyles(c: AppColors) {
  const chrome = screenChromeStyles(c);
  return StyleSheet.create({
    ...chrome,
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      paddingHorizontal: SCREEN_H_PAD,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    rejectedBanner: {
      backgroundColor: c.destructive + "15",
      borderRadius: borderRadius.lg,
      padding: spacing.xl,
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.xl,
      borderWidth: 1,
      borderColor: c.destructive + "40",
    },
    rejectedText: {
      fontSize: fontSize.lg,
      fontWeight: "700",
      color: c.destructive,
    },
    rejectedReason: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      textAlign: "center",
    },
    cancelledBanner: {
      backgroundColor: c.destructive + "10",
      borderRadius: borderRadius.lg,
      padding: spacing.xl,
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.xl,
    },
    cancelledText: {
      fontSize: fontSize.lg,
      fontWeight: "700",
      color: c.destructive,
    },
    cancelledReason: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      textAlign: "center",
    },
    slaBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: c.primary + "12",
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    slaText: {
      fontSize: fontSize.base,
      fontWeight: "600",
      color: c.primary,
    },
    stepper: {
      marginBottom: spacing.xl,
    },
    stepRow: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    stepIndicator: {
      alignItems: "center",
      width: 32,
      marginRight: spacing.md,
    },
    stepDot: {
      width: 28,
      height: 28,
      borderRadius: borderRadius.full,
      backgroundColor: c.muted,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: c.border,
    },
    stepDotActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    stepDotCurrent: {
      backgroundColor: c.primary,
      borderColor: c.primary,
      transform: [{ scale: 1.1 }],
    },
    stepLine: {
      width: 2,
      height: 24,
      backgroundColor: c.border,
    },
    stepLineActive: {
      backgroundColor: c.primary,
    },
    stepLabel: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      paddingTop: spacing.xs,
      fontWeight: "500",
    },
    stepLabelActive: {
      color: c.foreground,
    },
    stepLabelCurrent: {
      color: c.foreground,
      fontWeight: "700",
    },
    section: {
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      fontSize: fontSize.lg,
      fontFamily: fonts.bold,
      color: c.foreground,
      marginBottom: spacing.md,
      letterSpacing: -0.2,
    },
    itemRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    itemInfo: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: spacing.sm,
    },
    itemQty: {
      fontSize: fontSize.sm,
      fontWeight: "700",
      color: c.mutedForeground,
      width: 28,
    },
    itemName: {
      fontSize: fontSize.base,
      color: c.foreground,
      flex: 1,
    },
    itemPrice: {
      fontSize: fontSize.base,
      fontWeight: "600",
      color: c.foreground,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: spacing.md,
    },
    totalCard: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      padding: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      ...elevatedCardShadow(),
    },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    totalLabel: {
      fontSize: fontSize.lg,
      fontWeight: "700",
      color: c.foreground,
    },
    totalValue: {
      fontSize: fontSize.xl,
      fontWeight: "800",
      color: c.foreground,
    },
    ratingSection: {
      marginTop: 0,
      paddingTop: 0,
    },
    ratingTitle: {
      fontSize: fontSize.xl,
      fontFamily: fonts.extrabold,
      color: c.foreground,
      marginBottom: spacing.lg,
      letterSpacing: -0.3,
    },
    ratingSubtitle: {
      fontSize: fontSize.sm,
      fontWeight: "600",
      color: c.mutedForeground,
      marginBottom: spacing.sm,
      marginTop: spacing.md,
    },
    reviewHelper: {
      marginTop: spacing.xs,
      fontSize: fontSize.xs,
      color: c.mutedForeground,
    },
    starRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    starButton: {
      padding: spacing.xs,
    },
    commentInput: {
      backgroundColor: c.muted,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: fontSize.base,
      color: c.foreground,
      minHeight: 80,
      textAlignVertical: "top",
    },
    tipRow: {
      flexDirection: "row",
      gap: spacing.md,
      marginTop: spacing.xs,
    },
    tipButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: c.muted,
    },
    tipButtonActive: {
      backgroundColor: c.primary,
    },
    tipText: {
      fontSize: fontSize.base,
      fontWeight: "600",
      color: c.foreground,
    },
    tipTextActive: {
      color: c.primaryForeground,
    },
    submitButton: {
      backgroundColor: c.primary,
      borderRadius: borderRadius.xl,
      height: 52,
      justifyContent: "center",
      alignItems: "center",
      marginTop: spacing.xl,
      ...elevatedCardShadow(2),
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    submitText: {
      color: c.primaryForeground,
      fontSize: fontSize.base,
      fontFamily: fonts.bold,
    },
    rateLink: {
      marginTop: spacing.md,
      alignItems: "center",
    },
    rateLinkText: {
      fontSize: fontSize.sm,
      color: c.primary,
      fontWeight: "600",
    },
    searchingBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: c.primary + "14",
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    pulsingDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: c.primary,
      opacity: 0.8,
    },
    searchingText: {
      fontSize: fontSize.sm,
      fontWeight: "600",
      color: c.primary,
      flex: 1,
    },
    externalRiderCard: {
      backgroundColor: c.card,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    externalRiderName: {
      fontSize: fontSize.sm,
      fontWeight: "600",
      color: c.foreground,
      marginBottom: spacing.xs,
    },
    externalRiderPhone: {
      fontSize: fontSize.sm,
      color: c.primary,
      fontWeight: "500",
    },
    lateBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: c.warning + "20",
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: c.warning + "50",
    },
    lateBannerTitle: {
      fontSize: fontSize.sm,
      fontWeight: "700",
      color: c.warning,
    },
    lateBannerSub: {
      fontSize: fontSize.xs,
      color: c.mutedForeground,
      marginTop: 2,
    },
    mapContainer: {
      height: 220,
      borderRadius: borderRadius.xl + 4,
      overflow: "hidden",
      marginBottom: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      position: "relative",
      ...elevatedCardShadow(),
    },
    map: {
      ...StyleSheet.absoluteFillObject,
    },
    riderMarker: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "#2563EB",
      borderWidth: 3,
      borderColor: c.card,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
    liveIndicator: {
      position: "absolute",
      bottom: spacing.sm,
      left: spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: c.muted,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: borderRadius.full,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 2,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.success,
    },
    liveText: {
      fontSize: fontSize.xs,
      fontWeight: "600",
      color: c.foreground,
    },
    chatSection: {
      marginTop: spacing.lg,
      gap: spacing.sm,
    },
    chatBtn: {
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}18`,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      backgroundColor: c.muted,
      minHeight: 88,
    },
    chatBtnText: {
      fontSize: fontSize.xs,
      fontFamily: fonts.semibold,
      color: c.primary,
      textAlign: "center",
      lineHeight: 16,
    },
    receiptPdfBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.lg,
      backgroundColor: c.card,
    },
    receiptPdfBtnText: {
      fontSize: fontSize.sm,
      fontWeight: "600",
      color: c.primary,
    },
    deliveryNotesCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      backgroundColor: c.warning + "18",
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: c.warning + "45",
    },
    deliveryNotesTitle: {
      fontSize: fontSize.sm,
      fontWeight: "700",
      color: c.warning,
      marginBottom: 2,
    },
    deliveryNotesText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      lineHeight: 20,
    },
    heroCard: {
      borderRadius: borderRadius.xl + 4,
      marginBottom: spacing.lg,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      backgroundColor: c.card,
      ...elevatedCardShadow(),
    },
    heroGradient: {
      ...StyleSheet.absoluteFillObject,
      height: 4,
    },
    heroInner: {
      padding: spacing.lg,
      paddingTop: spacing.md + 4,
    },
    heroTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: spacing.md,
    },
    heroShop: {
      fontSize: fontSize["2xl"],
      fontFamily: fonts.extrabold,
      color: c.foreground,
      letterSpacing: -0.5,
      flex: 1,
      minWidth: 0,
    },
    heroHeadline: {
      marginTop: spacing.sm,
      fontSize: fontSize.base,
      fontFamily: fonts.semibold,
      color: c.mutedForeground,
      lineHeight: 22,
    },
    statusPill: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      backgroundColor: `${c.primary}14`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.primary}33`,
    },
    statusPillText: {
      fontSize: fontSize.xs,
      fontFamily: fonts.bold,
      color: c.primary,
      letterSpacing: 0.3,
      textTransform: "uppercase" as const,
    },
    stepperScroll: {
      marginBottom: spacing.lg,
    },
    stepperScrollContent: {
      paddingVertical: spacing.sm,
      gap: spacing.xs,
      paddingRight: SCREEN_H_PAD,
    },
    stepCell: {
      alignItems: "center",
      width: 76,
    },
    stepConnector: {
      position: "absolute",
      left: 58,
      top: 18,
      width: 28,
      height: 3,
      borderRadius: 2,
      backgroundColor: c.border,
    },
    stepConnectorDone: {
      backgroundColor: c.primary,
    },
    stepIconRing: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.muted,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    stepIconRingDone: {
      backgroundColor: `${c.primary}18`,
      borderColor: c.primary,
    },
    stepIconRingCurrent: {
      backgroundColor: c.primary,
      borderColor: c.primary,
      transform: [{ scale: 1.06 }],
    },
    stepCellLabel: {
      marginTop: spacing.sm,
      fontSize: 10,
      fontFamily: fonts.semibold,
      color: c.mutedForeground,
      textAlign: "center",
      lineHeight: 13,
      maxWidth: 72,
    },
    stepCellLabelActive: {
      color: c.foreground,
    },
    stepCellLabelCurrent: {
      color: c.primary,
    },
    cardBlock: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      ...elevatedCardShadow(),
    },
    sectionLabel: {
      ...screenChromeStyles(c).sectionLabel,
      marginTop: 0,
    },
    chatRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    chatBtnHalf: {
      flex: 1,
      minWidth: 0,
    },
    refundStatusText: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      marginBottom: spacing.sm,
      fontFamily: fonts.regular,
    },
    refundCta: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.xs,
      paddingVertical: spacing.sm,
    },
    refundCtaText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: c.primary,
    },
    modalBackdrop: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    modalSheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: borderRadius.xl + 4,
      borderTopRightRadius: borderRadius.xl + 4,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl + 8,
    },
    modalTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: c.foreground,
      marginBottom: spacing.sm,
    },
    modalHint: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      marginBottom: spacing.md,
    },
    modalLabel: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.foreground,
      marginBottom: spacing.xs,
    },
    modalInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}22`,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: fontSize.sm,
      color: c.foreground,
      marginBottom: spacing.md,
      minHeight: 88,
      textAlignVertical: "top",
    },
    modalRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    modalBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.full,
      alignItems: "center",
      backgroundColor: c.muted,
    },
    modalBtnPrimary: {
      backgroundColor: c.primary,
    },
    modalBtnText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: c.foreground,
    },
    modalBtnTextPrimary: {
      color: c.primaryForeground,
    },
  });
}

export default function OrderDetailScreen() {
  const { id, conversationId: refundConvParam } = useLocalSearchParams<{
    id: string;
    conversationId?: string;
  }>();
  const refundConversationId =
    typeof refundConvParam === "string" && REFUND_LINK_CONVERSATION_UUID_RE.test(refundConvParam)
      ? refundConvParam
      : undefined;
  const router = useRouter();
  const queryClient = useQueryClient();
  const mapSettings = useCurrencyStore((s) => s.mapSettings);
  const riderPinColor = mapSettings?.riderMarkerColor ?? "#2563EB";
  const mapRegionDelta = useMemo(
    () => latitudeDeltaFromMapDefaultZoom(mapSettings?.defaultZoom ?? 14),
    [mapSettings?.defaultZoom],
  );
  const [liveStatus, setLiveStatus] = useState<OrderStatus | null>(null);
  const [rejectedReasonFromWs, setRejectedReasonFromWs] = useState<string | null>(null);
  const [slaCountdown, setSlaCountdown] = useState<string>("");
  const [vendorRating, setVendorRating] = useState(0);
  const [riderRating, setRiderRating] = useState(0);
  const [comment, setComment] = useState("");
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [hasExistingShopReview, setHasExistingShopReview] = useState(false);
  const [riderLocation, setRiderLocation] = useState<{
    lat: number;
    lon: number;
    heading?: number | null;
    speed?: number | null;
  } | null>(null);
  const [receiptPdfBusy, setReceiptPdfBusy] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundReasonText, setRefundReasonText] = useState("");
  const [refundPartialText, setRefundPartialText] = useState("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createOrderDetailStyles);
  const { t } = useTranslation("mobile");

  const { data: order, isLoading } = useQuery<Order & { items: OrderItem[] }>({
    queryKey: ["order", id],
    queryFn: () => api.orders.get(id!),
    enabled: !!id,
  });

  const customerRefundRequestsEnabled = useCurrencyStore((s) => s.customerRefundRequestsEnabled);
  const canRequestRefundStatus =
    !!order &&
    ["completed", "rejected", "cancelled"].includes(order.status) &&
    order.paymentStatus === "paid";

  const { data: refundReqPayload } = useQuery({
    queryKey: ["customer-refund-request", id],
    queryFn: () => api.orders.getRefundRequest(id!),
    enabled: !!id && customerRefundRequestsEnabled && canRequestRefundStatus,
  });
  const refundRequest = refundReqPayload?.refundRequest ?? null;

  const { data: existingReview } = useQuery({
    queryKey: ["order-review-inline", id],
    queryFn: () => api.reviews.getMyOrderReview(id!),
    enabled: !!id,
    retry: false,
  });

  useEffect(() => {
    if (!existingReview) return;
    setHasExistingShopReview(true);
    setVendorRating(existingReview.rating);
    if (existingReview.comment) setComment(existingReview.comment);
  }, [existingReview]);

  useEffect(() => {
    wsClient.connect();
    const unsubStatus = wsClient.subscribe("order:status_changed", (event: any) => {
      if (event.orderId === id) {
        setLiveStatus(event.status);
        queryClient.invalidateQueries({ queryKey: ["order", id] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      }
    });
    const unsubRejected = wsClient.subscribe("order:rejected", (event: any) => {
      if (event.orderId === id) {
        setLiveStatus("rejected");
        setRejectedReasonFromWs(event.reason || null);
        queryClient.invalidateQueries({ queryKey: ["order", id] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        Alert.alert("Order Rejected", event.reason || "Your order was rejected by the vendor.");
      }
    });
    const unsubDelayed = wsClient.subscribe("order:delayed", (event: any) => {
      if (event.orderId === id) {
        queryClient.invalidateQueries({ queryKey: ["order", id] });
        Alert.alert("Order Delayed", "Your order has been delayed. We'll keep you updated.");
      }
    });
    const unsubLocation = wsClient.subscribe("delivery:location_update", (event: any) => {
      if (order?.delivery?.id && event.deliveryId === order.delivery.id) {
        setRiderLocation({
          lat: event.lat,
          lon: event.lon,
          heading: event.heading,
          speed: event.speed,
        });
      }
    });
    const unsubRefund = wsClient.subscribe("refund_request:updated", (event: any) => {
      if (event.orderId === id) {
        queryClient.invalidateQueries({ queryKey: ["order", id] });
        queryClient.invalidateQueries({ queryKey: ["customer-refund-request", id] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      }
    });
    return () => {
      unsubStatus();
      unsubRejected();
      unsubDelayed();
      unsubLocation();
      unsubRefund();
    };
  }, [id, queryClient, order?.delivery?.id]);

  useEffect(() => {
    if (!order?.delivery?.id || !id) return;
    api.orders
      .getRiderLocation(id)
      .then(({ location }: any) => {
        setRiderLocation({
          lat: location.lat,
          lon: location.lon,
          heading: location.heading,
          speed: location.speed,
        });
      })
      .catch(() => {});
  }, [order?.delivery?.id, id]);

  const currentStatus = liveStatus || order?.status;

  useEffect(() => {
    if (!order?.slaDeadline || !currentStatus) return;
    const inCountdown =
      currentStatus === "accepted" || currentStatus === "preparing";
    if (!inCountdown) return;
    const tick = () => setSlaCountdown(formatTimeLeft(order.slaDeadline!));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [order?.slaDeadline, currentStatus]);

  const stepIndex = currentStatus ? getStepIndex(currentStatus) : -1;
  const isCancelled = currentStatus === "cancelled";
  const isRejected = currentStatus === "rejected";
  const isCompleted = currentStatus === "completed";
  const showSla =
    order?.slaDeadline &&
    (currentStatus === "accepted" || currentStatus === "preparing");

  const orderCurrency = order?.currency;
  const statusPillLabel = !currentStatus
    ? ""
    : currentStatus === "cancelled"
      ? t("screens.orderDetail.cancelledTitle")
      : currentStatus === "rejected"
        ? t("screens.orderDetail.rejectedTitle")
        : currentStatus === "scheduled"
          ? t("screens.orderDetail.statusHeadline.scheduled")
          : ORDER_STEPS.some((s) => s.status === currentStatus)
            ? (t as (k: string) => string)(`screens.orderDetail.steps.${currentStatus}`)
            : t("screens.orderDetail.statusHeadline.default");

  const riderIdForRating = order?.delivery?.riderId;
  const tipCentsResolved = (tipAmount ?? 0) * 100;
  const canSubmitRatingForm = order
    ? canSubmitOrderRating({
        shopId: order.shopId,
        existingShopReview: hasExistingShopReview,
        vendorRating,
        riderId: riderIdForRating,
        riderRating,
        tipCents: tipCentsResolved,
      })
    : false;

  const downloadReceiptPdf = async () => {
    const status = liveStatus || order?.status;
    if (!order || status !== "completed") return;
    const token = getMobileAuthToken();
    if (!token) {
      Alert.alert("Error", "Please sign in again.");
      return;
    }
    const base = FileSystem.cacheDirectory;
    if (!base) {
      Alert.alert("Error", "Storage is not available on this device.");
      return;
    }
    setReceiptPdfBusy(true);
    try {
      const dest = `${base}receipt-${order.id.slice(0, 8)}.pdf`;
      const result = await FileSystem.downloadAsync(
        `${API_BASE_URL}/api/orders/${order.id}/receipt.pdf`,
        dest,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result.status !== 200) throw new Error("Download failed");
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(result.uri);
      else Alert.alert("Receipt saved", result.uri);
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Could not download receipt";
      Alert.alert("Error", msg);
    } finally {
      setReceiptPdfBusy(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!order) return;
    const riderId = order.delivery?.riderId;
    const tipCents = (tipAmount ?? 0) * 100;
    if (
      !canSubmitOrderRating({
        shopId: order.shopId,
        existingShopReview: hasExistingShopReview,
        vendorRating,
        riderId,
        riderRating,
        tipCents,
      })
    ) {
      const needShop = Boolean(order.shopId && !hasExistingShopReview);
      const needRider = Boolean(riderId);
      let msg = t("screens.orderDetail.ratingRequiredGeneric");
      if (needShop && needRider) msg = t("screens.orderDetail.ratingRequiredBoth");
      else if (needShop) msg = t("screens.orderDetail.ratingRequiredShop");
      else if (needRider) msg = t("screens.orderDetail.ratingRequiredRider");
      Alert.alert(t("screens.orderDetail.ratingRequiredTitle"), msg);
      return;
    }
    setRatingSubmitting(true);
    try {
      if (order.shopId && vendorRating > 0 && !hasExistingShopReview) {
        await api.reviews.create({
          orderId: order.id,
          rating: vendorRating,
          comment: comment.trim() || undefined,
        });
      }
      if (riderId && riderRating > 0) {
        await api.ratings.create({
          orderId: order.id,
          toUserId: riderId,
          toRole: "rider",
          rating: riderRating,
          comment: comment.trim() || undefined,
        });
      }
      if (riderId && tipCents > 0) {
        await api.tips.create({
          orderId: order.id,
          toRiderId: riderId,
          amountCents: tipCents,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      router.replace("/(tabs)/orders");
    } catch (err: unknown) {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to submit rating"));
    } finally {
      setRatingSubmitting(false);
    }
  };

  const submitRefundRequest = async () => {
    if (!order || !refundReasonText.trim()) {
      Alert.alert(
        t("screens.orderDetail.refundNeedReasonTitle"),
        t("screens.orderDetail.refundNeedReasonMsg"),
      );
      return;
    }
    let partial: number | undefined;
    if (refundPartialText.trim()) {
      const n = parseInt(refundPartialText, 10);
      if (Number.isNaN(n) || n <= 0 || n > order.totalCents) {
        Alert.alert(
          t("screens.orderDetail.refundInvalidTitle"),
          t("screens.orderDetail.refundInvalidMsg"),
        );
        return;
      }
      partial = n;
    }
    setRefundSubmitting(true);
    try {
      await api.orders.createRefundRequest(order.id, {
        reason: refundReasonText.trim(),
        requestedAmountCents: partial,
        ...(refundConversationId ? { conversationId: refundConversationId } : {}),
      });
      setRefundModalOpen(false);
      setRefundReasonText("");
      setRefundPartialText("");
      if (refundConversationId) {
        router.replace(`/order/${id}`);
      }
      void queryClient.invalidateQueries({ queryKey: ["customer-refund-request", id] });
      void queryClient.invalidateQueries({ queryKey: ["order", id] });
      Alert.alert(
        t("screens.orderDetail.refundSuccessTitle"),
        t("screens.orderDetail.refundSuccessMsg"),
      );
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as Error).message)
          : "Failed";
      Alert.alert(t("screens.orderDetail.refundErrorTitle"), msg);
    } finally {
      setRefundSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: order ? `#${order.id.slice(-8).toUpperCase()}` : t("screens.orderDetail.navFallback"),
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground, fontFamily: fonts.semibold },
          headerShadowVisible: false,
        }}
      />

      {isLoading || !order ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <LinearGradient
              colors={[`${colors.primary}55`, `${colors.primary}00`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.heroGradient}
            />
            <View style={styles.heroInner}>
              <View style={styles.heroTopRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.headerEyebrow}>#{order.id.slice(-8).toUpperCase()}</Text>
                  <Text style={styles.heroShop} numberOfLines={2}>
                    {order.shop?.name ?? t("screens.orderDetail.navFallback")}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    (isRejected || isCancelled) && {
                      backgroundColor: `${colors.destructive}18`,
                      borderColor: `${colors.destructive}44`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      (isRejected || isCancelled) && { color: colors.destructive },
                    ]}
                    numberOfLines={1}
                  >
                    {statusPillLabel}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroHeadline} numberOfLines={2}>
                {(t as (k: string) => string)(
                  `screens.orderDetail.statusHeadline.${currentStatus ?? "default"}`
                )}
              </Text>
            </View>
          </View>

          {isCompleted && (
            <TouchableOpacity
              style={styles.receiptPdfBtn}
              onPress={() => void downloadReceiptPdf()}
              disabled={receiptPdfBusy}
              activeOpacity={0.85}
            >
              {receiptPdfBusy ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={22} color={colors.primary} />
                  <Text style={styles.receiptPdfBtnText}>{t("screens.orderDetail.receiptPdf")}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {!isRejected && !isCancelled && (order as any).slaBreached &&
            !["completed", "cancelled", "rejected"].includes(currentStatus ?? "") && (
            <View style={styles.lateBanner}>
              <Ionicons name="warning-outline" size={20} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.lateBannerTitle}>{t("screens.orderDetail.lateTitle")}</Text>
                <Text style={styles.lateBannerSub}>{t("screens.orderDetail.lateSub")}</Text>
              </View>
            </View>
          )}

          {isRejected ? (
            <View style={styles.rejectedBanner}>
              <Ionicons name="close-circle" size={24} color={colors.destructive} />
              <Text style={styles.rejectedText}>{t("screens.orderDetail.rejectedTitle")}</Text>
              {(order.rejectionReason || rejectedReasonFromWs) && (
                <Text style={styles.rejectedReason}>
                  {order.rejectionReason || rejectedReasonFromWs}
                </Text>
              )}
            </View>
          ) : isCancelled ? (
            <View style={styles.cancelledBanner}>
              <Ionicons name="close-circle" size={24} color={colors.destructive} />
              <Text style={styles.cancelledText}>{t("screens.orderDetail.cancelledTitle")}</Text>
              {order.cancellationReason && (
                <Text style={styles.cancelledReason}>
                  {order.cancellationReason}
                </Text>
              )}
            </View>
          ) : (
            <>
              {showSla && (
                <View style={styles.slaBanner}>
                  <Ionicons name="time-outline" size={20} color={colors.primary} />
                  <Text style={styles.slaText}>
                    {t("screens.orderDetail.readyIn", { time: slaCountdown })}
                  </Text>
                </View>
              )}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.stepperScroll}
                contentContainerStyle={styles.stepperScrollContent}
              >
                {ORDER_STEPS.map((step, i) => {
                  const done = i < stepIndex;
                  const current = i === stepIndex;
                  const reached = i <= stepIndex;
                  const iconName = reached && !current ? "checkmark" : (step.icon as "restaurant-outline");
                  const iconColor = current
                    ? colors.primaryForeground
                    : reached
                      ? colors.primary
                      : colors.mutedForeground;
                  return (
                    <View key={step.status} style={styles.stepCell}>
                      <View
                        style={[
                          styles.stepIconRing,
                          reached && styles.stepIconRingDone,
                          current && styles.stepIconRingCurrent,
                        ]}
                      >
                        <Ionicons name={iconName as keyof typeof Ionicons.glyphMap} size={18} color={iconColor} />
                      </View>
                      <Text
                        style={[
                          styles.stepCellLabel,
                          reached && styles.stepCellLabelActive,
                          current && styles.stepCellLabelCurrent,
                        ]}
                        numberOfLines={2}
                      >
                        {(t as (k: string) => string)(`screens.orderDetail.steps.${step.status}`)}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </>
          )}

          {order.delivery?.riderId &&
            riderLocation &&
            ["assigned", "picked_up", "arrived"].includes(currentStatus ?? "") && (
              <View style={styles.mapContainer}>
                <MapView
                  ref={mapRef}
                  style={styles.map}
                  initialRegion={{
                    latitude: riderLocation.lat,
                    longitude: riderLocation.lon,
                    latitudeDelta: mapRegionDelta,
                    longitudeDelta: mapRegionDelta,
                  }}
                  region={{
                    latitude: riderLocation.lat,
                    longitude: riderLocation.lon,
                    latitudeDelta: mapRegionDelta,
                    longitudeDelta: mapRegionDelta,
                  }}
                >
                  <Marker
                    coordinate={{
                      latitude: riderLocation.lat,
                      longitude: riderLocation.lon,
                    }}
                    title={t("screens.orderDetail.yourRider")}
                    description={
                      typeof riderLocation.speed === "number" && riderLocation.speed > 0
                        ? `${Math.round(riderLocation.speed * 3.6)} km/h`
                        : t("screens.orderDetail.riderOnWay")
                    }
                  >
                    <View style={[styles.riderMarker, { backgroundColor: riderPinColor }]}>
                      <Ionicons name="bicycle" size={18} color="#fff" />
                    </View>
                  </Marker>
                </MapView>
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>{t("screens.orderDetail.liveTracking")}</Text>
                </View>
              </View>
            )}

          {(currentStatus === "ready" || (currentStatus === "assigned" && !order.delivery?.riderId)) && (
            <View style={styles.searchingBanner}>
              <View style={styles.pulsingDot} />
              <Text style={styles.searchingText}>{t("screens.orderDetail.searchingRider")}</Text>
            </View>
          )}

          {order.delivery?.isExternal && (
            <View style={styles.cardBlock}>
              <Text style={styles.externalRiderName}>
                {t("screens.orderDetail.yourRider")}: {order.delivery.externalRiderName}
              </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${order.delivery?.externalRiderPhone}`)}
                activeOpacity={0.7}
              >
                <Text style={styles.externalRiderPhone}>
                  {t("screens.orderDetail.callLabel", { phone: order.delivery.externalRiderPhone ?? "" })}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {((order as any).deliveryNotes || (order as any).delivery_notes) && (
            <View style={styles.deliveryNotesCard}>
              <Ionicons name="document-text-outline" size={18} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.deliveryNotesTitle}>{t("screens.orderDetail.deliveryInstructions")}</Text>
                <Text style={styles.deliveryNotesText}>
                  {(order as any).deliveryNotes || (order as any).delivery_notes}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.cardBlock}>
            <Text style={styles.sectionLabel}>{t("screens.orderDetail.items")}</Text>
            {order.items?.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemQty}>{item.quantity}×</Text>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                </View>
                <Text style={styles.itemPrice}>
                  {formatPrice(item.unitPriceCents * item.quantity, orderCurrency)}
                </Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("screens.orderDetail.total")}</Text>
              <Text style={styles.totalValue}>{formatPrice(order.totalCents, orderCurrency)}</Text>
            </View>
          </View>

          {customerRefundRequestsEnabled && canRequestRefundStatus && (
            <View style={styles.cardBlock}>
              <Text style={styles.sectionLabel}>{t("screens.orderDetail.refundTitle")}</Text>
              {refundRequest?.status === "pending" && (
                <Text style={styles.refundStatusText}>{t("screens.orderDetail.refundPending")}</Text>
              )}
              {refundRequest?.status === "approved" && (
                <Text style={styles.refundStatusText}>{t("screens.orderDetail.refundApproved")}</Text>
              )}
              {refundRequest?.status === "rejected" && (
                <Text style={styles.refundStatusText}>{t("screens.orderDetail.refundRejected")}</Text>
              )}
              {(!refundRequest ||
                refundRequest.status === "rejected" ||
                refundRequest.status === "cancelled") && (
                <TouchableOpacity
                  style={styles.refundCta}
                  onPress={() => setRefundModalOpen(true)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="cash-outline" size={20} color={colors.primary} />
                  <Text style={styles.refundCtaText}>{t("screens.orderDetail.refundCta")}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!isRejected && !isCancelled && (
            <View style={styles.chatSection}>
              {order.delivery?.riderId ? (
                <View style={styles.chatRow}>
                  <TouchableOpacity
                    style={[styles.chatBtn, styles.chatBtnHalf]}
                    onPress={() =>
                      router.push(
                        `/conversation/${order.id}?orderId=${order.id}&type=customer_vendor` as any
                      )
                    }
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chatbubbles-outline" size={20} color={colors.primary} />
                    <Text style={styles.chatBtnText} numberOfLines={2}>
                      {t("screens.orderDetail.chatRestaurant")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chatBtn, styles.chatBtnHalf]}
                    onPress={() =>
                      router.push(
                        `/conversation/${order.id}?orderId=${order.id}&type=customer_rider` as any
                      )
                    }
                    activeOpacity={0.7}
                  >
                    <Ionicons name="bicycle-outline" size={20} color={colors.primary} />
                    <Text style={styles.chatBtnText} numberOfLines={2}>
                      {t("screens.orderDetail.chatRider")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.chatBtn}
                  onPress={() =>
                    router.push(
                      `/conversation/${order.id}?orderId=${order.id}&type=customer_vendor` as any
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Ionicons name="chatbubbles-outline" size={20} color={colors.primary} />
                  <Text style={styles.chatBtnText} numberOfLines={2}>
                    {t("screens.orderDetail.chatRestaurant")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {isCompleted && (
            <View style={[styles.cardBlock, styles.ratingSection]}>
              <Text style={styles.ratingTitle}>{t("screens.orderDetail.rateTitle")}</Text>
              <Text style={styles.reviewHelper}>{t("screens.orderDetail.rateHelper")}</Text>

              {order.shopId ? (
                <>
                  <Text style={styles.ratingSubtitle}>{t("screens.orderDetail.shopRating")}</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setVendorRating(n)}
                        style={styles.starButton}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={n <= vendorRating ? "star" : "star-outline"}
                          size={28}
                          color={n <= vendorRating ? colors.warning : colors.mutedForeground}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                  {hasExistingShopReview ? (
                    <Text style={styles.reviewHelper}>{t("screens.orderDetail.shopReviewDone")}</Text>
                  ) : null}
                </>
              ) : null}

              {order.delivery?.riderId ? (
                <>
                  <Text style={styles.ratingSubtitle}>{t("screens.orderDetail.riderRating")}</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setRiderRating(n)}
                        style={styles.starButton}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={n <= riderRating ? "star" : "star-outline"}
                          size={28}
                          color={n <= riderRating ? colors.warning : colors.mutedForeground}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.ratingSubtitle}>{t("screens.orderDetail.tipOptional")}</Text>
                  <View style={styles.tipRow}>
                    {[1, 2, 5].map((amount) => (
                      <TouchableOpacity
                        key={amount}
                        style={[
                          styles.tipButton,
                          tipAmount === amount && styles.tipButtonActive,
                        ]}
                        onPress={() => setTipAmount(tipAmount === amount ? null : amount)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.tipText, tipAmount === amount && styles.tipTextActive]}>
                          {formatPrice(amount * 100, orderCurrency)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}

              <Text style={styles.ratingSubtitle}>{t("screens.orderDetail.commentOptional")}</Text>
              <TextInput
                style={styles.commentInput}
                placeholder={t("screens.orderDetail.commentPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity
                style={[styles.submitButton, ratingSubmitting && styles.buttonDisabled]}
                onPress={handleSubmitRating}
                disabled={ratingSubmitting || !canSubmitRatingForm}
                activeOpacity={0.8}
              >
                {ratingSubmitting ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={styles.submitText}>{t("screens.orderDetail.submit")}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.rateLink}
                onPress={() => router.push(`/rate/${order.id}`)}
                activeOpacity={0.7}
              >
                <Text style={styles.rateLinkText}>{t("screens.orderDetail.fullReviewLink")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      <Modal
        visible={refundModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => !refundSubmitting && setRefundModalOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => !refundSubmitting && setRefundModalOpen(false)}
          />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>{t("screens.orderDetail.refundModalTitle")}</Text>
              <Text style={styles.modalHint}>{t("screens.orderDetail.refundModalHint")}</Text>
              <Text style={styles.modalLabel}>{t("screens.orderDetail.refundReasonLabel")}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder={t("screens.orderDetail.refundReasonPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={refundReasonText}
                onChangeText={setRefundReasonText}
                multiline
              />
              <Text style={styles.modalLabel}>{t("screens.orderDetail.refundPartialLabel")}</Text>
              <TextInput
                style={[styles.modalInput, { minHeight: 44 }]}
                placeholder={t("screens.orderDetail.refundPartialPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={refundPartialText}
                onChangeText={setRefundPartialText}
                keyboardType="number-pad"
              />
              <View style={styles.modalRow}>
                <TouchableOpacity
                  style={styles.modalBtn}
                  onPress={() => !refundSubmitting && setRefundModalOpen(false)}
                  disabled={refundSubmitting}
                >
                  <Text style={styles.modalBtnText}>{t("screens.orderDetail.refundCancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={() => void submitRefundRequest()}
                  disabled={refundSubmitting || !refundReasonText.trim()}
                >
                  {refundSubmitting ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>
                      {t("screens.orderDetail.refundSubmit")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}
