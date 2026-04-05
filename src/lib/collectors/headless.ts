import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import { v4 as uuid } from "uuid";
import type { RawContentItem, SourceConfig } from "../types";
import { getSourceCategories } from "../sources";

export async function collectHeadless(source: SourceConfig): Promise<RawContentItem[]> {
  if (!source.url || !source.selector) return [];

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(source.url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait a moment for any Cloudflare challenge to resolve
    await page.waitForSelector(source.selector, { timeout: 15000 }).catch(() => {});

    const html = await page.content();
    await browser.close();
    browser = undefined;

    // Parse with cheerio — same logic as regular scraper
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

      // Try to find an associated image
      const $parent = $el.closest("article, .card, .post, .news-item, div");
      const imgSrc = $parent.find("img").first().attr("src") ??
                     $parent.find("img").first().attr("data-src");
      let imageUrl: string | undefined;
      if (imgSrc) {
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

    console.log(`[Headless] ${source.id}: ${items.length} items collected`);
    return items.slice(0, 30);
  } catch (error) {
    console.error(`Headless collect failed for ${source.id}:`, error);
    if (browser) await browser.close();
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
