import { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@dilivygo/i18n";
import { api } from "@/lib/api";
import { useCurrencyStore } from "@/lib/currency";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import type { Conversation } from "@dilivygo/types";
import {
  formatChatListTime,
  convListMeta,
  avatarTintForConversation,
  initialsFromTitle,
} from "@/lib/chat-ui";
import { screenChromeStyles, elevatedCardShadow, SCREEN_H_PAD } from "@/lib/screen-layout";
import { MobileEmptyState } from "@/components/mobile-empty-state";

function createChatStyles(c: AppColors) {
  const chrome = screenChromeStyles(c);
  return StyleSheet.create({
    container: chrome.container,
    header: {
      ...chrome.header,
      paddingBottom: spacing.md,
    },
    headerEyebrow: chrome.headerEyebrow,
    headerTitleRow: {
      ...chrome.headerRow,
      marginBottom: spacing.md,
    },
    headerTitle: chrome.headerTitle,
    countPill: {
      backgroundColor: c.muted,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
    },
    countText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: c.mutedForeground,
    },
    searchPill: {
      ...chrome.searchPill,
      marginTop: 0,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      color: c.foreground,
      paddingVertical: spacing.xs,
    },
    refundHintBox: {
      marginTop: spacing.md,
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.lg,
      backgroundColor: c.muted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
    },
    refundHintIcon: {
      marginTop: 2,
    },
    refundHintText: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      lineHeight: 20,
    },
    listContent: {
      paddingHorizontal: SCREEN_H_PAD,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl + spacing.lg,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      marginBottom: spacing.md,
      minHeight: 84,
      ...elevatedCardShadow(),
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    avatarText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
    rowTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      marginBottom: 4,
    },
    rowTitle: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: c.foreground,
      flex: 1,
    },
    rowTime: {
      fontFamily: fonts.medium,
      fontSize: fontSize.xs,
      color: c.mutedForeground,
    },
    rowSubtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      minHeight: 40,
      maxHeight: 40,
    },
    closedBadge: {
      alignSelf: "flex-start",
      marginTop: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: borderRadius.sm,
      backgroundColor: c.muted,
    },
    closedBadgeText: {
      fontFamily: fonts.bold,
      fontSize: 10,
      color: c.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    chevron: {
      marginLeft: spacing.xs,
      opacity: 0.35,
    },
  });
}

export default function ChatListScreen() {
  const router = useRouter();
  const { t } = useTranslation("mobile");
  const { t: tCustomer } = useTranslation("customer");
  const refundRequestsEnabled = useCurrencyStore((s) => s.customerRefundRequestsEnabled);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createChatStyles(colors), [colors]);
  const [query, setQuery] = useState("");

  const {
    data: conversations,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: () => api.chat.listConversations(),
  });

  const filtered = useMemo(() => {
    if (!conversations?.length) return [];
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const { title, subtitle } = convListMeta(c);
      return (
        title.toLowerCase().includes(q) ||
        subtitle.toLowerCase().includes(q) ||
        (c.orderId && c.orderId.toLowerCase().includes(q))
      );
    });
  }, [conversations, query]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>{t("screens.chat.eyebrow")}</Text>
          <Text style={styles.headerTitle}>{t("screens.chat.title")}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>{t("screens.chat.eyebrow")}</Text>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>{t("screens.chat.title")}</Text>
          {!!conversations?.length && (
            <View style={styles.countPill}>
              <Text style={styles.countText}>
                {t("screens.chat.countPill", { count: conversations.length })}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.searchPill}>
          <Ionicons name="search" size={20} color={colors.mutedForeground} />
          <TextInput
            style={styles.searchInput}
            placeholder={t("screens.chat.searchPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
        {refundRequestsEnabled ? (
          <View style={styles.refundHintBox} accessibilityRole="text">
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.primary}
              style={styles.refundHintIcon}
            />
            <Text style={styles.refundHintText}>
              {tCustomer("supportChat.refundInboxHint")}
            </Text>
          </View>
        ) : null}
      </View>

      {!conversations?.length ? (
        <MobileEmptyState
          icon="chatbubbles-outline"
          title={t("screens.chat.emptyTitle")}
          subtitle={t("screens.chat.emptySubtitle")}
        />
      ) : !filtered.length ? (
        <MobileEmptyState
          icon="search-outline"
          title={t("screens.chat.noMatchesTitle")}
          subtitle={t("screens.chat.noMatchesSubtitle")}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          renderItem={({ item }) => {
            const { title, subtitle } = convListMeta(item);
            const tint = avatarTintForConversation(item.type);
            const initials = initialsFromTitle(title);
            const closed = item.type === "customer_support" && item.supportClosedAt;

            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.88}
                onPress={() => router.push(`/conversation/${item.id}`)}
              >
                <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
                  <Text style={[styles.avatarText, { color: tint.fg }]}>{initials}</Text>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.rowTime}>{formatChatListTime(item.updatedAt)}</Text>
                  </View>
                  <Text style={styles.rowSubtitle} numberOfLines={2}>
                    {subtitle}
                  </Text>
                  {closed ? (
                    <View style={styles.closedBadge}>
                      <Text style={styles.closedBadgeText}>{t("screens.chat.closed")}</Text>
                    </View>
                  ) : null}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.mutedForeground}
                  style={styles.chevron}
                />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
