import { useEffect, useState, useRef, useLayoutEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Pressable,
  type ListRenderItemInfo,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useLocalSearchParams, Stack, useNavigation, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api, wsClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import type { Conversation, Message, Order } from "@dilivygo/types";
import { useTranslation } from "@dilivygo/i18n";
import { formatPrice, useCurrencyStore } from "@/lib/currency";

const REFUND_ELIGIBLE_STATUSES = new Set(["completed", "rejected", "cancelled"]);

function pickEligibleRefundOrders(orders: Order[] | undefined) {
  if (!orders?.length) return [];
  return orders.filter(
    (o) => o.paymentStatus === "paid" && REFUND_ELIGIBLE_STATUSES.has(o.status)
  );
}
import {
  convListMeta,
  sameCalendarDay,
  formatChatDayLabel,
  avatarTintForConversation,
  initialsFromTitle,
} from "@/lib/chat-ui";

const BUBBLE_RADIUS = 16;
const BUBBLE_RADIUS_SMALL = 4;

function chatWallpaper(c: AppColors) {
  return c.background;
}

function incomingBubbleColor(c: AppColors, isDark: boolean) {
  return isDark ? "#1F2C33" : c.card;
}

function createConversationStyles(
  c: AppColors,
  isDark: boolean,
  wallpaper: string
) {
  return StyleSheet.create({
    flex: { flex: 1 },
    wallpaper: {
      flex: 1,
      minHeight: 0,
      backgroundColor: wallpaper,
    },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.xl,
    },
    emptyTitle: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.lg,
      color: isDark ? "#E9EDEF" : c.foreground,
    },
    emptySubtext: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: isDark ? "#8696A0" : c.mutedForeground,
      textAlign: "center",
      lineHeight: 20,
    },
    messageList: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.lg,
    },
    dayDividerWrap: {
      alignItems: "center",
      marginVertical: spacing.md,
    },
    dayDividerPill: {
      backgroundColor: isDark ? "#182229" : "rgba(0,0,0,0.06)",
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
    },
    dayDividerText: {
      fontFamily: fonts.medium,
      fontSize: fontSize.xs,
      color: isDark ? "#8696A0" : "#667781",
    },
    row: {
      flexDirection: "row",
      marginBottom: 2,
    },
    myRow: {
      justifyContent: "flex-end",
    },
    theirRow: {
      justifyContent: "flex-start",
    },
    bubble: {
      maxWidth: "80%",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    bubbleText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      lineHeight: 22,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 4,
      marginTop: 2,
      paddingBottom: spacing.xs,
    },
    timeText: {
      fontFamily: fonts.regular,
      fontSize: 11,
    },
    inputOuter: {
      backgroundColor: c.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: spacing.sm,
    },
    textInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: isDark ? "#2A3942" : c.muted,
      borderRadius: 22,
      paddingHorizontal: spacing.lg,
      paddingTop: Platform.OS === "ios" ? 12 : 10,
      paddingBottom: Platform.OS === "ios" ? 12 : 10,
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      color: isDark ? "#E9EDEF" : c.foreground,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    sendButtonDisabled: {
      opacity: 0.35,
    },
    headerTitleBlock: {
      alignItems: "flex-start",
      justifyContent: "center",
      maxWidth: Platform.OS === "ios" ? 220 : 260,
    },
    headerTitleText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: c.foreground,
      textAlign: "left",
    },
    headerSubtitleText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: c.mutedForeground,
      marginTop: 2,
      textAlign: "left",
    },
    supportRefundBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: isDark ? "rgba(99,102,241,0.12)" : "rgba(99,102,241,0.08)",
    },
    supportRefundBannerText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: c.primary,
      flex: 1,
    },
    refundModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.lg,
    },
    refundModalCard: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl,
      maxHeight: "82%",
      width: "100%",
      maxWidth: 420,
      padding: spacing.md,
    },
    refundModalTitle: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.lg,
      color: c.foreground,
      marginBottom: spacing.xs,
    },
    refundModalHint: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      marginBottom: spacing.md,
    },
    refundOrderRow: {
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    refundOrderTitle: {
      fontFamily: fonts.medium,
      fontSize: fontSize.sm,
      color: c.foreground,
    },
    refundOrderMeta: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: c.mutedForeground,
      marginTop: 4,
    },
    refundModalClose: {
      marginTop: spacing.md,
      alignSelf: "flex-end",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    refundModalCloseText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: c.primary,
    },
  });
}

