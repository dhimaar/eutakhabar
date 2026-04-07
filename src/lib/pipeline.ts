import Anthropic from "@anthropic-ai/sdk";
import { collectAll } from "./collectors";
import { analyzeContent } from "./analyzer";
import { scoreItems } from "./scoring";
import { generateHeadlines, rewriteTopHeadlines } from "./generator";
import { fetchArticleBodies } from "./article-body";
import { reviewHeadlines, applyReviewPatches, resetEscalationBudget } from "./editor-review";
import { readCache, writeCache } from "./cache";
import { clearSourceCache } from "./sources";
import { fetchOgImages, fetchArticleMetaBatch } from "./og-image";
import type { SiteContent, Headline, ManualOverride, RawContentItem, SourceLink } from "./types";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const anthropic = new Anthropic();

export async function runPipeline(): Promise<SiteContent> {
  console.log("[Pipeline] Starting refresh cycle...");
  const startTime = Date.now();

  // Clear cached source config to pick up any changes
  clearSourceCache();

  // Step 1: Collect from all sources
  console.log("[Pipeline] Step 1: Collecting content...");
  const rawItemsAll = await collectAll();
  console.log(`[Pipeline] Collected ${rawItemsAll.length} items`);

  if (rawItemsAll.length === 0) {
    console.log("[Pipeline] No items collected, returning cached content");
    return readCache() ?? emptyContent();
  }

  // Step 1.5: Article meta — fetch published_time, og:image, and opinion
  // detection in one pass. Items whose collector-default timestamp is fresh
  // (within last 5 min, meaning no real pubdate from source) are checked
  // against article:published_time and dropped if older than 24h. All
  // checked items also get an isOpinion flag set from URL/meta heuristics.
  console.log("[Pipeline] Step 1.5: Article meta check (freshness + opinion)...");
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const fakeTsThreshold = Date.now() - 5 * 60 * 1000;
  const needsCheck = rawItemsAll.filter((item) => {
    const ts = new Date(item.timestamp).getTime();
    return !isNaN(ts) && ts > fakeTsThreshold;
  });
  if (needsCheck.length > 0) {
    const metas = await fetchArticleMetaBatch(needsCheck.map((i) => i.url));
    let droppedStale = 0;
    let droppedUnverified = 0;
    let opinions = 0;
    for (const item of needsCheck) {
      const meta = metas.get(item.url);
      if (meta?.publishedAt) {
        if (meta.publishedAt < cutoff) {
          item.timestamp = "STALE";
          droppedStale++;
          continue;
        }
        item.timestamp = new Date(meta.publishedAt).toISOString();
        if (meta.imageUrl && !item.imageUrl) item.imageUrl = meta.imageUrl;
        if (meta.isOpinion) {
          item.isOpinion = true;
          opinions++;
        }
      } else {
        // No verifiable published_time AND collector gave a fake timestamp.
        // Better to drop than risk surfacing stale news as TOP.
        item.timestamp = "STALE";
        droppedUnverified++;
      }
    }
    console.log(`[Pipeline] Meta check: ${droppedStale} stale + ${droppedUnverified} unverified dropped, ${opinions} flagged as opinion (${needsCheck.length} checked)`);
  }
  const rawItems = rawItemsAll.filter((i) => i.timestamp !== "STALE");

  // Step 2: Analyze (Claude pass 1 — transcripts, newsworthiness)
  console.log("[Pipeline] Step 2: Analyzing content...");
  const analyzedItems = await analyzeContent(rawItems);
  console.log(`[Pipeline] ${analyzedItems.length} items after analysis`);

  // Step 3: Score and rank
  console.log("[Pipeline] Step 3: Scoring items...");
  const scoredItems = scoreItems(analyzedItems);

  // Step 3.5: Bundle cross-source stories (LLM semantic clustering)
  console.log("[Pipeline] Step 3.5: LLM clustering cross-source stories...");
  const { bundled, sourceMap } = await clusterStoriesLLM(scoredItems);
  console.log(`[Pipeline] LLM clustering: ${scoredItems.length} items → ${bundled.length} stories (${scoredItems.length - bundled.length} duplicates merged)`);

  // Step 4: Generate headlines (Claude pass 2 — rewrite)
  console.log("[Pipeline] Step 4: Generating headlines...");
  let headlines = await generateHeadlines(bundled);

  // Step 4.5: Editor review (GPT critic)
  console.log("[Pipeline] Step 4.5: Editor review...");
  resetEscalationBudget();
  const review = await reviewHeadlines(headlines, bundled);
  if (review.applied.length > 0 || review.rejected.length > 0) {
    const counts = { drop: 0, demote: 0, rewrite: 0 };
    for (const p of review.applied) counts[p.action]++;
    console.log(`[Pipeline] Editor review: ${review.applied.length} patches applied (drop=${counts.drop}, demote=${counts.demote}, rewrite=${counts.rewrite}), ${review.rejected.length} rejected`);
    headlines = await applyReviewPatches(headlines, bundled, review);

    // Audit log
    try {
      const reviewDir = join(process.cwd(), "cache");
      mkdirSync(reviewDir, { recursive: true });
      writeFileSync(
        join(reviewDir, "last-review.json"),
        JSON.stringify({ at: new Date().toISOString(), review }, null, 2)
      );
    } catch {}
  }

  // Step 4.6: Final structural dedup safety net
  headlines = structuralDedup(headlines);

  // Step 4.7: Full-body rewrite for top stories only
  // After critic + dedup, the top set is stable. Fetch full article bodies
  // for top/breaking items and ask Claude to write a sharper headline using
  // the body content (not just the source title).
  console.log("[Pipeline] Step 4.7: Body-rewrite for top stories...");
  const topUrls = headlines
    .filter((h) => h.style === "top" || h.style === "breaking")
    .map((h) => h.url);
  if (topUrls.length > 0) {
    const bodies = await fetchArticleBodies(topUrls);
    const isOpinionMap = new Map<string, boolean>();
    for (const item of bundled) isOpinionMap.set(item.id, !!item.isOpinion);
    const result = await rewriteTopHeadlines(headlines, bodies, isOpinionMap);
    console.log(`[Pipeline] Body-rewrite: ${result.rewritten} rewritten, ${result.skipped} skipped (${topUrls.length} top stories, ${bodies.size} bodies fetched)`);
  }

  // Attach source links to headlines
  for (const headline of headlines) {
    const links = sourceMap.get(headline.id);
    if (links && links.length > 1) {
      headline.sourceLinks = links;
    }
  }

  // Filter expired content (YouTube/social older than 24hrs)
  const now = Date.now();
  headlines = headlines.filter((h) => {
    if (!h.expiresAt) return true;
    return new Date(h.expiresAt).getTime() > now;
  });

  // Step 5: Fetch OG images for headlines missing images
  console.log("[Pipeline] Step 5: Fetching OG images...");
  const ogImages = await fetchOgImages(headlines);
  for (const headline of headlines) {
    if (!headline.imageUrl) {
      const ogImg = ogImages.get(headline.url);
      if (ogImg) headline.imageUrl = ogImg;
    }
  }
  console.log(`[Pipeline] ${ogImages.size} OG images fetched`);

  // Step 6: Apply manual overrides
  console.log("[Pipeline] Step 6: Applying manual overrides...");
  headlines = applyOverrides(headlines);

  // Build site content
  const breaking = headlines.find((h) => h.style === "breaking") ?? null;
  const topStories = headlines.filter((h) => h.style === "top").slice(0, 3);
  const rest = headlines.filter(
    (h) => h.style !== "breaking" && h.style !== "top"
  );

  const content: SiteContent = {
    breaking,
    topStories,
    headlines: rest,
    lastUpdated: new Date().toISOString(),
  };

  // Step 6: Write to cache
  writeCache(content);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[Pipeline] Complete. ${headlines.length} headlines in ${elapsed}s`
  );

  return content;
}

function applyOverrides(headlines: Headline[]): Headline[] {
  const overridesPath = join(process.cwd(), "content", "headlines.json");
  if (!existsSync(overridesPath)) return headlines;

  try {
    const raw = readFileSync(overridesPath, "utf-8");
    const overrides = JSON.parse(raw) as ManualOverride;

    // Block URLs
    if (overrides.block?.length) {
      const blockSet = new Set(overrides.block);
      headlines = headlines.filter((h) => !blockSet.has(h.url));
    }

    // Force breaking news
    if (overrides.forceBreaking) {
      const fb = overrides.forceBreaking;
      // Remove any existing breaking
      headlines = headlines.map((h) =>
        h.style === "breaking" ? { ...h, style: "major" as const } : h
      );
      // Add forced breaking at position 0
      headlines.unshift({
        id: "forced-breaking",
        text: fb.text,
        url: fb.url,
        source: "manual",
        category: "general",
        style: "breaking",
        position: 0,
        score: 100,
        createdAt: new Date().toISOString(),
      });
    }

    // Inject custom headlines
    if (overrides.inject?.length) {
      for (const injection of overrides.inject) {
        headlines.push({
          id: `injected-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text: injection.text,
          url: injection.url,
          source: "manual",
          category: injection.category,
          style: injection.style,
          position: injection.position,
          score: 100,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Pin headlines to positions
    if (overrides.pin?.length) {
      for (const pin of overrides.pin) {
        const idx = headlines.findIndex((h) => h.id === pin.headlineId);
        if (idx !== -1) {
          headlines[idx] = {
            ...headlines[idx],
            style: pin.style,
            position: pin.position,
          };
        }
      }
    }

    // Re-sort by position
    headlines.sort((a, b) => a.position - b.position);

    return headlines;
  } catch (error) {
    console.error("[Pipeline] Failed to apply overrides:", error);
    return headlines;
  }
}

