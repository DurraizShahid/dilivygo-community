"use client";

import { useParams } from "next/navigation";
import { CustomerChatThread } from "@/components/customer-chat-thread";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <CustomerChatThread conversationId={id} mode="site" />;
}