export default function ConversationScreen() {
  const { id, orderId, type } = useLocalSearchParams<{
    id: string;
    orderId?: string;
    type?: string;
  }>();
  const navigation = useNavigation();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const customer = useAuthStore((s) => s.customer);
  const queryClient = useQueryClient();
  const { t } = useTranslation("customer");
  const refundRequestsEnabled = useCurrencyStore((s) => s.customerRefundRequestsEnabled);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const { colors, isDark } = useAppTheme();

  const [conversationId, setConversationId] = useState<string | null>(
    orderId ? null : id ?? null
  );
  const [resolving, setResolving] = useState(!!orderId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const flatListRef = useRef<FlatList>(null);

  const wallpaper = chatWallpaper(colors);
  const incomingBg = incomingBubbleColor(colors, isDark);
  const styles = useMemo(
    () => createConversationStyles(colors, isDark, wallpaper),
    [colors, isDark, wallpaper]
  );

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      setResolving(true);
      try {
        const convos = await api.chat.listConversations();
        const existing = convos.find(
          (c) => c.orderId === orderId && (type ? c.type === type : true)
        );
        if (existing) {
          setConversationId(existing.id);
        } else {
          const created = await api.chat.createConversation({
            orderId,
            type: (type as "customer_vendor" | "vendor_rider" | "customer_rider") ?? "customer_vendor",
          });
          setConversationId(created.id);
        }
      } catch {}
      setResolving(false);
    })();
  }, [orderId, type]);

  const { data: activeConvo } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.chat.listConversations(),
    select: (list: Conversation[]) =>
      list.find((x) => x.id === conversationId) ?? null,
    enabled: !!conversationId,
  });

  const isSupportChat = activeConvo?.type === "customer_support";

  const { data: ordersList, isLoading: ordersForRefundLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders.list({ limit: 80 }),
    enabled: !!conversationId && isSupportChat && refundRequestsEnabled,
  });

  const eligibleRefundOrders = useMemo(
    () => pickEligibleRefundOrders(ordersList),
    [ordersList]
  );

  const openOrderForRefund = useCallback(
    (orderId: string) => {
      setRefundModalOpen(false);
      const cid = encodeURIComponent(conversationId!);
      router.push(`/order/${orderId}?conversationId=${cid}`);
    },
    [router, conversationId]
  );

  const headerMeta = activeConvo ? convListMeta(activeConvo) : null;
  const headerTint = activeConvo
    ? avatarTintForConversation(activeConvo.type)
    : null;

  useLayoutEffect(() => {
    const barBg = colors.card;
    const subtitle =
      headerMeta?.subtitle ??
      (resolving ? "Loading…" : "Messages");

    navigation.setOptions({
      headerStyle: {
        backgroundColor: barBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      },
      headerTintColor: colors.primary,
      headerTitleAlign: "left",
      headerTitleContainerStyle: {
        alignItems: "flex-start",
        justifyContent: "center",
        marginLeft: Platform.OS === "ios" ? -8 : 0,
      },
      headerLeftContainerStyle: {
        paddingRight: Platform.OS === "ios" ? 4 : 0,
      },
      headerTitle: () => (
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerTitleText} numberOfLines={1}>
            {headerMeta?.title ?? "Chat"}
          </Text>
          <Text style={styles.headerSubtitleText} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      ),
      headerRight: headerTint
        ? () => (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: headerTint.bg,
                justifyContent: "center",
                alignItems: "center",
                marginRight: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: fonts.bold,
                  fontSize: 13,
                  color: headerTint.fg,
                }}
              >
                {initialsFromTitle(headerMeta?.title ?? "?")}
              </Text>
            </View>
          )
        : undefined,
    });
  }, [
    navigation,
    headerMeta,
    headerTint,
    resolving,
    isDark,
    colors,
    styles.headerTitleBlock,
    styles.headerTitleText,
    styles.headerSubtitleText,
  ]);

  const { data: fetchedMessages, isLoading } = useQuery<Message[]>({
    queryKey: ["messages", conversationId],
    queryFn: () => api.chat.getMessages(conversationId!),
    enabled: !!conversationId,
  });

  const messages = [...(fetchedMessages || []), ...localMessages].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  useEffect(() => {
    if (!conversationId) return;
    api.chat.markRead(conversationId).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    wsClient.connect();
    const unsub = wsClient.subscribe("chat:message", (event) => {
      if (event.conversationId === conversationId) {
        const msg = event.message;
        if (msg.senderId !== customer?.id) {
          setLocalMessages((prev) => [...prev, msg]);
        }
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      }
    });
    return () => {
      unsub();
    };
  }, [conversationId, customer?.id, queryClient]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending || !conversationId) return;

    setSending(true);
    try {
      const msg = await api.chat.sendMessage(conversationId!, trimmed);
      setLocalMessages((prev) => [...prev, msg]);
      setText("");
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    } catch {
      // Silently fail for now
    } finally {
      setSending(false);
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const isMyMessage = (msg: Message) => msg.senderId === customer?.id;

  function bubbleRadii(
    mine: boolean,
    continuesFromNewer: boolean,
    continuesToOlder: boolean
  ) {
    const r = BUBBLE_RADIUS;
    const s = BUBBLE_RADIUS_SMALL;
    if (mine) {
      return {
        borderTopLeftRadius: r,
        borderTopRightRadius: continuesToOlder ? s : r,
        borderBottomLeftRadius: r,
        borderBottomRightRadius: continuesFromNewer ? s : r,
      };
    }
    return {
      borderTopLeftRadius: continuesToOlder ? s : r,
      borderTopRightRadius: r,
      borderBottomLeftRadius: continuesFromNewer ? s : r,
      borderBottomRightRadius: r,
    };
  }

  const renderMessage = ({
    item,
    index,
  }: ListRenderItemInfo<Message>) => {
    const mine = isMyMessage(item);
    const newer = index > 0 ? messages[index - 1] : undefined;
    const older = messages[index + 1];
    const continuesFromNewer =
      !!newer && newer.senderId === item.senderId;
    const continuesToOlder = !!older && older.senderId === item.senderId;
    const showDayDivider =
      index > 0 &&
      newer &&
      !sameCalendarDay(item.createdAt, newer.createdAt);
    const showMeta =
      index === 0 || !newer || newer.senderId !== item.senderId;

    const bubbleStyle = [
      styles.bubble,
      mine
        ? {
            backgroundColor: colors.primary,
            ...bubbleRadii(mine, continuesFromNewer, continuesToOlder),
          }
        : {
            backgroundColor: incomingBg,
            ...bubbleRadii(mine, continuesFromNewer, continuesToOlder),
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 0.5 },
            shadowOpacity: isDark ? 0.2 : 0.08,
            shadowRadius: 1,
            elevation: 1,
          },
    ];

    const textColor = mine
      ? colors.primaryForeground
      : isDark
        ? "#E9EDEF"
        : colors.foreground;
    const timeColor = mine
      ? `${colors.primaryForeground}AA`
      : isDark
        ? "#8696A0"
        : "#667781";

    return (
      <View>
        <View
          style={[styles.row, mine ? styles.myRow : styles.theirRow]}
        >
          <View style={bubbleStyle}>
            <Text style={[styles.bubbleText, { color: textColor }]}>
              {item.content}
            </Text>
            {showMeta ? (
              <View style={styles.metaRow}>
                <Text style={[styles.timeText, { color: timeColor }]}>
                  {formatTime(item.createdAt)}
                </Text>
                {mine ? (
                  <Ionicons
                    name={item.readAt ? "checkmark-done" : "checkmark"}
                    size={14}
                    color={
                      item.readAt
                        ? isDark
                          ? "#53BDEB"
                          : "#34B7F1"
                        : timeColor
                    }
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
        {showDayDivider ? (
          <View style={styles.dayDividerWrap}>
            <View style={styles.dayDividerPill}>
              <Text style={styles.dayDividerText}>
                {formatChatDayLabel(item.createdAt)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerBackTitle: "Back" }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
      >
        <View style={styles.wallpaper}>
          {isSupportChat && refundRequestsEnabled && conversationId && !resolving ? (
            <TouchableOpacity
              style={styles.supportRefundBanner}
              onPress={() => setRefundModalOpen(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t("supportChat.refundOrderCta")}
            >
              <Ionicons name="cash-outline" size={20} color={colors.primary} />
              <Text style={styles.supportRefundBannerText}>{t("supportChat.refundOrderCta")}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
          {resolving || isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.center}>
              <View
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  backgroundColor: isDark ? "#1F2C33" : "rgba(255,255,255,0.85)",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: spacing.sm,
                }}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={36}
                  color={isDark ? "#8696A0" : colors.mutedForeground}
                />
              </View>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtext}>
                Say hello — your message will appear here instantly.
              </Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              style={styles.flex}
              data={messages}
              keyExtractor={(item) => item.id}
              inverted
              contentContainerStyle={styles.messageList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              renderItem={renderMessage}
            />
          )}
        </View>

        <Modal
          visible={refundModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setRefundModalOpen(false)}
        >
          <Pressable style={styles.refundModalBackdrop} onPress={() => setRefundModalOpen(false)}>
            <Pressable style={styles.refundModalCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.refundModalTitle}>{t("supportChat.refundOrderDialogTitle")}</Text>
              <Text style={styles.refundModalHint}>{t("supportChat.refundOrderDialogHint")}</Text>
              {ordersForRefundLoading ? (
                <Text style={styles.refundModalHint}>{t("supportChat.refundOrderLoading")}</Text>
              ) : eligibleRefundOrders.length === 0 ? (
                <Text style={styles.refundModalHint}>{t("supportChat.refundOrderEmpty")}</Text>
              ) : (
                <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                  {eligibleRefundOrders.map((o) => (
                    <Pressable
                      key={o.id}
                      style={styles.refundOrderRow}
                      onPress={() => openOrderForRefund(o.id)}
                    >
                      <Text style={styles.refundOrderTitle}>
                        {o.shop?.name ?? t("supportChat.refundOrderUntitledShop")}
                      </Text>
                      <Text style={styles.refundOrderMeta}>
                        {new Date(o.createdAt).toLocaleString()} · {formatPrice(o.totalCents)}
                      </Text>
                      <Text style={styles.refundOrderMeta}>#{o.id.slice(0, 8).toUpperCase()}…</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <Pressable style={styles.refundModalClose} onPress={() => setRefundModalOpen(false)}>
                <Text style={styles.refundModalCloseText}>{t("screens.orderDetail.refundCancel")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <View style={styles.inputOuter}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Message"
              placeholderTextColor={
                isDark ? "#8696A0" : colors.mutedForeground
              }
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!text.trim() || sending) && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!text.trim() || sending}
              activeOpacity={0.75}
            >
              {sending ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primaryForeground}
                />
              ) : (
                <Ionicons
                  name="send"
                  size={20}
                  color={colors.primaryForeground}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
