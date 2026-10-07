import { createOrderChatHooks } from "@dilivygo/chat";
import { api } from "@/lib/api";

const { useConversations, useMessages } = createOrderChatHooks(api);

export { useConversations, useMessages };
