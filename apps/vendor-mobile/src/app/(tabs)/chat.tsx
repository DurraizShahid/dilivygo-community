import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Conversation } from "@dilivygo/types";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { api } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  customer_vendor: "Customer",
  vendor_rider: "Rider",
  customer_rider: "Rider",
};

function createChatListStyles(c: AppColors) {
  return {
    container: { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, justifyContent: "center" as const, alignItems: "center" as const, backgroundColor: c.background },
    screenTitle: {
      fontSize: fontSize["2xl"],
      fontWeight: "700" as const,
      color: c.foreground,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    convCard: {
      backgroundColor: c.card,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: "row" as const,
      alignItems: "center" as const,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.muted,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      marginRight: spacing.md,
    },
    convInfo: { flex: 1 },
    convType: { fontSize: fontSize.base, fontWeight: "600" as const, color: c.foreground, marginBottom: 2 },
    convOrder: { fontSize: fontSize.sm, color: c.mutedForeground },
    empty: { alignItems: "center" as const, paddingTop: 80, gap: spacing.sm },
    emptyText: { fontSize: fontSize.lg, fontWeight: "600" as const, color: c.foreground },
    emptySubtext: { fontSize: fontSize.sm, color: c.mutedForeground, textAlign: "center" as const, paddingHorizontal: spacing.xl },
  };
}

export default function ChatListScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createChatListStyles);

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ["vendor-conversations"],
    queryFn: () => api.chat.listConversations() as Promise<Conversation[]>,
    refetchInterval: 10_000,
  });

  const renderConversation = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.convCard}
      onPress={() => router.push(`/conversation/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name={
            item.type === "vendor_rider" || item.type === "customer_rider"
              ? "bicycle-outline"
              : "person-outline"
          }
          size={22}
          color={colors.primary}
        />
      </View>
      <View style={styles.convInfo}>
        <Text style={styles.convType}>{TYPE_LABELS[item.type] ?? item.type}</Text>
        <Text style={styles.convOrder} numberOfLines={1}>
          {item.orderId
            ? `Order #${item.orderId.slice(0, 8)}`
            : item.type === "customer_support"
              ? item.supportSubject?.trim() || "Support"
              : "Chat"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.screenTitle}>Chat</Text>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        renderItem={renderConversation}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubble-outline" size={48} color={colors.border} />
            <Text style={styles.emptyText}>No conversations</Text>
            <Text style={styles.emptySubtext}>
              Chats with customers and riders will appear here
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
