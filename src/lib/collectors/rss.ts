import Parser from "rss-parser";
import { v4 as uuid } from "uuid";
import type { RawContentItem, SourceConfig } from "../types";
import { getSourceCategories } from "../sources";

type CustomFeed = Record<string, never>;
type CustomItem = {
  "media:content"?: { $?: { url?: string } };
  "media:thumbnail"?: { $?: { url?: string } };
  enclosure?: { url?: string };
};

const parser = new Parser<CustomFeed, CustomItem>({
  timeout: 10000,
  headers: {
    "User-Agent": "EutaKhabar/1.0 (+https://eutakhabar.com)",
  },
  customFields: {
    item: [["media:content", "media:content"], ["media:thumbnail", "media:thumbnail"]],
  },
});

export async function collectRSS(source: SourceConfig): Promise<RawContentItem[]> {
  if (!source.url) return [];

  try {
    const feed = await parser.parseURL(source.url);
    const categories = getSourceCategories(source.id);
    const defaultCategory = categories[0] ?? "general";

    // NepalCheck and similar fact-checking sources: always include
    const alwaysInclude = source.id === "nepalcheck";

    return (feed.items ?? []).slice(0, 30).map((item) => ({
      id: uuid(),
      title: sanitizeText(item.title ?? ""),
      url: sanitizeUrl(item.link ?? ""),
      source: source.id,
      category: defaultCategory,
      timestamp: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
      engagement: {},
      summary: sanitizeText(item.contentSnippet?.slice(0, 500) ?? ""),
      imageUrl: extractImage(item),
      alwaysInclude,
    })).filter((item) => item.title && item.url);
  } catch (error) {
    console.error(`RSS collect failed for ${source.id}:`, error);
    return [];
  }
}

function extractImage(item: CustomItem & { enclosure?: { url?: string }; content?: string }): string | undefined {
  // Try media:content first
  const mediaUrl = item["media:content"]?.$?.url;
  if (mediaUrl && isArticleImage(mediaUrl)) return sanitizeUrl(mediaUrl) || undefined;

  // Try media:thumbnail
  const thumbUrl = item["media:thumbnail"]?.$?.url;
  if (thumbUrl && isArticleImage(thumbUrl)) return sanitizeUrl(thumbUrl) || undefined;

  // Try enclosure
  if (item.enclosure?.url && isArticleImage(item.enclosure.url)) return sanitizeUrl(item.enclosure.url) || undefined;

  // Try extracting from content HTML
  if (item.content) {
    const imgMatch = (item.content as string).match(/<img[^>]+src=["']([^"']+)["']/);
    if (imgMatch?.[1] && isArticleImage(imgMatch[1])) return sanitizeUrl(imgMatch[1]) || undefined;
  }

  return undefined;
}

function isArticleImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes("favicon") || lower.includes("bookmark") || lower.includes("logo")
    || lower.includes("icon") || lower.includes("brand") || lower.includes("fb-img")
    || lower.includes("site-image") || lower.includes("og-default")
    || lower.endsWith(".ico") || lower.endsWith(".svg")) return false;
  return true;
}

function sanitizeText(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    return parsed.href;
  } catch {
    return "";
  }
}
