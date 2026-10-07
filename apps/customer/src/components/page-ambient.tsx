"use client";

export function PageAmbient() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden motion-reduce:hidden"
      aria-hidden
    >
      <div className="absolute -left-[20%] -top-[30%] h-[min(85vh,720px)] w-[min(85vw,720px)] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.72_0.22_355_/0.45),transparent_65%)] blur-3xl motion-safe:animate-ambient-drift" />
      <div className="absolute -right-[15%] top-[10%] h-[min(70vh,560px)] w-[min(75vw,640px)] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.75_0.16_290_/0.35),transparent_68%)] blur-3xl motion-safe:animate-ambient-drift-reverse" />
      <div className="absolute bottom-[-25%] left-[25%] h-[min(60vh,480px)] w-[min(90vw,900px)] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.78_0.14_55_/0.28),transparent_70%)] blur-3xl motion-safe:ambient-float-subtle" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,var(--background)_88%,var(--background)_100%)] opacity-90" />
    </div>
  );
}
