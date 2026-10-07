"use client";

import { useParams } from "next/navigation";
import { CustomerChatThread } from "@/components/customer-chat-thread";

export default function ChatPopupPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <CustomerChatThread conversationId={id} mode="popup" />;
}
