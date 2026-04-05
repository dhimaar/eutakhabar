import { getSources } from "../sources";
import type { RawContentItem } from "../types";
import { collectRSS } from "./rss";
import { collectScrape } from "./scraper";
import { collectYouTube } from "./youtube";
import { collectTwitter } from "./twitter";
import { collectTikTok } from "./tiktok";
import { collectHeadless } from "./headless";

export async function collectAll(): Promise<RawContentItem[]> {
  const sources = getSources();

  const collectors = sources.map((source) => {
    switch (source.type) {
      case "rss":
        return collectRSS(source);
      case "scrape":
        return collectScrape(source);
      case "scrape-headless":
        return collectHeadless(source);
      case "youtube":
        return collectYouTube(source);
      case "twitter":
        return collectTwitter(source);
      case "tiktok":
        return collectTikTok(source);
      default:
        return Promise.resolve([] as RawContentItem[]);
    }
  });

  const results = await Promise.allSettled(collectors);

  const allItems: RawContentItem[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
    }
  }

  // Cap per source to prevent any single source from flooding
  const MAX_PER_SOURCE = 15;
  const bySource = new Map<string, RawContentItem[]>();
  for (const item of allItems) {
    const list = bySource.get(item.source) ?? [];
    list.push(item);
    bySource.set(item.source, list);
  }

  const capped: RawContentItem[] = [];
  for (const [, items] of bySource) {
    capped.push(...items.slice(0, MAX_PER_SOURCE));
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return capped.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}
