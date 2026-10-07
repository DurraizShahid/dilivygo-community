"use client";

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Headphones,
  Store,
  Bike,
  MessageCircleOff,
  RotateCcw,
  ExternalLink,
  AppWindow,
  PanelBottom,
  X,
  CircleDollarSign,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AnimatedUl,
  Skeleton,
  cn,
  ChatMessageBubble,
  ChatMessagesArea,
  ChatDayDivider,
  ChatComposer,
  formatChatDayLabel,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useDefaultProfilePhotoUrls,
  resolveProfileAvatarUrl,
  formatPrice,
  useCurrency,
  useCustomerRefundRequestsEnabled,
  Form,
} from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { useMessages } from "@/hooks/use-chat";
import { useAuthStore } from "@/stores/auth-store";
import { useChatDockStore } from "@/stores/chat-dock-store";
import { useWSEvent, useWS } from "@/providers/ws-provider";
import { api } from "@/lib/api";
import { PromoBanner } from "@/components/promo-banner";
import { SupportRatingPanel } from "@/components/support-rating-panel";
import { postCustomerChatDockClose } from "@/lib/chat-dock-protocol";
import type { Message, Order } from "@dilivygo/types";
import {
  chatComposerSchema,
  emptyChatComposerForm,
  type ChatComposerFormInput,
} from "@/lib/schemas/chat-composer";

const REFUND_ELIGIBLE_STATUSES = new Set(["completed", "rejected", "cancelled"]);

function pickEligibleRefundOrders(orders: Order[] | undefined) {
  if (!orders?.length) return [];
  return orders.filter(
    (o) => o.paymentStatus === "paid" && REFUND_ELIGIBLE_STATUSES.has(o.status)
  );
}

function messageRows(
  messages: Message[],
  customerId: string | undefined,
  customerAvatarSrc: string,
  customerAvatarInitial: string
) {
  const rows: React.ReactNode[] = [];
  let lastDayKey = "";

  for (const msg of messages) {
    const dayKey = msg.createdAt.slice(0, 10);
    if (dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      rows.push(
        <ChatDayDivider
          key={`day-${dayKey}-${msg.id}`}
          label={formatChatDayLabel(msg.createdAt)}
        />
      );
    }

    const isMe = msg.senderId === customerId;
    const variant = isMe ? "sent" : "received";
    let senderLabel: string | undefined;
    let avatarFallback: string | undefined;

    if (!isMe) {
      if (msg.senderRole === "superadmin") {
        senderLabel = "Support";
        avatarFallback = "S";
      } else if (msg.senderRole === "vendor" || msg.senderRole === "admin") {
        senderLabel = "Restaurant";
        avatarFallback = "R";
      } else if (msg.senderRole === "rider") {
        senderLabel = "Rider";
        avatarFallback = "D";
      } else {
        senderLabel = "Partner";
        avatarFallback = msg.senderRole?.[0]?.toUpperCase() || "";
      }
    }

    rows.push(
      <ChatMessageBubble
        key={msg.id}
        variant={variant}
        createdAt={msg.createdAt}
        senderLabel={senderLabel}
        avatarFallback={avatarFallback}
        sentAvatarSrc={isMe ? customerAvatarSrc : undefined}
        sentAvatarFallback={isMe ? customerAvatarInitial : undefined}
        readAt={
          isMe
            ? msg.readAt === undefined
              ? undefined
              : msg.readAt ?? null
            : undefined
        }
      >
        {msg.content}
      </ChatMessageBubble>
    );
  }

  return rows;
}

export type CustomerChatThreadMode = "site" | "popup";

