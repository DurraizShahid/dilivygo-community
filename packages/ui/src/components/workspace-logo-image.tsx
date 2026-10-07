"use client";

import { cn } from "../lib/utils";

/** Fills a square or rounded frame; use inside a sized, overflow-hidden container. */
export const workspaceLogoImageClassName =
  "size-full min-h-full min-w-full object-cover object-center";

type WorkspaceLogoImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & { src: string };

export function WorkspaceLogoImage({
  className,
  alt = "",
  src,
  ...props
}: WorkspaceLogoImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      className={cn(workspaceLogoImageClassName, className)}
      {...props}
    />
  );
}
