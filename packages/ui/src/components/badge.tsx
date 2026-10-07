"use client";

import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive/10 text-destructive",
        outline: "text-foreground",
        success:
          "border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        warning:
          "border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
