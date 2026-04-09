import type { Headline, HeadlineStyle, RawContentItem, SiteContent, ContentCategory } from "./types";

// Tunables
const MEMORY_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_CYCLES = 6; // drop headlines after this many cycles without re-entry
const HARD_CAP = 50;
const CATEGORY_FLOORS: Partial<Record<ContentCategory, number>> = {
  sports: 2,
  finance: 2,
  culture: 2,
};
const TOPIC_OVERLAP_THRESHOLD = 2;

function normalizeTopic(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^\w\u0900-\u097F]+/g, "")
    .trim();
}

/**
 * Build topic → {lastSeenAt, cycles} map from previous cache, pruned to
 * MEMORY_WINDOW_MS. Merges any persisted seenTopics with live headline topics.
 */
export function buildSeenTopics(
  prev: SiteContent | null
): Map<string, { lastSeenAt: number; cycles: number }> {
  const out = new Map<string, { lastSeenAt: number; cycles: number }>();
  if (!prev) return out;
  const cutoff = Date.now() - MEMORY_WINDOW_MS;

  // Seed from persisted memory
  if (prev.seenTopics) {
    for (const [topic, info] of Object.entries(prev.seenTopics)) {
      const ts = new Date(info.lastSeenAt).getTime();
      if (isNaN(ts) || ts < cutoff) continue;
      out.set(topic, { lastSeenAt: ts, cycles: info.cycles });
    }
  }

  // Overlay live headline topics
  const live = [
    ...(prev.breaking ? [prev.breaking] : []),
    ...prev.topStories,
    ...prev.headlines,
  ];
  const now = Date.now();
  for (const h of live) {
    for (const t of h.keyTopics ?? []) {
      const key = normalizeTopic(t);
      if (!key) continue;
      const existing = out.get(key);
      if (!existing || existing.lastSeenAt < now) {
        out.set(key, { lastSeenAt: now, cycles: (existing?.cycles ?? 0) + 1 });
      }
    }
  }
  return out;
}

/**
 * Serialize seenTopics back to the cache structure.
 */
export function serializeSeenTopics(
  memory: Map<string, { lastSeenAt: number; cycles: number }>
): Record<string, { lastSeenAt: string; cycles: number }> {
  const out: Record<string, { lastSeenAt: string; cycles: number }> = {};
  for (const [k, v] of memory.entries()) {
    out[k] = { lastSeenAt: new Date(v.lastSeenAt).toISOString(), cycles: v.cycles };
  }
  return out;
}

/**
 * Pre-generation filter: drop bundled items whose topics sufficiently overlap
 * with stories we already ran in the last 6 hours, UNLESS the new item has a
 * novel topic (genuinely new angle on an ongoing story).
 *
 * Also drops any item whose URL is already a live headline (exact repeat).
 */
export function filterByTopicMemory(
  items: RawContentItem[],
  seenTopics: Map<string, { lastSeenAt: number; cycles: number }>,
  liveUrls: Set<string>
): { kept: RawContentItem[]; droppedDuplicate: number; droppedTopic: number } {
  let droppedDuplicate = 0;
  let droppedTopic = 0;
  const kept: RawContentItem[] = [];
  for (const item of items) {
    if (liveUrls.has(item.url)) {
      droppedDuplicate++;
      continue;
    }
    const topics = (item.keyTopics ?? []).map(normalizeTopic).filter(Boolean);
    if (topics.length === 0) {
      kept.push(item);
      continue;
    }
    let overlap = 0;
    let novel = 0;
    for (const t of topics) {
      if (seenTopics.has(t)) overlap++;
      else novel++;
    }
    if (overlap >= TOPIC_OVERLAP_THRESHOLD && novel === 0) {
      droppedTopic++;
      continue;
    }
    kept.push(item);
  }
  return { kept, droppedDuplicate, droppedTopic };
}

/**
 * Age existing headlines by one cycle. Demote style tiers over time so
 * yesterday's "top" doesn't dominate today, and drop anything older than
 * MAX_CYCLES.
 */
