import * as cheerio from "cheerio";
import { v4 as uuid } from "uuid";
import type { RawContentItem, SourceConfig } from "../types";
import { getSourceCategories } from "../sources";

export async function collectScrape(source: SourceConfig): Promise<RawContentItem[]> {
  if (!source.url || !source.selector) return [];

  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "EutaKhabar/1.0 (+https://eutakhabar.com)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`Scrape failed for ${source.id}: HTTP ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const categories = getSourceCategories(source.id);
    const defaultCategory = categories[0] ?? "general";
    const baseUrl = new URL(source.url).origin;

    const items: RawContentItem[] = [];
    const seen = new Set<string>();

    $(source.selector).each((_, el) => {
      const $el = $(el);
      const title = sanitizeText($el.text());
      let href = $el.attr("href") ?? "";

      if (!title || title.length < 10) return;

      if (href.startsWith("/")) {
        href = baseUrl + href;
      }

      const url = sanitizeUrl(href);
      if (!url) return;
      if (seen.has(url)) return;
      seen.add(url);

      // Don't extract inline images from scraping — too unreliable.
      // OG images fetched later from the article URL are much more accurate.
      const imageUrl: string | undefined = undefined;

      // Try to extract date from URL (e.g., /2026/04/ or /2026/03/)
      const urlDate = extractDateFromUrl(url);
      if (urlDate && urlDate < Date.now() - 24 * 60 * 60 * 1000) return; // Skip old articles

      items.push({
        id: uuid(),
        title,
        url,
        source: source.id,
        category: defaultCategory,
        timestamp: urlDate ? new Date(urlDate).toISOString() : new Date().toISOString(),
        engagement: {},
        imageUrl,
      });
    });

    return items.slice(0, 30);
  } catch (error) {
    console.error(`Scrape collect failed for ${source.id}:`, error);
    return [];
  }
}

function sanitizeText(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
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

/** Extract a date from URL patterns like /2026/03/ or /2026/04/05/ */
function extractDateFromUrl(url: string): number | null {
  // Match /YYYY/MM/DD/ or /YYYY/MM/
  const match = url.match(/\/(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?(?:\/|$)/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = match[3] ? parseInt(match[3], 10) : 15; // mid-month default

  if (year < 2020 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(year, month - 1, day).getTime();
}
