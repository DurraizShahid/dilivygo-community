"use client";

import { WSProvider } from "@/providers/ws-provider";

/**
 * Minimal shell for embedded / pop-out chat (iframe-friendly). Same-origin cookies apply.
 */
export default function ChatPopupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WSProvider>{children}</WSProvider>;
}
