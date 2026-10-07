"use client";

import type { HTMLAttributes, ImgHTMLAttributes } from "react";
import { cn } from "../lib/utils";

function Avatar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="avatar"
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  );
}

function AvatarImage({ className, src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  if (src == null) return null;
  const safeSrc = typeof src === "string" ? src.trim() : String(src);
  if (!safeSrc) return null;
  return (
    <img
      data-slot="avatar-image"
      className={cn("aspect-square h-full w-full", className)}
      src={safeSrc}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="avatar-fallback"
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted text-sm font-medium",
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
