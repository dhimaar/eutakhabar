/**
 * Fetches Open Graph images from article URLs.
 * OG images are social preview images that sites explicitly publish for sharing —
 * consistently sized, relevant, and intended for external display.
 */

const OG_CACHE = new Map<string, string | null>();
const META_CACHE = new Map<string, ArticleMeta>();

export interface ArticleMeta {
  imageUrl: string | null;
  publishedAt: number | null; // unix ms
  isOpinion: boolean;
}

const OPINION_URL_PATTERNS = /\/(opinion|opinions|views|view|editorial|editorials|blog|blogs|column|columns|commentary|perspective|perspectives|analysis)\//i;

function detectOpinion(url: string, html: string): boolean {
  if (OPINION_URL_PATTERNS.test(url)) return true;

  // schema.org OpinionNewsArticle
  if (/"@type"\s*:\s*"OpinionNewsArticle"/i.test(html)) return true;

  // article:section meta
  const sectionMatch = html.match(/<meta[^>]+property=["']article:section["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:section["']/i);
  if (sectionMatch?.[1]) {
    const section = sectionMatch[1].toLowerCase();
    if (/(opinion|editorial|view|blog|column|commentary|perspective)/i.test(section)) return true;
  }

  return false;
}

/**
 * Single fetch that extracts both OG image and article published time.
 * Use this when you need both — avoids fetching the article twice.
 */
export async function fetchArticleMeta(url: string): Promise<ArticleMeta> {
  const cached = META_CACHE.get(url);
  if (cached) return cached;

  const empty: ArticleMeta = { imageUrl: null, publishedAt: null, isOpinion: false };

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "EutaKhabar/1.0 (+https://eutakhabar.com)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });

    if (!res.ok) {
      META_CACHE.set(url, empty);
      return empty;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      META_CACHE.set(url, empty);
      return empty;
    }

    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 50000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }
    reader.cancel().catch(() => {});

    // Extract og:image
    let imageUrl: string | null = null;
    const ogImg = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    ) ?? html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
    );
    if (ogImg?.[1]) {
      const resolved = resolveUrl(ogImg[1], url);
      if (resolved && isValidImageUrl(resolved)) imageUrl = resolved;
    }
    if (!imageUrl) {
      const tw = html.match(
        /<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
      ) ?? html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i
      );
      if (tw?.[1]) {
        const resolved = resolveUrl(tw[1], url);
        if (resolved && isValidImageUrl(resolved)) imageUrl = resolved;
      }
    }

    // Extract published time — try multiple common patterns
    let publishedAt: number | null = null;
    const patterns: RegExp[] = [
      /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
      /<meta[^>]+name=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']publishdate["'][^>]+content=["']([^"']+)["']/i,
      /<time[^>]+datetime=["']([^"']+)["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) {
        const t = Date.parse(m[1]);
        if (!isNaN(t)) {
          publishedAt = t;
          break;
        }
      }
    }

    const meta: ArticleMeta = { imageUrl, publishedAt, isOpinion: detectOpinion(url, html) };
    META_CACHE.set(url, meta);
    if (imageUrl) OG_CACHE.set(url, imageUrl);
    return meta;
  } catch {
    META_CACHE.set(url, empty);
    return empty;
  }
}

/**
 * Batch-fetch article metadata (image + published time) for multiple URLs.
 */
export async function fetchArticleMetaBatch(
  urls: string[]
): Promise<Map<string, ArticleMeta>> {
  const results = new Map<string, ArticleMeta>();
  const CONCURRENCY = 10;
  const unique = Array.from(new Set(urls.filter(Boolean)));

  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (u) => {
      const meta = await fetchArticleMeta(u);
      results.set(u, meta);
    });
    await Promise.allSettled(promises);
  }

  return results;
}

export async function fetchOgImage(url: string): Promise<string | null> {
  if (OG_CACHE.has(url)) return OG_CACHE.get(url) ?? null;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "EutaKhabar/1.0 (+https://eutakhabar.com)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });

    if (!res.ok) {
      OG_CACHE.set(url, null);
      return null;
    }

    // Only read first 50KB — OG tags are always in <head>
    const reader = res.body?.getReader();
    if (!reader) return null;

    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 50000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      // Stop once we've passed </head>
      if (html.includes("</head>")) break;
    }
    reader.cancel().catch(() => {});

    // Extract og:image
    const ogMatch = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    ) ?? html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
    );

    if (ogMatch?.[1]) {
      const imgUrl = resolveUrl(ogMatch[1], url);
      if (imgUrl && isValidImageUrl(imgUrl)) {
        OG_CACHE.set(url, imgUrl);
        return imgUrl;
      }
    }

    // Fallback: twitter:image
    const twMatch = html.match(
      /<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
    ) ?? html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i
    );

    if (twMatch?.[1]) {
      const imgUrl = resolveUrl(twMatch[1], url);
      if (imgUrl && isValidImageUrl(imgUrl)) {
        OG_CACHE.set(url, imgUrl);
        return imgUrl;
      }
    }

    OG_CACHE.set(url, null);
    return null;
  } catch {
    OG_CACHE.set(url, null);
    return null;
  }
}

/**
 * Batch fetch OG images for multiple items. Runs in parallel with concurrency limit.
 */
export async function fetchOgImages(
  items: { url: string; imageUrl?: string }[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const CONCURRENCY = 10;

  // Only fetch for items that don't already have an image
  const needsFetch = items.filter((i) => !i.imageUrl && i.url);

  for (let i = 0; i < needsFetch.length; i += CONCURRENCY) {
    const batch = needsFetch.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (item) => {
      const img = await fetchOgImage(item.url);
      if (img) results.set(item.url, img);
    });
    await Promise.allSettled(promises);
  }

  return results;
}

function resolveUrl(imgUrl: string, pageUrl: string): string | null {
  try {
    if (imgUrl.startsWith("//")) {
      return `https:${imgUrl}`;
    }
    if (imgUrl.startsWith("/")) {
      const base = new URL(pageUrl);
      return `${base.origin}${imgUrl}`;
    }
    const parsed = new URL(imgUrl);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const path = parsed.pathname.toLowerCase();
    // Reject placeholders, defaults, tiny images
    if (path.includes("placeholder") || path.includes("default") || path.includes("1x1")) return false;
    // Reject favicons, bookmarks, logos, icons — these are site branding, not article images
    if (path.includes("favicon") || path.includes("bookmark") || path.includes("logo")
      || path.includes("icon") || path.includes("brand") || path.includes("fb-img")
      || path.includes("site-image") || path.includes("og-default")) return false;
    // Reject tiny image file extensions that are likely icons
    if (path.endsWith(".ico") || path.endsWith(".svg")) return false;
    return true;
  } catch {
    return false;
  }
}
