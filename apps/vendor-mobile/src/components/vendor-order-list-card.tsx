import type { ComponentProps } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Order, OrderItem, PaymentStatus } from "@dilivygo/types";
import type { AppColors } from "@/lib/theme";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import { formatPrice } from "@/lib/currency";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatSlaCountdown(slaDeadline: string): string {
  const diff = new Date(slaDeadline).getTime() - Date.now();
  if (diff <= 0) return "Overdue";
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  if (hrs >= 1) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

function formatScheduledShort(iso: string, localeTag: string): string {
  try {
    return new Date(iso).toLocaleString(localeTag, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function truncateOneLine(s: string, max = 52): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatItemLine(it: OrderItem): string {
  const modStr = it.modifiers?.map((m) => m.optionName).filter(Boolean).join(", ");
  const base = `${it.quantity}× ${it.name}`;
  return modStr ? `${base} (${modStr})` : base;
}

function buildItemSummary(items: OrderItem[] | undefined, maxLines = 3): string {
  if (!items?.length) return "";
  const parts = items.slice(0, maxLines).map(formatItemLine);
  const more = items.length > maxLines ? ` +${items.length - maxLines}` : "";
  return parts.join(" · ") + more;
}

export type OrdersDashboardT = (key: string, opts?: Record<string, unknown>) => string;

function paymentMeta(
  status: PaymentStatus,
  t: OrdersDashboardT,
): { label: string; colorKey: "success" | "warning" | "destructive" | "muted" } {
  if (status === "succeeded" || status === "paid")
    return { label: t("ordersDashboard.paymentPaid"), colorKey: "success" };
  if (status === "pending" || status === "unpaid")
    return { label: t("ordersDashboard.paymentPending"), colorKey: "warning" };
  if (status === "failed") return { label: t("ordersDashboard.paymentFailed"), colorKey: "destructive" };
  if (status === "refunded" || status === "partially_refunded")
    return { label: t("ordersDashboard.paymentRefunded"), colorKey: "muted" };
  return { label: t("ordersDashboard.paymentPending"), colorKey: "warning" };
}

function deliveryStatusLabel(status: string, t: OrdersDashboardT): string {
  const key = `ordersDashboard.deliveryStatus.${status}` as const;
  const v = t(key);
  return v === key ? status : v;
}

export interface VendorOrderListCardProps {
  item: Order;
  isFlashing: boolean;
  colors: AppColors;
  statusColor: string;
  localeTag: string;
  t: OrdersDashboardT;
  onOpen: () => void;
  onAccept: () => void;
  onReject: () => void;
  onStartPreparing: () => void;
  onMarkReady: () => void;
  acceptPending: boolean;
  rejectPending: boolean;
  statusPending: boolean;
}

export function VendorOrderListCard({
  item,
  isFlashing,
  colors,
  statusColor,
  localeTag,
  t,
  onOpen,
  onAccept,
  onReject,
  onStartPreparing,
  onMarkReady,
  acceptPending,
  rejectPending,
  statusPending,
}: VendorOrderListCardProps) {
  const isPlaced = item.status === "placed";
  const isAccepted = item.status === "accepted";
  const isPreparing = item.status === "preparing";
  const isScheduled = item.status === "scheduled";
  const showSla =
    item.slaDeadline &&
    (["placed", "accepted", "preparing", "ready"].includes(item.status) || isScheduled);

  const pay = paymentMeta(item.paymentStatus, t);
  const payColor =
    pay.colorKey === "success"
      ? colors.success
      : pay.colorKey === "warning"
        ? colors.warning
        : pay.colorKey === "destructive"
          ? colors.destructive
          : colors.mutedForeground;

  const shortId = item.id.slice(0, 8).toUpperCase();
  const itemSummary = buildItemSummary(item.items);
  const currency = item.currency;
  const lineCount = item.items?.length ?? 0;

  let fulfillmentLine: { icon: ComponentProps<typeof Ionicons>["name"]; text: string } | null = null;
  if (item.posCheckoutMode === "quick") {
    fulfillmentLine = { icon: "storefront-outline", text: t("ordersDashboard.posQuick") };
  } else if (item.posCheckoutMode === "kitchen") {
    fulfillmentLine = { icon: "restaurant-outline", text: t("ordersDashboard.posKitchen") };
  } else if (isScheduled && item.scheduledFor) {
    fulfillmentLine = {
      icon: "calendar-outline",
      text: t("ordersDashboard.scheduledFor", {
        time: formatScheduledShort(item.scheduledFor, localeTag),
      }),
    };
  } else if (item.deliveryAddress?.trim()) {
    fulfillmentLine = {
      icon: "location-outline",
      text: `${t("ordersDashboard.deliveryTo")}: ${truncateOneLine(item.deliveryAddress, 48)}`,
    };
  } else {
    fulfillmentLine = { icon: "bag-outline", text: t("ordersDashboard.pickupOrNoAddress") };
  }

  const showDeliveryRow =
    item.delivery &&
    ["ready", "assigned", "picked_up", "arrived", "completed"].includes(item.status);

  const prepHint =
    item.prepTimeMinutes && ["accepted", "preparing", "ready"].includes(item.status)
      ? t("ordersDashboard.prepTarget", { minutes: item.prepTimeMinutes })
      : null;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isFlashing ? colors.primary : colors.border,
          borderWidth: isFlashing ? 2 : 1,
          shadowColor: isFlashing ? colors.primary : colors.foreground,
          shadowOpacity: isFlashing ? 0.28 : 0.06,
          shadowRadius: isFlashing ? 10 : 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: isFlashing ? 5 : 2,
        },
      ]}
      onPress={onOpen}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={`${t("tabs.orders")} #${shortId}, ${t(`orderStatus.${item.status}`)}, ${formatPrice(item.totalCents, currency)}`}
    >
      <View style={styles.topRow}>
        <View style={styles.idBlock}>
          <Text style={[styles.orderId, { color: colors.foreground }]}>{`#${shortId}`}</Text>
          <Text style={[styles.timeAgo, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
        </View>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: statusColor + "22" }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>{t(`orderStatus.${item.status}`)}</Text>
          </View>
          <View style={[styles.payBadge, { backgroundColor: payColor + "18" }]}>
            <Text style={[styles.payBadgeText, { color: payColor }]}>{pay.label}</Text>
          </View>
        </View>
      </View>

      <View style={styles.totalRow}>
        <Text style={[styles.totalMain, { color: colors.foreground }]}>
          {formatPrice(item.totalCents, currency)}
        </Text>
        <Text style={[styles.itemCount, { color: colors.mutedForeground }]}>
          {lineCount > 0 ? t("ordersDashboard.itemCount", { count: lineCount }) : t("ordersDashboard.itemCountZero")}
        </Text>
      </View>

      {(item.deliveryFeeCents != null && item.deliveryFeeCents > 0) || (item.discountCents != null && item.discountCents > 0) ? (
        <View style={styles.moneyMetaRow}>
          {item.deliveryFeeCents != null && item.deliveryFeeCents > 0 ? (
            <Text style={[styles.moneyMeta, { color: colors.mutedForeground }]}>
              {t("ordersDashboard.deliveryFee", { amount: formatPrice(item.deliveryFeeCents, currency) })}
            </Text>
          ) : null}
          {item.discountCents != null && item.discountCents > 0 ? (
            <Text style={[styles.moneyMeta, { color: colors.success }]}>
              {t("ordersDashboard.discount", { amount: formatPrice(item.discountCents, currency) })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {fulfillmentLine ? (
        <View style={styles.iconRow}>
          <Ionicons name={fulfillmentLine.icon} size={16} color={colors.primary} style={styles.iconRowIcon} />
          <Text style={[styles.iconRowText, { color: colors.foreground }]} numberOfLines={2}>
            {fulfillmentLine.text}
          </Text>
        </View>
      ) : null}

      {item.deliveryMode ? (
        <Text style={[styles.modeHint, { color: colors.mutedForeground }]}>
          {item.deliveryMode === "vendor_rider"
            ? t("ordersDashboard.modeVendorRider")
            : t("ordersDashboard.modePlatform")}
        </Text>
      ) : null}

      {itemSummary ? (
        <View style={styles.itemsBlock}>
          <Text style={[styles.itemsLabel, { color: colors.mutedForeground }]}>{t("ordersDashboard.itemsHeading")}</Text>
          <Text style={[styles.itemsText, { color: colors.foreground }]} numberOfLines={3}>
            {itemSummary}
          </Text>
        </View>
      ) : null}

      {item.deliveryNotes?.trim() ? (
        <View style={styles.noteBlock}>
          <Ionicons name="chatbubble-outline" size={14} color={colors.mutedForeground} style={styles.noteIcon} />
          <Text style={[styles.noteText, { color: colors.mutedForeground }]} numberOfLines={2}>
            {truncateOneLine(item.deliveryNotes, 120)}
          </Text>
        </View>
      ) : null}

      {prepHint ? (
        <View style={styles.prepHintRow}>
          <Ionicons name="timer-outline" size={15} color={colors.primary} />
          <Text style={[styles.prepHintText, { color: colors.foreground }]}>{prepHint}</Text>
        </View>
      ) : null}

      {showSla && item.slaDeadline ? (
        <View style={styles.slaRow}>
          <Text style={[styles.slaLabel, { color: colors.mutedForeground }]}>{t("ordersDashboard.slaLabel")}</Text>
          <Text
            style={[
              styles.slaValue,
              { color: item.slaBreached || formatSlaCountdown(item.slaDeadline) === "Overdue" ? colors.destructive : colors.warning },
            ]}
          >
            {formatSlaCountdown(item.slaDeadline)}
          </Text>
        </View>
      ) : null}

      {showDeliveryRow && item.delivery ? (
        <View style={[styles.deliveryBox, { borderColor: colors.border, backgroundColor: colors.muted + "40" }]}>
          <Ionicons name="bicycle-outline" size={16} color={colors.foreground} />
          <View style={styles.deliveryBoxText}>
            <Text style={[styles.deliveryStatus, { color: colors.foreground }]} numberOfLines={1}>
              {deliveryStatusLabel(item.delivery.status, t)}
            </Text>
            {item.delivery.isExternal && (item.delivery.externalRiderName || item.delivery.externalRiderPhone) ? (
              <Text style={[styles.externalRider, { color: colors.mutedForeground }]} numberOfLines={1}>
                {item.delivery.externalRiderName ?? item.delivery.externalRiderPhone}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {isPlaced ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: colors.success }]}
            onPress={onAccept}
            activeOpacity={0.85}
            disabled={acceptPending}
          >
            {acceptPending ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.acceptBtnText}>{t("newOrder.accept")}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rejectBtn, { backgroundColor: colors.destructive + "14" }]}
            onPress={onReject}
            activeOpacity={0.85}
            disabled={rejectPending}
          >
            {rejectPending ? (
              <ActivityIndicator color={colors.destructive} size="small" />
            ) : (
              <Text style={[styles.rejectBtnText, { color: colors.destructive }]}>{t("newOrder.reject")}</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {isAccepted ? (
        <TouchableOpacity
          style={[styles.singleAction, { backgroundColor: colors.primary }]}
          onPress={onStartPreparing}
          activeOpacity={0.85}
          disabled={statusPending}
        >
          {statusPending ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={[styles.singleActionText, { color: colors.primaryForeground }]}>
              {t("ordersDashboard.startPreparing")}
            </Text>
          )}
        </TouchableOpacity>
      ) : null}

      {isPreparing ? (
        <TouchableOpacity
          style={[styles.singleAction, { backgroundColor: colors.primary }]}
          onPress={onMarkReady}
          activeOpacity={0.85}
          disabled={statusPending}
        >
          {statusPending ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={[styles.singleActionText, { color: colors.primaryForeground }]}>
              {t("ordersDashboard.markReady")}
            </Text>
          )}
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  idBlock: { flex: 1, minWidth: 0 },
  orderId: { fontSize: fontSize.lg, fontWeight: "800", letterSpacing: 0.5 },
  timeAgo: { fontSize: fontSize.xs, marginTop: 2 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: spacing.xs, maxWidth: "52%" },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  badgeText: { fontSize: fontSize.xs, fontWeight: "700" },
  payBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  payBadgeText: { fontSize: fontSize.xs, fontWeight: "700" },
  totalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
    gap: spacing.md,
  },
  totalMain: { fontSize: fontSize["2xl"], fontWeight: "800" },
  itemCount: { fontSize: fontSize.sm, fontWeight: "600" },
  moneyMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.sm },
  moneyMeta: { fontSize: fontSize.xs, fontWeight: "500" },
  iconRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.xs },
  iconRowIcon: { marginTop: 2 },
  iconRowText: { flex: 1, fontSize: fontSize.sm, fontWeight: "600", lineHeight: 20 },
  modeHint: { fontSize: fontSize.xs, marginBottom: spacing.xs },
  itemsBlock: { marginBottom: spacing.sm, minHeight: 40 },
  itemsLabel: { fontSize: fontSize.xs, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  itemsText: { fontSize: fontSize.sm, lineHeight: 20, fontWeight: "500" },
  noteBlock: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs, marginBottom: spacing.sm },
  noteIcon: { marginTop: 2 },
  noteText: { flex: 1, fontSize: fontSize.xs, lineHeight: 18 },
  prepHintRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.xs },
  prepHintText: { fontSize: fontSize.sm, fontWeight: "600" },
  slaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm },
  slaLabel: { fontSize: fontSize.xs, fontWeight: "600" },
  slaValue: { fontSize: fontSize.sm, fontWeight: "800" },
  deliveryBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  deliveryBoxText: { flex: 1, minWidth: 0 },
  deliveryStatus: { fontSize: fontSize.sm, fontWeight: "700" },
  externalRider: { fontSize: fontSize.xs, marginTop: 2 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  acceptBtn: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  acceptBtnText: { color: "#FFF", fontWeight: "700", fontSize: fontSize.sm },
  rejectBtn: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  rejectBtnText: { fontWeight: "700", fontSize: fontSize.sm },
  singleAction: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    marginTop: spacing.xs,
    minHeight: 44,
    justifyContent: "center",
  },
  singleActionText: { fontWeight: "700", fontSize: fontSize.sm },
});
