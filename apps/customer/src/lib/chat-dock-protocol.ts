export const CHAT_DOCK_CLOSE_TAB = "dilivygo-chat-dock:close-tab" as const;

export type CustomerChatDockMessage = {
  type: typeof CHAT_DOCK_CLOSE_TAB;
  conversationId: string;
  scope: "customer";
};

export function postCustomerChatDockClose(conversationId: string) {
  if (typeof window === "undefined") return;
  if (window.parent !== window) {
    window.parent.postMessage(
      {
        type: CHAT_DOCK_CLOSE_TAB,
        conversationId,
        scope: "customer",
      } satisfies CustomerChatDockMessage,
      window.location.origin
    );
  } else {
    window.close();
  }
}
