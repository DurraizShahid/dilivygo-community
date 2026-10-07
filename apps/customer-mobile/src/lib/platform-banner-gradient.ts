/**
 * Map superadmin Tailwind gradient presets to native linear-gradient stops.
 * Custom admin values fall back to a neutral violet pair.
 */
export function bannerGradientColors(
  bgGradient: string,
  primaryHex: string,
): [string, string] {
  const g = bgGradient.trim();
  if (g.includes("from-primary")) {
    return [primaryHex, `${primaryHex}CC`];
  }
  const map: Record<string, [string, string]> = {
    "from-orange-500 to-rose-500": ["#f97316", "#f43f5e"],
    "from-blue-500 to-cyan-500": ["#3b82f6", "#06b6d4"],
    "from-violet-600 to-indigo-600": ["#7c3aed", "#4f46e5"],
    "from-emerald-500 to-teal-500": ["#10b981", "#14b8a6"],
    "from-pink-500 to-fuchsia-600": ["#ec4899", "#c026d3"],
    "from-slate-800 to-slate-900": ["#1e293b", "#0f172a"],
    "from-red-500 to-orange-500": ["#ef4444", "#f97316"],
    "from-amber-400 to-yellow-500": ["#fbbf24", "#eab308"],
  };
  return map[g] ?? ["#6366f1", "#a855f7"];
}
