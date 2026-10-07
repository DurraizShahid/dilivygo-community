"use client";

import type { ReactNode } from "react";
import type { Message } from "@dilivygo/types";
import { ChatDayDivider } from "./chat-day-divider";
import { ChatMessageBubble } from "./chat-message-bubble";
import { formatChatDayLabel } from "../lib/chat-utils";

/**
 * Message list rows for superadmin / SaaS support inbox (customer vs staff bubbles).
 */
export function supportInboxThreadRows(messages: Message[]): ReactNode[] {
  const rows: ReactNode[] = [];
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

    const isStaff = msg.senderRole === "superadmin" || msg.senderRole === "admin";
    rows.push(
      <ChatMessageBubble
        key={msg.id}
        variant={isStaff ? "sent" : "received"}
        createdAt={msg.createdAt}
        senderLabel={!isStaff ? "Customer" : undefined}
        avatarFallback={isStaff ? "S" : "C"}
      >
        {msg.content}
      </ChatMessageBubble>
    );
  }

  return rows;
}
