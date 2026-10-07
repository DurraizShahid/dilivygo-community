import { useEffect, useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Order, OrderStatus } from "@dilivygo/types";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { orderStatusColors } from "@/lib/order-status-colors";
import { api, wsClient } from "@/lib/api";
import { hapticOrderSuccess } from "@/lib/haptics";
import { formatPrice } from "@/lib/currency";

const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: "Placed",
  accepted: "Accepted",
  rejected: "Rejected",
  preparing: "Preparing",
  ready: "Ready",
  assigned: "Assigned",
  picked_up: "Picked Up",
  arrived: "Arrived",
  completed: "Completed",
  cancelled: "Cancelled",
  scheduled: "Scheduled",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Matches API extend-SLA validation: 5–60 minutes per request. */
const SLA_EXTEND_PRESET_MINUTES = [5, 10, 15, 20, 30, 45, 60] as const;

function formatSlaCountdown(slaDeadline: string): string {
  const diff = new Date(slaDeadline).getTime() - Date.now();
  if (diff <= 0) return "Overdue";
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  if (hrs >= 1) return `${hrs}h ${mins % 60}m left`;
  return `${mins}m left`;
}

function isSlaPastOrBreached(slaDeadline: string, slaBreached?: boolean): boolean {
  if (slaBreached) return true;
  return new Date(slaDeadline).getTime() <= Date.now();
}

