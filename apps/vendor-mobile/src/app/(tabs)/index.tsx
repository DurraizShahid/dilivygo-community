import { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import * as Localization from "expo-localization";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "@dilivygo/i18n";
import type { Order, OrderStatus } from "@dilivygo/types";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { orderStatusColors } from "@/lib/order-status-colors";
import { api } from "@/lib/api";
import { useShopStore } from "@/stores/shop-store";
import { useVendorRealtimeStore } from "@/stores/vendor-realtime-store";
import { VendorOrderListCard } from "@/components/vendor-order-list-card";

const STATUS_SORT: Partial<Record<OrderStatus, number>> = {
  placed: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
  assigned: 4,
  picked_up: 5,
  arrived: 6,
  scheduled: 7,
  completed: 8,
  cancelled: 9,
  rejected: 10,
};

function sortVendorOrders(a: Order, b: Order): number {
  const pa = STATUS_SORT[a.status] ?? 99;
  const pb = STATUS_SORT[b.status] ?? 99;
  if (pa !== pb) return pa - pb;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function createOrdersDashboardStyles(c: AppColors) {
  return {
    container: { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, justifyContent: "center" as const, alignItems: "center" as const },
    headerBlock: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    screenTitle: {
      fontSize: fontSize["2xl"],
      fontWeight: "800" as const,
      color: c.foreground,
      marginBottom: spacing.sm,
    },
    summaryScroll: { marginHorizontal: -spacing.lg, marginBottom: spacing.sm },
    summaryScrollContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, flexDirection: "row" as const },
    summaryChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    summaryChipText: { fontSize: fontSize.xs, fontWeight: "700" as const, color: c.foreground },
    summaryChipMuted: { fontSize: fontSize.xs, fontWeight: "600" as const, color: c.mutedForeground },
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    empty: { alignItems: "center" as const, paddingTop: 80 },
    emptyText: { fontSize: fontSize.lg, fontWeight: "600" as const, color: c.foreground, marginBottom: spacing.xs },
    emptySubtext: { fontSize: fontSize.sm, color: c.mutedForeground },
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

export default function OrdersDashboard() {
  const { t } = useTranslation("mobile");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createOrdersDashboardStyles);
  const statusColors = useMemo(() => orderStatusColors(colors), [colors]);
  const activeShop = useShopStore((s) => s.activeShop);
  const flashOrderIds = useVendorRealtimeStore((s) => s.flashOrderIds);
  const localeTag = Localization.getLocales()[0]?.languageTag ?? "en";

  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acceptOrderId, setAcceptOrderId] = useState<string | null>(null);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState("15");

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["vendor-orders", activeShop?.id],
    queryFn: () => api.orders.list({ limit: 50, shopId: activeShop?.id }) as Promise<Order[]>,
    refetchInterval: 15_000,
  });

  const sortedOrders = useMemo(() => (orders ? [...orders].sort(sortVendorOrders) : []), [orders]);

  const summary = useMemo(() => {
    if (!orders?.length) return { needAction: 0, inKitchen: 0, ready: 0 };
    let needAction = 0;
    let inKitchen = 0;
    let ready = 0;
    for (const o of orders) {
      if (o.status === "placed") needAction += 1;
      if (o.status === "accepted" || o.status === "preparing") inKitchen += 1;
      if (o.status === "ready") ready += 1;
    }
    return { needAction, inKitchen, ready };
  }, [orders]);

  const acceptMutation = useMutation({
    mutationFn: ({ id, prepTime }: { id: string; prepTime: number }) =>
      api.orders.accept(id, prepTime),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
      setAcceptOrderId(null);
    },
    onError: () => Alert.alert("Error", "Failed to accept order."),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.orders.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
      setRejectOrderId(null);
      setRejectReason("");
    },
    onError: () => Alert.alert("Error", "Failed to reject order."),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      api.orders.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vendor-orders"] }),
    onError: () => Alert.alert("Error", "Failed to update order status."),
  });

  const handleAccept = useCallback((id: string) => {
    setAcceptOrderId(id);
    setPrepTimeMinutes("15");
  }, []);

  const handleAcceptConfirm = useCallback(() => {
    if (!acceptOrderId) return;
    const prep = parseInt(prepTimeMinutes, 10);
    const validPrep = Number.isNaN(prep) || prep < 1 ? 15 : Math.min(prep, 120);
    acceptMutation.mutate({ id: acceptOrderId, prepTime: validPrep });
  }, [acceptOrderId, prepTimeMinutes, acceptMutation]);

  const handleReject = useCallback((id: string) => {
    setRejectOrderId(id);
    setRejectReason("");
  }, []);

  const handleRejectConfirm = useCallback(() => {
    if (!rejectOrderId) return;
    rejectMutation.mutate({ id: rejectOrderId, reason: rejectReason || "Rejected by vendor" });
  }, [rejectOrderId, rejectReason, rejectMutation]);

  const handleStartPreparing = useCallback(
    (id: string) => statusMutation.mutate({ id, status: "preparing" }),
    [statusMutation],
  );

  const handleMarkReady = useCallback(
    (id: string) => statusMutation.mutate({ id, status: "ready" }),
    [statusMutation],
  );

  const renderOrder = useCallback(
    ({ item }: { item: Order }) => (
      <VendorOrderListCard
        item={item}
        isFlashing={!!flashOrderIds[item.id]}
        colors={colors}
        statusColor={statusColors[item.status]}
        localeTag={localeTag}
        t={t}
        onOpen={() => router.push(`/order/${item.id}`)}
        onAccept={() => handleAccept(item.id)}
        onReject={() => handleReject(item.id)}
        onStartPreparing={() => handleStartPreparing(item.id)}
        onMarkReady={() => handleMarkReady(item.id)}
        acceptPending={acceptMutation.isPending && acceptMutation.variables?.id === item.id}
        rejectPending={rejectMutation.isPending && rejectMutation.variables?.id === item.id}
        statusPending={statusMutation.isPending && statusMutation.variables?.id === item.id}
      />
    ),
    [
      flashOrderIds,
      colors,
      statusColors,
      localeTag,
      t,
      router,
      handleAccept,
      handleReject,
      handleStartPreparing,
      handleMarkReady,
      acceptMutation.isPending,
      acceptMutation.variables?.id,
      rejectMutation.isPending,
      rejectMutation.variables?.id,
      statusMutation.isPending,
      statusMutation.variables?.id,
    ],
  );

  const showSummary = !!orders?.length;

  return (
    <>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.headerBlock}>
          <Text style={styles.screenTitle}>{t("tabs.orders")}</Text>
          {showSummary ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.summaryScroll}
              contentContainerStyle={styles.summaryScrollContent}
            >
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>{t("ordersDashboard.needAction", { count: summary.needAction })}</Text>
              </View>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>{t("ordersDashboard.inKitchen", { count: summary.inKitchen })}</Text>
              </View>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>{t("ordersDashboard.readyHandoff", { count: summary.ready })}</Text>
              </View>
            </ScrollView>
          ) : null}
        </View>
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={sortedOrders}
            keyExtractor={(o) => o.id}
            renderItem={renderOrder}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{t("ordersDashboard.emptyTitle")}</Text>
                <Text style={styles.emptySubtext}>{t("ordersDashboard.emptySubtitle")}</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>

      <Modal
        visible={!!acceptOrderId}
        transparent
        animationType="fade"
        onRequestClose={() => setAcceptOrderId(null)}
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
                onPress={() => setAcceptOrderId(null)}
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

      <Modal
        visible={!!rejectOrderId}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectOrderId(null)}
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
                  setRejectOrderId(null);
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
    </>
  );
}
