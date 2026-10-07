"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  cn,
  useDefaultProfilePhotoUrls,
  resolveProfileAvatarUrl,
  OrderChatShell,
  OrderChatMessageList,
  ChatComposer,
  ChatPeerTypingBar,
} from "@dilivygo/ui";
import { usePeerTypingIndicator, useThrottledTypingEmit } from "@dilivygo/chat";
import { useMessages } from "@/hooks/use-chat";
import { useAuthStore } from "@/stores/auth-store";
import { useWSEvent, useWS } from "@/providers/ws-provider";
import { api } from "@/lib/api";
import { useTranslation } from "@dilivygo/i18n";

export default function ChatThreadPage() {
  const { t } = useTranslation("vendor");
  const { id: conversationId } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const defaultProfilePhotoUrls = useDefaultProfilePhotoUrls();
  const myAvatarSrc = useMemo(
    () =>
      resolveProfileAvatarUrl(undefined, user?.id ?? "", defaultProfilePhotoUrls),
    [user?.id, defaultProfilePhotoUrls]
  );
  const myAvatarInitial = user?.email?.[0]?.toUpperCase() || "?";
  const ws = useWS();
  const emitTyping = useThrottledTypingEmit(ws);
  const peerTyping = usePeerTypingIndicator(ws, conversationId, user?.id);
  const { data: messages, isLoading } = useMessages(conversationId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const markRead = useCallback(() => {
    api.chat.markRead(conversationId).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    if (conversationId) markRead();
  }, [conversationId, markRead]);

  useWSEvent("chat:message", (event) => {
    if (event.conversationId === conversationId) {
      queryClient.invalidateQueries({
        queryKey: ["messages", conversationId],
      });
      markRead();
    }
  });

  useWSEvent("chat:read", (event) => {
    if (event.conversationId === conversationId) {
      queryClient.invalidateQueries({
        queryKey: ["messages", conversationId],
      });
    }
  });

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await api.chat.sendMessage(conversationId, trimmed);
      setText("");
      queryClient.invalidateQueries({
        queryKey: ["messages", conversationId],
      });
    } catch {
      // toast elsewhere if needed
    } finally {
      setSending(false);
    }
  }

  const roleLabels = useMemo(
    () => ({
      vendor: t("chat.senderRestaurant"),
      admin: t("chat.senderRestaurant"),
      rider: t("chat.senderRider"),
      customer: t("chat.senderCustomer"),
      superadmin: t("chat.senderSupport"),
    }),
    [t]
  );

  const subtitle =
    !isLoading && messages && messages.length > 0
      ? t("chat.messageCount", { count: messages.length })
      : t("chat.threadSubtitleLive");

  return (
    <OrderChatShell
      rootClassName="h-[calc(100vh-4rem)]"
      scrollEndRef={scrollRef}
      isLoading={isLoading}
      showEmpty={!isLoading && (!messages || messages.length === 0)}
      emptyTitle={t("chat.noMessagesYet")}
      emptyDescription={t("chat.startConversationHint")}
      typingSlot={
        peerTyping ? (
          <ChatPeerTypingBar label={t("chat.peerTyping")} />
        ) : null
      }
      composer={
        <ChatComposer
          value={text}
          onChange={(v) => {
            setText(v);
            emitTyping(conversationId, user?.id);
          }}
          onSubmit={() => void handleSend()}
          sending={sending}
          placeholder={t("chat.typeMessage")}
        />
      }
      header={
        <div className="flex items-center gap-3 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/chat")}
            className="size-9 shrink-0 rounded-xl"
            aria-label={t("chat.backToMessages")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <MessageCircle className="size-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className={cn("truncate text-sm font-semibold tracking-tight")}>
                {t("chat.threadTitle")}
              </h2>
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <span className="hidden shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 sm:inline">
            {t("chat.liveBadge")}
          </span>
        </div>
      }
    >
      <OrderChatMessageList
        messages={messages ?? []}
        currentUserId={user?.id}
        myAvatarSrc={myAvatarSrc}
        myAvatarFallback={myAvatarInitial}
        roleLabels={roleLabels}
      />
    </OrderChatShell>
  );
}