function createVendorOrderDetailStyles(c: AppColors) {
  return {
    container: { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, justifyContent: "center" as const, alignItems: "center" as const, backgroundColor: c.background },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    backBtn: { width: 40, height: 40, justifyContent: "center" as const },
    headerTitle: { fontSize: fontSize.lg, fontWeight: "600" as const, color: c.foreground },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl },
    statusRow: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      marginBottom: spacing.lg,
    },
    badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: borderRadius.full },
    badgeText: { fontSize: fontSize.sm, fontWeight: "600" as const },
    dateText: { fontSize: fontSize.sm, color: c.mutedForeground },
    slaCard: {},
    slaCardColumn: { flexDirection: "column" as const, alignItems: "stretch" as const },
    slaCardHeaderRow: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
    },
    slaExtendInline: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    slaExtendInlineLabel: {
      fontSize: fontSize.xs,
      fontWeight: "600" as const,
      color: c.mutedForeground,
      marginBottom: spacing.sm,
    },
    slaLabel: { fontSize: fontSize.sm, color: c.mutedForeground },
    slaValue: { fontSize: fontSize.sm, fontWeight: "600" as const, color: c.warning },
    card: {
      backgroundColor: c.card,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardTitle: {
      fontSize: fontSize.sm,
      fontWeight: "600" as const,
      color: c.mutedForeground,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
      marginBottom: spacing.md,
    },
    itemRow: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    itemInfo: { flex: 1 },
    itemName: { fontSize: fontSize.base, color: c.foreground },
    itemPrice: { fontSize: fontSize.sm, fontWeight: "600" as const, color: c.foreground },
    noItems: { fontSize: fontSize.sm, color: c.mutedForeground, fontStyle: "italic" as const },
    totalRow: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      paddingTop: spacing.md,
      marginTop: spacing.xs,
    },
    totalLabel: { fontSize: fontSize.base, fontWeight: "700" as const, color: c.foreground },
    totalValue: { fontSize: fontSize.lg, fontWeight: "700" as const, color: c.foreground },
    detailRow: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    detailLabel: { fontSize: fontSize.sm, color: c.mutedForeground },
    detailValue: { fontSize: fontSize.sm, fontWeight: "500" as const, color: c.foreground, textTransform: "capitalize" as const },
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.md + 2,
      alignItems: "center" as const,
      marginBottom: spacing.md,
    },
    primaryBtnText: { color: c.primaryForeground, fontSize: fontSize.base, fontWeight: "600" as const },
    dangerBtn: {
      backgroundColor: c.destructive + "0F",
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.md + 2,
      alignItems: "center" as const,
    },
    dangerBtnText: { color: c.destructive, fontSize: fontSize.base, fontWeight: "600" as const },
    outlineBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: spacing.sm,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.md + 2,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    outlineBtnText: { color: c.primary, fontSize: fontSize.base, fontWeight: "600" as const },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center" as const,
      alignItems: "center" as const,
      padding: spacing.lg,
    },
    modalContent: {
      backgroundColor: c.card,
      borderRadius: borderRadius.lg,
      padding: spacing.xl,
      width: "100%" as const,
      maxWidth: 340,
    },
    modalTitle: { fontSize: fontSize.lg, fontWeight: "600" as const, color: c.foreground, marginBottom: spacing.lg },
    modalLabel: { fontSize: fontSize.sm, color: c.mutedForeground, marginBottom: spacing.xs },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      fontSize: fontSize.base,
      color: c.foreground,
      marginBottom: spacing.lg,
    },
    textArea: { minHeight: 80, textAlignVertical: "top" as const },
    presetRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    presetChip: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.background,
      minWidth: 56,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    presetChipDisabled: {
      opacity: 0.55,
    },
    presetChipCompact: {
      minWidth: 48,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.sm,
    },
    presetChipText: {
      fontSize: fontSize.sm,
      fontWeight: "600" as const,
      color: c.primary,
    },
    modalActions: { flexDirection: "row" as const, gap: spacing.sm },
    modalCancelBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      alignItems: "center" as const,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    modalCancelText: { fontSize: fontSize.base, color: c.foreground },
    modalConfirmBtn: {
      flex: 1,
      backgroundColor: c.success,
      paddingVertical: spacing.md,
      alignItems: "center" as const,
      borderRadius: borderRadius.md,
    },
    modalConfirmText: { color: "#FFF", fontSize: fontSize.base, fontWeight: "600" as const },
  };
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createVendorOrderDetailStyles);
  const statusColors = useMemo(() => orderStatusColors(colors), [colors]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState("15");
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendMinutes, setExtendMinutes] = useState("10");

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["vendor-order", id],
    queryFn: () => api.orders.get(id!),
    enabled: !!id,
  });

  const acceptMutation = useMutation({
    mutationFn: (prepTime: number) => api.orders.accept(id!, prepTime),
    onSuccess: () => {
      hapticOrderSuccess();
      queryClient.invalidateQueries({ queryKey: ["vendor-order", id] });
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
      setShowAcceptModal(false);
    },
    onError: () => Alert.alert("Error", "Failed to accept order."),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => api.orders.reject(id!, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-order", id] });
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
      setShowRejectModal(false);
      setRejectReason("");
    },
    onError: () => Alert.alert("Error", "Failed to reject order."),
  });

  const statusMutation = useMutation({
    mutationFn: (status: OrderStatus) => api.orders.updateStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-order", id] });
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
    onError: () => Alert.alert("Error", "Failed to update order status."),
  });

  const extendSlaMutation = useMutation({
    mutationFn: (minutes: number) => api.orders.extendSla(id!, minutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-order", id] });
      setShowExtendModal(false);
      setExtendMinutes("10");
    },
    onError: () => Alert.alert("Error", "Failed to extend SLA."),
  });

  useEffect(() => {
    wsClient.connect();
    const unsub = wsClient.subscribe("order:status_changed", (e) => {
      if (e.orderId === id) {
        queryClient.invalidateQueries({ queryKey: ["vendor-order", id] });
      }
    });
    return () => {
      unsub();
    };
  }, [id, queryClient]);

  const handleAcceptConfirm = useCallback(() => {
    const prep = parseInt(prepTimeMinutes, 10);
    const validPrep = Number.isNaN(prep) || prep < 1 ? 15 : Math.min(prep, 120);
    acceptMutation.mutate(validPrep);
  }, [prepTimeMinutes, acceptMutation]);

  const handleRejectConfirm = useCallback(() => {
    rejectMutation.mutate(rejectReason || "Rejected by vendor");
  }, [rejectReason, rejectMutation]);

  if (isLoading || !order) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const isPlaced = order.status === "placed";
  const isAccepted = order.status === "accepted";
  const isPreparing = order.status === "preparing";
  const showSla = order.slaDeadline && ["accepted", "preparing"].includes(order.status);
  const delivery = order.delivery;
  const hasDelivery = !!delivery;

  return (
    <>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order #{order.id.slice(0, 8)}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.statusRow}>
            <View style={[styles.badge, { backgroundColor: statusColors[order.status] + "1A" }]}>
              <Text style={[styles.badgeText, { color: statusColors[order.status] }]}>
                {STATUS_LABELS[order.status]}
              </Text>
            </View>
            <Text style={styles.dateText}>{formatDate(order.createdAt)}</Text>
          </View>

          {showSla && order.slaDeadline && (
            <View style={[styles.card, styles.slaCard, styles.slaCardColumn]}>
              <View style={styles.slaCardHeaderRow}>
                <Text style={styles.slaLabel}>SLA Deadline</Text>
                <Text
                  style={[
                    styles.slaValue,
                    order.slaBreached ? { color: colors.destructive } : undefined,
                  ]}
                >
                  {formatSlaCountdown(order.slaDeadline)}
                </Text>
              </View>
              {(isAccepted || isPreparing) &&
                isSlaPastOrBreached(order.slaDeadline, order.slaBreached) && (
                  <View style={styles.slaExtendInline}>
                    <Text style={styles.slaExtendInlineLabel}>Extend prep</Text>
                    <View style={styles.presetRow}>
                      {SLA_EXTEND_PRESET_MINUTES.map((mins) => (
                        <TouchableOpacity
                          key={mins}
                          style={[
                            styles.presetChip,
                            styles.presetChipCompact,
                            extendSlaMutation.isPending && styles.presetChipDisabled,
                          ]}
                          onPress={() => extendSlaMutation.mutate(mins)}
                          disabled={extendSlaMutation.isPending}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.presetChipText}>+{mins}m</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {extendSlaMutation.isPending ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.primary}
                        style={{ marginTop: spacing.sm }}
                      />
                    ) : null}
                  </View>
                )}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Items</Text>
            {order.items && order.items.length > 0 ? (
              order.items.map((item) => (
                <View key={item.id}>
                  <View style={styles.itemRow}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>
                        {item.quantity}× {item.name}
                      </Text>
                    </View>
                    <Text style={styles.itemPrice}>
                      {formatPrice(item.unitPriceCents * item.quantity)}
                    </Text>
                  </View>
                  {item.notes ? (
                    <Text style={{ fontSize: 12, fontStyle: "italic", color: "#d97706", paddingLeft: 4, marginBottom: 4 }}>
                      Note: {item.notes}
                    </Text>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.noItems}>No item details available</Text>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatPrice(order.totalCents)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Customer</Text>
              <Text style={styles.detailValue}>{order.customerId.slice(0, 12)}…</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payment</Text>
              <Text style={styles.detailValue}>{order.paymentStatus}</Text>
            </View>
            {order.scheduledFor && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Scheduled</Text>
                <Text style={styles.detailValue}>{formatDate(order.scheduledFor)}</Text>
              </View>
            )}
          </View>

          {hasDelivery && delivery && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Delivery</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={styles.detailValue}>{delivery.status}</Text>
              </View>
              {delivery.riderId && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Rider</Text>
                  <Text style={styles.detailValue}>{delivery.riderId.slice(0, 12)}…</Text>
                </View>
              )}
            </View>
          )}

          {isPlaced && (
            <>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => setShowAcceptModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Accept Order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dangerBtn}
                onPress={() => setShowRejectModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.dangerBtnText}>Reject Order</Text>
              </TouchableOpacity>
            </>
          )}

          {isAccepted && (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => statusMutation.mutate("preparing")}
              disabled={statusMutation.isPending}
              activeOpacity={0.8}
            >
              {statusMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryBtnText}>Start Preparing</Text>
              )}
            </TouchableOpacity>
          )}

          {isPreparing && (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => statusMutation.mutate("ready")}
              disabled={statusMutation.isPending}
              activeOpacity={0.8}
            >
              {statusMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryBtnText}>Mark Ready</Text>
              )}
            </TouchableOpacity>
          )}

          {(isAccepted || isPreparing) && (
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => setShowExtendModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="timer-outline" size={18} color={colors.primary} />
              <Text style={styles.outlineBtnText}>Extend Prep Time</Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      </SafeAreaView>

      {/* Accept modal */}
      <Modal
        visible={showAcceptModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAcceptModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalContent}
          >
            <Text style={styles.modalTitle}>Accept Order</Text>
            <Text style={styles.modalLabel}>Prep time (minutes)</Text>
            <TextInput
              style={styles.input}
              value={prepTimeMinutes}
              onChangeText={setPrepTimeMinutes}
              keyboardType="number-pad"
              placeholder="15"
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAcceptModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleAcceptConfirm}
                disabled={acceptMutation.isPending}
                activeOpacity={0.8}
              >
                {acceptMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Accept</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Reject modal */}
      <Modal
        visible={showRejectModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRejectModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalContent}
          >
            <Text style={styles.modalTitle}>Reject Order</Text>
            <Text style={styles.modalLabel}>Reason (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="e.g. Out of stock, closed"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: colors.destructive }]}
                onPress={handleRejectConfirm}
                disabled={rejectMutation.isPending}
                activeOpacity={0.8}
              >
                {rejectMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Reject</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Extend SLA modal */}
      <Modal
        visible={showExtendModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExtendModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalContent}
          >
            <Text style={styles.modalTitle}>Extend Prep Time</Text>
            <Text style={styles.modalLabel}>Quick add</Text>
            <View style={styles.presetRow}>
              {SLA_EXTEND_PRESET_MINUTES.map((mins) => (
                <TouchableOpacity
                  key={mins}
                  style={[styles.presetChip, extendSlaMutation.isPending && styles.presetChipDisabled]}
                  onPress={() => extendSlaMutation.mutate(mins)}
                  disabled={extendSlaMutation.isPending}
                  activeOpacity={0.8}
                >
                  <Text style={styles.presetChipText}>+{mins}m</Text>
                </TouchableOpacity>
              ))}
            </View>
            {extendSlaMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginBottom: spacing.sm }} />
            ) : null}
            <Text style={[styles.modalLabel, { marginTop: spacing.md }]}>Custom (5–60 min)</Text>
            <TextInput
              style={styles.input}
              value={extendMinutes}
              onChangeText={setExtendMinutes}
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowExtendModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => {
                  const raw = parseInt(extendMinutes, 10);
                  const mins = Number.isFinite(raw) ? Math.min(60, Math.max(5, raw)) : 10;
                  extendSlaMutation.mutate(mins);
                }}
                disabled={extendSlaMutation.isPending}
                activeOpacity={0.8}
              >
                {extendSlaMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Extend</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}
