"use client";

import * as React from "react";
import type { Message } from "@dilivygo/types";
import { ChatDayDivider } from "./chat-day-divider";
import { ChatMessageBubble } from "./chat-message-bubble";
import { formatChatDayLabel } from "../lib/chat-utils";
import { cn } from "../lib/utils";

const DEFAULT_ROLE_LABELS: Record<string, string> = {
  vendor: "Restaurant",
  admin: "Staff",
  rider: "Rider",
  customer: "Customer",
  superadmin: "Support",
};

function resolveReceivedLabel(
  senderRole: string | undefined,
  roleLabels: Partial<Record<string, string>> | undefined
): { senderLabel?: string; avatarFallback: string } {
  const key = (senderRole || "").toLowerCase();
  const senderLabel =
    roleLabels?.[key] ?? DEFAULT_ROLE_LABELS[key] ?? (senderRole ? senderRole : undefined);
  const avatarFallback =
    (senderLabel && senderLabel[0]?.toUpperCase()) ||
    senderRole?.[0]?.toUpperCase() ||
    "?";
  return { senderLabel, avatarFallback };
}

export interface OrderChatMessageListProps {
  messages: Message[];
  currentUserId: string | undefined;
  myAvatarSrc?: string;
  myAvatarFallback?: string;
  /** Lowercase keys (e.g. `vendor`, `rider`) override default role labels */
  roleLabels?: Partial<Record<string, string>>;
  className?: string;
}

/**
 * Opinionated message stream for order / staff threads: day dividers, role labels,
 * read receipts on outbound bubbles when `readAt` is present on the message DTO.
 */
export function OrderChatMessageList({
  messages,
  currentUserId,
  myAvatarSrc,
  myAvatarFallback,
  roleLabels,
  className,
}: OrderChatMessageListProps) {
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

    const isMe = msg.senderId === currentUserId;
    if (isMe) {
      rows.push(
        <ChatMessageBubble
          key={msg.id}
          variant="sent"
          createdAt={msg.createdAt}
          sentAvatarSrc={myAvatarSrc}
          sentAvatarFallback={myAvatarFallback}
          readAt={msg.readAt === undefined ? undefined : msg.readAt ?? null}
        >
          {msg.content}
        </ChatMessageBubble>
      );
    } else {
      const { senderLabel, avatarFallback } = resolveReceivedLabel(
        msg.senderRole,
        roleLabels
      );
      rows.push(
        <ChatMessageBubble
          key={msg.id}
          variant="received"
          createdAt={msg.createdAt}
          senderLabel={senderLabel}
          avatarFallback={avatarFallback}
        >
          {msg.content}
        </ChatMessageBubble>
      );
    }
  }

  return <div className={cn("flex flex-col gap-1", className)}>{rows}</div>;
}