export function ageHeadlines(prev: Headline[]): Headline[] {
  const out: Headline[] = [];
  for (const h of prev) {
    const cycles = (h.cyclesSurvived ?? 0) + 1;
    if (cycles > MAX_CYCLES) continue;
    // Breaking only survives one cycle
    if (h.style === "breaking" && cycles > 1) {
      out.push({ ...h, style: "major", cyclesSurvived: cycles });
      continue;
    }
    // Demote: top → major at cycle 3, major → normal at cycle 4
    let style: HeadlineStyle = h.style;
    if (h.style === "top" && cycles >= 3) style = "major";
    if ((h.style === "major" || style === "major") && cycles >= 4) style = "normal";
    out.push({ ...h, style, cyclesSurvived: cycles });
  }
  return out;
}

/**
 * Merge freshly generated new headlines with aged prev headlines.
 * New items take the top slots within their style tier. Hard cap applied.
 */
export function mergeRolling(newItems: Headline[], agedPrev: Headline[]): Headline[] {
  const now = new Date().toISOString();
  for (const h of newItems) {
    if (!h.firstSeenAt) h.firstSeenAt = now;
    if (h.cyclesSurvived == null) h.cyclesSurvived = 0;
  }
  // Combine; dedup by id (new items win)
  const byId = new Map<string, Headline>();
  for (const h of newItems) byId.set(h.id, h);
  for (const h of agedPrev) if (!byId.has(h.id)) byId.set(h.id, h);

  // Also dedup by URL (same url from different id)
  const byUrl = new Map<string, Headline>();
  for (const h of byId.values()) {
    const existing = byUrl.get(h.url);
    if (!existing) {
      byUrl.set(h.url, h);
      continue;
    }
    // Prefer the newer (lower cyclesSurvived) entry
    if ((h.cyclesSurvived ?? 0) < (existing.cyclesSurvived ?? 99)) {
      byUrl.set(h.url, h);
    }
  }

  const merged = Array.from(byUrl.values());

  // Sort: style tier, then newer (lower cyclesSurvived) first, then by score
  const styleOrder: Record<HeadlineStyle, number> = {
    breaking: 0,
    top: 1,
    major: 2,
    normal: 3,
  };
  merged.sort((a, b) => {
    const s = styleOrder[a.style] - styleOrder[b.style];
    if (s !== 0) return s;
    const c = (a.cyclesSurvived ?? 0) - (b.cyclesSurvived ?? 0);
    if (c !== 0) return c;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  // Hard cap
  const capped = merged.slice(0, HARD_CAP);
  capped.forEach((h, i) => (h.position = i));
  return capped;
}

/**
 * Ensure non-politics categories have a minimum presence. If a floor isn't
 * met, promote the highest-scored items from the candidate pool that aren't
 * already in the final set.
 */
export function enforceCategoryMinimums(
  headlines: Headline[],
  candidates: Headline[]
): Headline[] {
  const counts: Partial<Record<ContentCategory, number>> = {};
  for (const h of headlines) counts[h.category] = (counts[h.category] ?? 0) + 1;

  const haveIds = new Set(headlines.map((h) => h.id));
  const haveUrls = new Set(headlines.map((h) => h.url));
  const out = [...headlines];

  for (const [cat, floor] of Object.entries(CATEGORY_FLOORS)) {
    const category = cat as ContentCategory;
    const need = (floor ?? 0) - (counts[category] ?? 0);
    if (need <= 0) continue;
    const pool = candidates
      .filter((c) => c.category === category && !haveIds.has(c.id) && !haveUrls.has(c.url))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, need);
    for (const p of pool) {
      // Promote as "normal" (don't let floor-filling crowd top tier)
      out.push({ ...p, style: p.style === "breaking" ? "major" : p.style });
      haveIds.add(p.id);
      haveUrls.add(p.url);
    }
    if (pool.length > 0) {
      console.log(`[RollingFeed] Category floor: promoted ${pool.length} ${category} item(s)`);
    }
  }

  return out.slice(0, HARD_CAP);
}
