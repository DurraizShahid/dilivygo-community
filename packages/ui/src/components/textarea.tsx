"use client";

import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/utils";

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "flex min-h-[80px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none",
          className
        )}
        {...props}
      />
    );
  }
);

export { Textarea };
