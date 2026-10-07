"use client";

import { Badge } from "./badge";
import { cn } from "../lib/utils";
import type { OrderStatus } from "@dilivygo/types";

const statusConfig: Record<
  OrderStatus,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }
> = {
  placed: { label: "Placed", variant: "secondary" },
  scheduled: { label: "Scheduled", variant: "secondary" },
  accepted: { label: "Accepted", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  preparing: { label: "Preparing", variant: "warning" },
  ready: { label: "Ready", variant: "warning" },
  assigned: { label: "Rider Assigned", variant: "default" },
  picked_up: { label: "Picked Up", variant: "default" },
  arrived: { label: "Rider Arrived", variant: "success" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const config = statusConfig[status] ?? { label: status, variant: "secondary" as const };
  return (
    <Badge variant={config.variant} className={cn(className)}>
      {config.label}
    </Badge>
  );
}
