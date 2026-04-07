/**
 * Fetches and extracts the main body text of a news article.
 * Used for full-body headline rewriting on top stories only.
 */
import * as cheerio from "cheerio";

const BODY_CACHE = new Map<string, string | null>();

const BODY_SELECTORS = [
  "article",
  "[itemprop='articleBody']",
  ".article-content",
  ".article-body",
  ".news-content",
  ".entry-content",
  ".post-content",
  ".story-content",
  ".content-body",
  "main",
];

const STRIP_SELECTORS = [
  "script", "style", "noscript", "iframe", "form",
  "nav", "header", "footer", "aside",
  ".ad", ".ads", ".advertisement", ".related", ".related-articles",
  ".share", ".social", ".comments", ".sidebar", ".breadcrumb",
  ".tags", ".author-bio", ".newsletter",
];

export async function fetchArticleBody(url: string): Promise<string | null> {
  if (BODY_CACHE.has(url)) return BODY_CACHE.get(url) ?? null;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "EutaKhabar/1.0 (+https://eutakhabar.com)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    if (!res.ok) {
      BODY_CACHE.set(url, null);
      return null;
    }

    // Cap at 1MB to avoid surprises
    const reader = res.body?.getReader();
    if (!reader) {
      BODY_CACHE.set(url, null);
      return null;
    }
    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 1_000_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});

    const $ = cheerio.load(html);
    for (const sel of STRIP_SELECTORS) $(sel).remove();

    let text = "";
    for (const sel of BODY_SELECTORS) {
      const el = $(sel).first();
      if (el.length) {
        text = el.text();
        if (text.trim().length > 200) break;
      }
    }

    if (!text || text.trim().length < 200) {
      // Fallback: schema.org articleBody from JSON-LD
      const ld = html.match(/"articleBody"\s*:\s*"([^"]+)"/);
      if (ld?.[1]) text = ld[1].replace(/\\n/g, " ").replace(/\\"/g, '"');
    }

    if (!text || text.trim().length < 200) {
      BODY_CACHE.set(url, null);
      return null;
    }

    // Normalize whitespace and truncate to ~800 words
    const cleaned = text.replace(/\s+/g, " ").trim();
    const words = cleaned.split(" ").slice(0, 800).join(" ");
    BODY_CACHE.set(url, words);
    return words;
  } catch {
    BODY_CACHE.set(url, null);
    return null;
  }
}

export async function fetchArticleBodies(urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const CONCURRENCY = 5;
  const unique = Array.from(new Set(urls.filter(Boolean)));
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (u) => ({ url: u, body: await fetchArticleBody(u) }))
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.body) out.set(r.value.url, r.value.body);
    }
  }
  return out;
}