export function CustomerChatThread({
  conversationId,
  mode,
}: {
  conversationId: string;
  mode: CustomerChatThreadMode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { customer, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const pinToDock = useChatDockStore((s) => s.pin);
  const ws = useWS();
  const scrollRef = useRef<HTMLDivElement>(null);
  const defaultProfilePhotoUrls = useDefaultProfilePhotoUrls();

  const customerAvatarSrc = useMemo(
    () =>
      resolveProfileAvatarUrl(customer?.avatarUrl, customer?.id ?? "", defaultProfilePhotoUrls),
    [customer?.avatarUrl, customer?.id, defaultProfilePhotoUrls],
  );
  const customerChatAvatarInitial = useMemo(() => {
    const n = customer?.name?.trim();
    if (n) return n.slice(0, 1).toUpperCase();
    return customer?.email?.[0]?.toUpperCase() || "";
  }, [customer?.name, customer?.email]);

  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.chat.listConversations(),
    enabled: isAuthenticated && !!conversationId,
  });

  const activeConv = useMemo(
    () => conversations?.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const isSupport = activeConv?.type === "customer_support";
  const { t } = useTranslation("customer");
  const currency = useCurrency();
  const refundRequestsEnabled = useCustomerRefundRequestsEnabled();
  const { data: ordersList, isLoading: ordersForRefundLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders.list({ limit: 80 }),
    enabled: isAuthenticated && isSupport && refundRequestsEnabled,
  });
  const eligibleRefundOrders = useMemo(
    () => pickEligibleRefundOrders(ordersList),
    [ordersList]
  );
  const [refundPickerOpen, setRefundPickerOpen] = useState(false);

  const chatTitle = isSupport
    ? activeConv?.supportSubject || "Support"
    : "Order chat";
  const chatSubtitle = isSupport
    ? "We typically reply soon"
    : activeConv?.orderId
      ? `Order #${activeConv.orderId.slice(0, 8)}`
      : null;

  const HeaderIcon =
    activeConv?.type === "customer_support"
      ? Headphones
      : activeConv?.type === "customer_rider" || activeConv?.type === "vendor_rider"
        ? Bike
        : Store;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, authLoading, router]);

  const { data: messages, isLoading } = useMessages(conversationId);
  const composerForm = useForm<ChatComposerFormInput>({
    resolver: zodResolver(chatComposerSchema),
    defaultValues: emptyChatComposerForm(),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const watchedBody = composerForm.watch("body");
  useEffect(() => {
    composerForm.reset(emptyChatComposerForm());
  }, [conversationId, composerForm]);
  const [statusBusy, setStatusBusy] = useState(false);
  const [endDialogOpen, setEndDialogOpen] = useState(false);

  const supportClosed = Boolean(isSupport && activeConv?.supportClosedAt);

  useWSEvent("chat:message", (event) => {
    if (event.conversationId === conversationId) {
      queryClient.invalidateQueries({
        queryKey: ["messages", conversationId],
      });
    }
  });

  useWSEvent("chat:support_status", (event) => {
    if (event.conversationId === conversationId) {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, conversationId]);

  if (authLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 lg:px-8">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-[50vh] w-full rounded-2xl" />
      </div>
    );
  }
  if (!isAuthenticated) return null;

  function openFullPageTab() {
    const url = `${window.location.origin}/chat/${conversationId}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openPopupWindow() {
    const url = `${window.location.origin}/chat-popup/${conversationId}`;
    window.open(
      url,
      `dilivygo-chat-${conversationId}`,
      "noopener,noreferrer,width=440,height=700"
    );
  }

  const handleSend = composerForm.handleSubmit(async (values) => {
    if (supportClosed) return;
    try {
      await api.chat.sendMessage(conversationId, values.body);
      composerForm.reset(emptyChatComposerForm());
      queryClient.invalidateQueries({
        queryKey: ["messages", conversationId],
      });
    } catch (err: unknown) {
    }
  });

  async function setSupportClosed(closed: boolean) {
    if (!conversationId || !isSupport || statusBusy) return;
    setStatusBusy(true);
    try {
      await api.chat.patchSupportStatus(conversationId, closed);
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setEndDialogOpen(false);
    } catch (err: unknown) {
    } finally {
      setStatusBusy(false);
    }
  }

  function handleTyping() {
    ws?.send({
      type: "chat:typing",
      conversationId,
      userId: customer?.id,
      isTyping: true,
    });
  }

  const outerClass =
    mode === "site"
      ? "mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col bg-gradient-to-b from-muted/20 to-background"
      : "flex h-[100dvh] w-full flex-col bg-gradient-to-b from-muted/20 to-background";

  return (
    <div className={outerClass}>
      {mode === "site" ? (
        <div className="shrink-0 border-b border-border/40 bg-background/80 px-4 py-2 backdrop-blur-md lg:px-8">
          <PromoBanner placement="chat_thread" />
        </div>
      ) : null}

      <header className="shrink-0 border-b border-border/50 bg-card/90 px-4 py-3 shadow-sm backdrop-blur-sm lg:px-8">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {mode === "popup" ? (
            <button
              type="button"
              onClick={() => postCustomerChatDockClose(conversationId)}
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.back()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Go back"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
              <HeaderIcon className="size-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight">{chatTitle}</h1>
              {chatSubtitle ? (
                <p className="truncate text-xs text-muted-foreground">
                  {supportClosed ? "Chat ended — reopen to message" : chatSubtitle}
                </p>
              ) : supportClosed ? (
                <p className="truncate text-xs text-muted-foreground">
                  Chat ended — reopen to message
                </p>
              ) : null}
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 rounded-xl"
              title="Open in new tab"
              aria-label="Open chat in new tab"
              onClick={openFullPageTab}
            >
              <ExternalLink className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 rounded-xl"
              title="Pop-out window"
              aria-label="Open chat in a separate window"
              onClick={openPopupWindow}
            >
              <AppWindow className="size-4" />
            </Button>
            {mode === "site" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 rounded-xl"
                title="Pin to bottom dock"
                aria-label="Pin chat to bottom dock"
                onClick={() => pinToDock({ id: conversationId, title: chatTitle })}
              >
                <PanelBottom className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>

        {isSupport ? (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {refundRequestsEnabled ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 rounded-xl"
                onClick={() => setRefundPickerOpen(true)}
              >
                <CircleDollarSign className="size-3.5" />
                {t("supportChat.refundOrderCta")}
              </Button>
            ) : null}
            {supportClosed ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="gap-1.5 rounded-xl"
                disabled={statusBusy}
                onClick={() => setSupportClosed(false)}
              >
                <RotateCcw className="size-3.5" />
                Reopen chat
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={statusBusy}
                onClick={() => setEndDialogOpen(true)}
              >
                <MessageCircleOff className="size-3.5" />
                End chat
              </Button>
            )}
          </div>
        ) : null}

        <Dialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>End this support chat?</DialogTitle>
              <DialogDescription>
                You will not be able to send messages until you or support reopens the chat. Your
                message history stays here.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEndDialogOpen(false)}
                disabled={statusBusy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={statusBusy}
                onClick={() => setSupportClosed(true)}
              >
                End chat
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={refundPickerOpen} onOpenChange={setRefundPickerOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("supportChat.refundOrderDialogTitle")}</DialogTitle>
              <DialogDescription>{t("supportChat.refundOrderDialogHint")}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[min(360px,50vh)] overflow-y-auto rounded-xl border border-border/60">
              {ordersForRefundLoading ? (
                <p className="p-4 text-sm text-muted-foreground">{t("supportChat.refundOrderLoading")}</p>
              ) : eligibleRefundOrders.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{t("supportChat.refundOrderEmpty")}</p>
              ) : (
                <AnimatedUl className="divide-y divide-border/60">
                  {eligibleRefundOrders.map((o) => (
                    <li key={o.id}>
                      <Link
                        href={`/orders/${o.id}?conversationId=${encodeURIComponent(conversationId)}`}
                        className="flex flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                        onClick={() => setRefundPickerOpen(false)}
                      >
                        <span className="text-sm font-medium">
                          {o.shop?.name ?? t("supportChat.refundOrderUntitledShop")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(o.createdAt).toLocaleString()} · {formatPrice(o.totalCents, currency)}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          #{o.id.slice(0, 8)}…
                        </span>
                      </Link>
                    </li>
                  ))}
                </AnimatedUl>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setRefundPickerOpen(false)}
              >
                {t("orders.refundCancel")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <ChatMessagesArea
        ref={scrollRef}
        className="bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-muted/40 via-transparent to-transparent"
      >
        {isLoading ? (
          <div className="flex flex-col gap-4 px-2 py-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton
                key={i}
                className={cn(
                  "h-12 rounded-2xl",
                  i % 2 === 0 ? "self-start w-[72%]" : "self-end w-[58%]"
                )}
              />
            ))}
          </div>
        ) : !messages?.length ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-6 py-8">
              <p className="text-sm font-medium text-foreground">No messages yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Say hello below — replies appear here in real time.
              </p>
            </div>
          </div>
        ) : (
          messageRows(
            messages,
            customer?.id,
            customerAvatarSrc,
            customerChatAvatarInitial
          )
        )}
      </ChatMessagesArea>

      {isSupport && conversationId && supportClosed ? (
        <SupportRatingPanel conversationId={conversationId} />
      ) : null}

      {isSupport && supportClosed ? (
        <div className="shrink-0 border-t border-primary/25 bg-primary/10 px-4 py-3 text-center text-sm text-foreground">
          This chat has ended. Tap <strong className="font-semibold">Reopen chat</strong> above to
          continue the conversation.
        </div>
      ) : null}

      <Form {...composerForm}>
        <div className="shrink-0">
          {composerForm.formState.errors.body?.message ? (
            <p
              role="alert"
              className="border-b border-destructive/25 bg-destructive/5 px-4 py-2 text-center text-xs text-destructive"
            >
              {composerForm.formState.errors.body.message}
            </p>
          ) : null}
          <ChatComposer
            value={watchedBody}
            onChange={(v) => {
              composerForm.setValue("body", v, { shouldDirty: true });
              handleTyping();
            }}
            onSubmit={() => void handleSend()}
            sending={composerForm.formState.isSubmitting}
            disabled={!conversationId || supportClosed}
            placeholder={
              supportClosed ? "Reopen the chat to send messages…" : "Type a message…"
            }
            className="shrink-0 bg-background/95"
          />
        </div>
      </Form>
    </div>
  );
}
