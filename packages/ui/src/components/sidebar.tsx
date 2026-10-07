"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

type SidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

export function SidebarProvider({
  children,
  collapsed: collapsedProp,
  defaultCollapsed = false,
  onCollapsedChange,
}: {
  children: React.ReactNode;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultCollapsed);
  const collapsed = typeof collapsedProp === "boolean" ? collapsedProp : uncontrolled;
  const setCollapsed = React.useCallback(
    (next: boolean) => {
      onCollapsedChange?.(next);
      if (typeof collapsedProp !== "boolean") setUncontrolled(next);
    },
    [collapsedProp, onCollapsedChange],
  );
  const toggleCollapsed = React.useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  const value = React.useMemo(
    () => ({ collapsed, setCollapsed, toggleCollapsed }),
    [collapsed, setCollapsed, toggleCollapsed],
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={220}>{children}</TooltipProvider>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { collapsed } = useSidebar();
  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "group/sidebar flex min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex shrink-0 items-center gap-2 border-b border-border px-2.5 py-2", className)} {...props} />;
}

export const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("min-h-0 flex-1 overflow-y-auto px-2.5 py-2", className)} {...props} />;
  },
);
SidebarContent.displayName = "SidebarContent";

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex shrink-0 flex-col gap-2 border-t border-border px-2.5 py-2", className)} {...props} />;
}

export function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 group-data-[collapsed=true]/sidebar:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex", className)} {...props} />;
}

const sidebarMenuButtonVariants = cva(
  "group/menu-button relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      isActive: {
        true: "bg-primary/12 text-foreground ring-1 ring-primary/25",
        false: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      },
    },
    defaultVariants: {
      isActive: false,
    },
  },
);

export const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof sidebarMenuButtonVariants> & {
      asChild?: boolean;
      tooltip?: string;
    }
>(({ className, asChild, isActive, tooltip, children, ...props }, ref) => {
  const { collapsed } = useSidebar();
  const Comp = asChild ? Slot : "button";
  const button = (
    <Comp ref={ref} className={cn(sidebarMenuButtonVariants({ isActive }), className)} {...props}>
      {children}
    </Comp>
  );

  if (!tooltip) return button;
  if (!collapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
});
SidebarMenuButton.displayName = "SidebarMenuButton";

export function SidebarTrigger({
  className,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "onClick"> & { onClick?: () => void }) {
  const { collapsed, toggleCollapsed } = useSidebar();
  return (
    <button
      type="button"
      className={cn(
        "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground",
        className,
      )}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      onClick={() => {
        props.onClick?.();
        toggleCollapsed();
      }}
    >
      {props.children}
    </button>
  );
}