/**
 * LLM-based semantic clustering. Sends top items to Haiku and asks it to group
 * stories covering the same underlying event — handles cross-lingual duplicates
 * and paraphrases that the keyword approach misses.
 *
 * Falls back to keyword bundling if the LLM call fails.
 */
async function clusterStoriesLLM(items: RawContentItem[]): Promise<{
  bundled: RawContentItem[];
  sourceMap: Map<string, SourceLink[]>;
}> {
  // Only cluster top 50 to bound cost; everything below stays as-is
  const TOP_N = 50;
  const candidates = items.slice(0, TOP_N);
  const tail = items.slice(TOP_N);

  if (candidates.length < 2) {
    return bundleCrossSource(items);
  }

  type ClusterResp = { clusterId: number; memberIndices: number[]; primaryIndex: number };
  let clusters: ClusterResp[] | null = null;

  try {
    const list = candidates
      .map(
        (it, idx) =>
          `[${idx}] source=${it.source} title="${it.title}" topics=[${(it.keyTopics ?? []).join(", ")}] summary="${(it.summary ?? "").slice(0, 200)}"`
      )
      .join("\n");

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Group these news items into clusters where each cluster covers the SAME underlying event. Items in different languages (English / Nepali Devanagari) about the same event MUST cluster together. Paraphrases and different angles of the same event also belong in one cluster.

Most items will be unique (their own cluster of 1). Only group when you're confident it's the same story.

For each cluster pick a "primaryIndex" — the item with the most informative title.

Return ONLY a JSON array (no markdown):
[{"clusterId": 0, "memberIndices": [0], "primaryIndex": 0}, {"clusterId": 1, "memberIndices": [1, 5, 12], "primaryIndex": 5}]

Every index from 0 to ${candidates.length - 1} must appear in exactly one cluster.

Items:
${list}`,
        },
      ],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("not array");
    clusters = parsed as ClusterResp[];
  } catch (error) {
    console.error("[Pipeline] LLM clustering failed, falling back to keyword bundling:", error);
    return bundleCrossSource(items);
  }

  // Validate coverage — every index must appear exactly once
  const seen = new Set<number>();
  for (const c of clusters) {
    for (const m of c.memberIndices) {
      if (m < 0 || m >= candidates.length || seen.has(m)) {
        console.error("[Pipeline] LLM clustering returned invalid coverage, falling back");
        return bundleCrossSource(items);
      }
      seen.add(m);
    }
  }
  if (seen.size !== candidates.length) {
    // Patch: missing items become singletons
    for (let i = 0; i < candidates.length; i++) {
      if (!seen.has(i)) clusters.push({ clusterId: -i - 1, memberIndices: [i], primaryIndex: i });
    }
  }

  const sourceMap = new Map<string, SourceLink[]>();
  const bundled: RawContentItem[] = [];

  for (const cluster of clusters) {
    const members = cluster.memberIndices
      .map((i) => candidates[i])
      .filter(Boolean)
      // Sort by score so highest-scored is first
      .sort((a, b) => (b.newsworthiness ?? 0) - (a.newsworthiness ?? 0));

    if (members.length === 0) continue;

    if (members.length >= 3) {
      // BIG STORY: keep top 3 as cluster
      const clusterId = `cluster-${members[0].id}`;
      for (const m of members.slice(0, 3)) {
        m.clusterId = clusterId;
        bundled.push(m);
        sourceMap.set(m.id, [{ source: m.source, url: m.url, title: m.title }]);
      }
    } else {
      // 1 or 2 members — keep only the primary (highest scored)
      const primary = members[0];
      bundled.push(primary);
      sourceMap.set(primary.id, [
        { source: primary.source, url: primary.url, title: primary.title },
      ]);
    }
  }

  // Append the tail (items beyond TOP_N) as singletons
  for (const item of tail) {
    bundled.push(item);
    sourceMap.set(item.id, [{ source: item.source, url: item.url, title: item.title }]);
  }

  return { bundled, sourceMap };
}

/**
 * Final structural dedup safety net — runs after LLM clustering and editor review.
 * Catches exact-collision misses by grouping on URL host + first 5 normalized words
 * of the English headline. Cheap insurance.
 */
function structuralDedup(headlines: Headline[]): Headline[] {
  const seen = new Map<string, Headline>();
  const out: Headline[] = [];
  for (const h of headlines) {
    let host = "";
    try {
      host = new URL(h.url).hostname;
    } catch {}
    const fingerprint = h.text.en
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5)
      .join(" ");
    const key = `${host}|${fingerprint}`;
    const existing = seen.get(key);
    if (existing) {
      // Keep the higher-scored / earlier-positioned one
      if ((h.score ?? 0) > (existing.score ?? 0)) {
        const idx = out.indexOf(existing);
        if (idx !== -1) out[idx] = h;
        seen.set(key, h);
      }
      continue;
    }
    seen.set(key, h);
    out.push(h);
  }
  return out;
}

function bundleCrossSource(items: RawContentItem[]): {
  bundled: RawContentItem[];
  sourceMap: Map<string, SourceLink[]>;
} {
  const sourceMap = new Map<string, SourceLink[]>();
  const used = new Set<number>();
  const bundled: RawContentItem[] = [];

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;

    const item = items[i];
    const keywords = extractKeywords(item.title);
    const matches: number[] = [];

    // Find similar stories from OTHER sources
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;
      if (items[j].source === item.source) continue;

      const otherKeywords = extractKeywords(items[j].title);
      const overlap = keywords.filter((w) => otherKeywords.includes(w)).length;
      const similarity = overlap / Math.max(keywords.length, 1);

      if (similarity > 0.35) {
        matches.push(j);
      }
    }

    if (matches.length >= 2) {
      // BIG STORY: 3+ sources covering it — keep up to 3 as a cluster
      // Each gets a different headline angle, linked to its own source
      const clusterId = `cluster-${item.id}`;
      const clusterItems = [i, ...matches.slice(0, 2)]; // max 3 items in cluster

      for (const idx of clusterItems) {
        const ci = items[idx];
        ci.clusterId = clusterId;
        bundled.push(ci);
        used.add(idx);
        sourceMap.set(ci.id, [{ source: ci.source, url: ci.url, title: ci.title }]);
      }
      // Mark remaining matches as used (deduped away)
      for (const idx of matches.slice(2)) {
        used.add(idx);
      }
    } else if (matches.length === 1) {
      // 2 sources — just deduplicate, keep the primary (higher scored)
      used.add(matches[0]);
      // Don't inherit images from other articles — they may not match
      bundled.push(item);
      used.add(i);
      sourceMap.set(item.id, [
        { source: item.source, url: item.url, title: item.title },
      ]);
    } else {
      // Unique story
      bundled.push(item);
      used.add(i);
      sourceMap.set(item.id, [
        { source: item.source, url: item.url, title: item.title },
      ]);
    }
  }

  return { bundled, sourceMap };
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or",
    "is", "are", "was", "were", "be", "been", "has", "have", "had",
    "को", "मा", "र", "का", "ले", "छ", "हो", "यो", "भन्ने",
  ]);
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

function emptyContent(): SiteContent {
  return {
    breaking: null,
    topStories: [],
    headlines: [],
    lastUpdated: new Date().toISOString(),
  };
}
