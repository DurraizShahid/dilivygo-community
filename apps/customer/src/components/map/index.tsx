"use client";

import dynamic from "next/dynamic";

export const RiderTrackingMap = dynamic(
  () => import("./rider-tracking-map"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[280px] w-full animate-pulse rounded-2xl bg-muted" />
    ),
  }
);
