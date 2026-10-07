import type { Conversation, ConversationType } from "@dilivygo/types";

export function formatChatListTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (diffMin < 1440 * 7) {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function convListMeta(conv: Conversation) {
  const isSupport = conv.type === "customer_support";
  const title = isSupport
    ? conv.supportSubject || "Support"
    : conv.type === "customer_vendor"
      ? "Restaurant"
      : "Rider";
  const subtitle = isSupport
    ? "Platform support"
    : conv.orderId
      ? `Order #${conv.orderId.slice(0, 8).toUpperCase()}`
      : "Order chat";
  return { title, subtitle };
}

export function avatarTintForConversation(type: ConversationType): { bg: string; fg: string } {
  const presets: Record<ConversationType, { bg: string; fg: string }> = {
    customer_support: { bg: "#6366F1", fg: "#FFFFFF" },
    customer_vendor: { bg: "#EA580C", fg: "#FFFFFF" },
    vendor_rider: { bg: "#059669", fg: "#FFFFFF" },
    customer_rider: { bg: "#059669", fg: "#FFFFFF" },
  };
  return presets[type];
}

export function initialsFromTitle(title: string): string {
  const t = title.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

export function sameCalendarDay(aIso: string, bIso: string) {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatChatDayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - msgDay.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
