import { collectAll } from "./collectors";
import { analyzeContent } from "./analyzer";
import { scoreItems } from "./scoring";
import { generateHeadlines } from "./generator";
import { readCache, readCacheWithFallback, writeCache } from "./cache";
import { clearSourceCache } from "./sources";
import { fetchOgImages } from "./og-image";
import { fetchLedes } from "./article-fetcher";
import type { SiteContent, Headline, ManualOverride, RawContentItem, SourceLink } from "./types";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function runPipeline(): Promise<SiteContent> {
  console.log("[Pipeline] Starting refresh cycle...");
  const startTime = Date.now();

  // Clear cached source config to pick up any changes
  clearSourceCache();

  // Step 1: Collect from all sources
  console.log("[Pipeline] Step 1: Collecting content...");
  const rawItems = await collectAll();
  console.log(`[Pipeline] Collected ${rawItems.length} items`);

  if (rawItems.length === 0) {
    console.log("[Pipeline] No items collected, returning cached content");
    return readCache() ?? emptyContent();
  }

  // Step 2: Analyze (Claude pass 1 — transcripts, newsworthiness)
  console.log("[Pipeline] Step 2: Analyzing content...");
  const analyzedItems = await analyzeContent(rawItems);
  console.log(`[Pipeline] ${analyzedItems.length} items after analysis`);

  // Step 3: Score and rank
  console.log("[Pipeline] Step 3: Scoring items...");
  const scoredItems = scoreItems(analyzedItems);

  // Step 3.5: Bundle cross-source stories
  console.log("[Pipeline] Step 3.5: Bundling cross-source stories...");
  const { bundled, sourceMap } = bundleCrossSource(scoredItems);
  console.log(`[Pipeline] ${bundled.length} unique stories (${scoredItems.length - bundled.length} duplicates merged)`);

  // Step 3.75: Fetch article ledes for items missing summaries
  console.log("[Pipeline] Step 3.75: Fetching article ledes...");
  const ledes = await fetchLedes(bundled);
  for (const item of bundled) {
    if ((!item.summary || item.summary === "N/A") && ledes.has(item.url)) {
      item.summary = ledes.get(item.url)!;
    }
  }
  console.log(`[Pipeline] ${ledes.size} article ledes fetched`);

  // Load previous top stories for editorial continuity
  const previousContent = readCache() ?? await readCacheWithFallback();
  const previousTopStories = previousContent?.topStories ?? [];

  // Step 4: Generate headlines (Claude pass 2 — rewrite)
  console.log("[Pipeline] Step 4: Generating headlines...");
  let headlines = await generateHeadlines(bundled, previousTopStories);

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

  // Step 7: Write to cache (GCS + local)
  await writeCache(content);

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
    const matches: { idx: number; similarity: number; hasDifferentAngle: boolean }[] = [];

    // Find similar stories from OTHER sources
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;
      if (items[j].source === item.source) continue;

      const otherKeywords = extractKeywords(items[j].title);
      const overlap = keywords.filter((w) => otherKeywords.includes(w)).length;
      const similarity = overlap / Math.max(keywords.length, 1);

      if (similarity > 0.3) {
        // Check if the other source has a different angle (different lede/summary)
        const hasDifferentAngle = hasDifferentPerspective(item, items[j]);
        matches.push({ idx: j, similarity, hasDifferentAngle });
      }
    }

    if (matches.length >= 2) {
      // BIG STORY: 3+ sources covering it
      // Only cluster items with genuinely different angles
      const differentAngles = matches.filter((m) => m.hasDifferentAngle);

      if (differentAngles.length >= 1) {
        // Cluster: primary + up to 2 items with different perspectives
        const clusterId = `cluster-${item.id}`;
        item.clusterId = clusterId;
        bundled.push(item);
        used.add(i);
        sourceMap.set(item.id, [{ source: item.source, url: item.url, title: item.title }]);

        for (const m of differentAngles.slice(0, 2)) {
          const ci = items[m.idx];
          ci.clusterId = clusterId;
          bundled.push(ci);
          used.add(m.idx);
          sourceMap.set(ci.id, [{ source: ci.source, url: ci.url, title: ci.title }]);
        }
      } else {
        // Same angle everywhere — just deduplicate, keep the primary
        bundled.push(item);
        used.add(i);
        sourceMap.set(item.id, [{ source: item.source, url: item.url, title: item.title }]);
      }

      // Mark all remaining matches as used (deduped)
      for (const m of matches) {
        if (!used.has(m.idx)) {
          if (!item.imageUrl && items[m.idx].imageUrl) {
            item.imageUrl = items[m.idx].imageUrl;
          }
          used.add(m.idx);
        }
      }
    } else if (matches.length === 1) {
      // 2 sources — deduplicate, keep the primary
      const m = matches[0];
      used.add(m.idx);
      if (!item.imageUrl && items[m.idx].imageUrl) {
        item.imageUrl = items[m.idx].imageUrl;
      }
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

/**
 * Check if two items covering the same story have genuinely different perspectives.
 * Compares summaries/ledes — if they're substantially different, it's a different angle.
 */
function hasDifferentPerspective(a: RawContentItem, b: RawContentItem): boolean {
  const sumA = a.summary ?? a.title;
  const sumB = b.summary ?? b.title;

  // If either has no real summary, can't determine different angle
  if (!a.summary || a.summary === "N/A" || !b.summary || b.summary === "N/A") return false;

  // Compare summary keywords — if less than 50% overlap, it's a different angle
  const kwA = extractKeywords(sumA);
  const kwB = extractKeywords(sumB);
  if (kwA.length < 3 || kwB.length < 3) return false;

  const overlap = kwA.filter((w) => kwB.includes(w)).length;
  const overlapRatio = overlap / Math.min(kwA.length, kwB.length);

  // Less than 50% keyword overlap in ledes = different perspective
  return overlapRatio < 0.5;
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
