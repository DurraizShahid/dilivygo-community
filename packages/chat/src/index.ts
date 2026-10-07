import { useQuery } from "@tanstack/react-query";
import { sortChatMessagesAscending } from "@dilivygo/ui";
import type { Conversation, Message } from "@dilivygo/types";

/** Minimal chat slice used by storefront / rider / vendor apps. */
export interface OrderChatApiClient {
  listConversations(): Promise<Conversation[]>;
  getMessages(conversationId: string, page?: number): Promise<Message[]>;
  sendMessage(conversationId: string, content: string): Promise<Message>;
  markRead(conversationId: string): Promise<void>;
}

export interface CreateOrderChatHooksOptions {
  /** When true (default), messages are sorted oldest-first for bottom-anchored UIs. */
  sortMessagesAscending?: boolean;
}

/**
 * Factory so each Next app passes its configured `api` singleton while sharing
 * the same TanStack Query keys and refetch cadence.
 */
export function createOrderChatHooks(
  api: { chat: OrderChatApiClient },
  options: CreateOrderChatHooksOptions = {}
) {
  const sortAsc = options.sortMessagesAscending !== false;

  function useConversations() {
    return useQuery<Conversation[]>({
      queryKey: ["conversations"],
      queryFn: () => api.chat.listConversations(),
    });
  }

  function useMessages(conversationId: string) {
    return useQuery<Message[]>({
      queryKey: ["messages", conversationId],
      queryFn: async () => {
        const rows = await api.chat.getMessages(conversationId);
        return sortAsc ? sortChatMessagesAscending(rows) : rows;
      },
      enabled: !!conversationId,
      refetchInterval: 5_000,
    });
  }

  return { useConversations, useMessages };
}

export { usePeerTypingIndicator, useThrottledTypingEmit } from "./typing";
