// Link-graph helpers over ONE traceability fetch (§42: lib/query).
// All relationships stay server-computed; this only indexes them client-side.

export type Link = { from: string; to: string; rel: string };

/** All links touching an artifact code (as source or target). */
export function touching(links: Link[], code: string): Link[] {
  const short = (s: string) => s.split(":").pop() || s;
  return links.filter((l) => short(l.from) === code || short(l.to) === code);
}

/** Link count per requirement code (coverage column). */
export function linkCounts(links: Link[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const l of links) {
    const parts = l.from.split(":");
    if (parts[0] === "requirement" && parts[1]) counts[parts[1]] = (counts[parts[1]] || 0) + 1;
  }
  return counts;
}

/** Sibling artifacts sharing the same source requirement (story → APIs/tasks/tests). */
export function siblings(links: Link[], reqCode: string, exclude?: string): Link[] {
  return links.filter((l) => {
    const [st, sid] = l.from.split(":");
    return st === "requirement" && sid === reqCode && l.to !== exclude;
  });
}
