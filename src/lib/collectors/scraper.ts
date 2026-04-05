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

      // Try to find an associated image (sibling or parent img)
      const $parent = $el.closest("article, .card, .post, .news-item, div");
      const imgSrc = $parent.find("img").first().attr("src") ??
                     $parent.find("img").first().attr("data-src");
      let imageUrl: string | undefined;
      if (imgSrc && isArticleImage(imgSrc)) {
        const fullImg = imgSrc.startsWith("/") ? baseUrl + imgSrc : imgSrc;
        imageUrl = sanitizeUrl(fullImg) || undefined;
      }

      items.push({
        id: uuid(),
        title,
        url,
        source: source.id,
        category: defaultCategory,
        timestamp: new Date().toISOString(),
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

function isArticleImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes("favicon") || lower.includes("bookmark") || lower.includes("logo")
    || lower.includes("icon") || lower.includes("brand") || lower.includes("fb-img")
    || lower.includes("site-image") || lower.includes("/themes/")
    || lower.includes("nagariknews") || lower.includes("republicajscss")
    || lower.endsWith(".ico") || lower.endsWith(".svg")) return false;
  return true;
}
