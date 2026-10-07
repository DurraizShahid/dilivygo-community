import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Message } from "@dilivygo/types";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { api, wsClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

function createConversationStyles(c: AppColors) {
  return {
    container: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    centered: { flex: 1, justifyContent: "center" as const, alignItems: "center" as const },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.card,
    },
    backBtn: { width: 40, height: 40, justifyContent: "center" as const },
    headerTitle: { fontSize: fontSize.lg, fontWeight: "600" as const, color: c.foreground },
    messageList: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    bubble: {
      maxWidth: "78%" as const,
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.sm + 2,
      borderRadius: borderRadius.lg,
      marginBottom: spacing.sm,
    },
    bubbleMe: {
      alignSelf: "flex-end" as const,
      backgroundColor: c.primary,
      borderBottomRightRadius: borderRadius.sm,
    },
    bubbleThem: {
      alignSelf: "flex-start" as const,
      backgroundColor: c.muted,
      borderBottomLeftRadius: borderRadius.sm,
    },
    bubbleText: { fontSize: fontSize.base, lineHeight: 22 },
    bubbleTextMe: { color: c.primaryForeground },
    bubbleTextThem: { color: c.foreground },
    bubbleTime: {
      fontSize: fontSize.xs - 1,
      color: c.mutedForeground,
      marginTop: spacing.xs,
      alignSelf: "flex-end" as const,
    },
    bubbleTimeMe: { color: c.primaryForeground + "99" },
    emptyChat: { alignItems: "center" as const, paddingVertical: spacing.xxl, transform: [{ scaleY: -1 }] },
    emptyChatText: { fontSize: fontSize.sm, color: c.mutedForeground },
    inputBar: {
      flexDirection: "row" as const,
      alignItems: "flex-end" as const,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.card,
      gap: spacing.sm,
    },
    textInput: {
      flex: 1,
      backgroundColor: c.muted,
      borderRadius: borderRadius.xl,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
      fontSize: fontSize.base,
      color: c.foreground,
      maxHeight: 100,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary,
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    sendBtnDisabled: { opacity: 0.4 },
  };
}

export default function ConversationScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createConversationStyles);

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: ["vendor-messages", conversationId],
    queryFn: () => api.chat.getMessages(conversationId!) as Promise<Message[]>,
    enabled: !!conversationId,
    refetchInterval: 10_000,
  });

  useEffect(() => {
    wsClient.connect();
    const unsub = wsClient.subscribe("chat:message", (e) => {
      if (e.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: ["vendor-messages", conversationId] });
      }
    });
    return () => { unsub(); };
  }, [conversationId, queryClient]);

  useEffect(() => {
    if (conversationId) {
      api.chat.markRead(conversationId).catch(() => {});
    }
  }, [conversationId, messages]);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content || !conversationId) return;
    setSending(true);
    setText("");
    try {
      await api.chat.sendMessage(conversationId, content);
      queryClient.invalidateQueries({ queryKey: ["vendor-messages", conversationId] });
    } catch {
      setText(content);
    } finally {
      setSending(false);
    }
  }, [text, conversationId, queryClient]);

  const inverted = [...(messages ?? [])].reverse();

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.senderId === user?.id;
    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
          {item.content}
        </Text>
        <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
          {new Date(item.createdAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conversation</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={flatListRef}
            data={inverted}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={styles.messageList}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatText}>No messages yet</Text>
              </View>
            }
          />
          <View style={styles.inputBar}>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message…"
              placeholderTextColor={colors.mutedForeground}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || sending}
              activeOpacity={0.7}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Ionicons name="send" size={18} color={colors.primaryForeground} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
