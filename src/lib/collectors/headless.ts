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
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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

      // Don't extract inline images — too unreliable.
      // OG images fetched later from the article URL are more accurate.
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

/** Extract a date from URL patterns like /2026/03/ or /2026/04/05/ */
function extractDateFromUrl(url: string): number | null {
  const match = url.match(/\/(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?(?:\/|$)/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = match[3] ? parseInt(match[3], 10) : 15;

  if (year < 2020 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(year, month - 1, day).getTime();
}
