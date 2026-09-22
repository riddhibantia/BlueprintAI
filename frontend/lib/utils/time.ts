export function timeAgo(iso?: string): string {
  if (!iso) return "Not available";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Not available";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtDate(iso?: string): string {
  if (!iso) return "Not available";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Not available" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
