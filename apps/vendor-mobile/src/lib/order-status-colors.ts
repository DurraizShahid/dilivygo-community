import type { OrderStatus } from "@dilivygo/types";
import type { AppColors } from "@/lib/theme";

/** Status badge colors; semantic tokens from theme where applicable. */
export function orderStatusColors(c: AppColors): Record<OrderStatus, string> {
  return {
    placed: c.warning,
    accepted: "#3B82F6",
    rejected: c.destructive,
    preparing: "#8B5CF6",
    ready: c.success,
    assigned: "#06B6D4",
    picked_up: "#06B6D4",
    arrived: "#06B6D4",
    completed: c.mutedForeground,
    cancelled: c.destructive,
    scheduled: "#F59E0B",
  };
}
