"use client";

import { useEffect } from "react";
import { FloatingChatDock } from "@dilivygo/ui";
import { CHAT_DOCK_CLOSE_TAB, type CustomerChatDockMessage } from "@/lib/chat-dock-protocol";
import { useChatDockStore } from "@/stores/chat-dock-store";

export function CustomerChatDock() {
  const items = useChatDockStore((s) => s.items);
  const activeId = useChatDockStore((s) => s.activeId);
  const expanded = useChatDockStore((s) => s.expanded);
  const setExpanded = useChatDockStore((s) => s.setExpanded);
  const setActive = useChatDockStore((s) => s.setActive);
  const unpin = useChatDockStore((s) => s.unpin);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as CustomerChatDockMessage | undefined;
      if (!data || data.type !== CHAT_DOCK_CLOSE_TAB) return;
      if (data.scope !== "customer") return;
      unpin(data.conversationId);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [unpin]);

  return (
    <FloatingChatDock
      className="left-[calc(76px+1rem)] max-w-[calc(100vw-76px-2rem)] sm:left-[calc(76px+1.5rem)]"
      items={items}
      activeId={activeId}
      expanded={expanded}
      onExpandedChange={setExpanded}
      onActiveChange={setActive}
      onRemoveItem={unpin}
      label="Chats"
      iframeSrcFor={(id) => `/chat-popup/${id}`}
    />
  );
}
