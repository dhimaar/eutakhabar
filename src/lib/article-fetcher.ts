/**
 * Fetches the first paragraph (lede) from article URLs.
 * Gives Claude real context to write sensational headlines.
 */

const LEDE_CACHE = new Map<string, string | null>();

// Sites where content is JS-rendered or behind paywall — skip
const SKIP_DOMAINS = ["youtube.com", "x.com", "twitter.com", "tiktok.com"];

export async function fetchLede(url: string): Promise<string | null> {
  if (LEDE_CACHE.has(url)) return LEDE_CACHE.get(url) ?? null;

  try {
    const host = new URL(url).hostname;
    if (SKIP_DOMAINS.some((d) => host.includes(d))) {
      LEDE_CACHE.set(url, null);
      return null;
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent": "EutaKhabar/1.0 (+https://eutakhabar.com)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });

    if (!res.ok) {
      LEDE_CACHE.set(url, null);
      return null;
    }

    // Read first 100KB — article lede is always near the top
    const reader = res.body?.getReader();
    if (!reader) return null;

    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 100000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});

    // Extract first meaningful paragraph
    const lede = extractFirstParagraph(html);
    LEDE_CACHE.set(url, lede);
    return lede;
  } catch {
    LEDE_CACHE.set(url, null);
    return null;
  }
}

/**
 * Batch fetch ledes for multiple items.
 */
export async function fetchLedes(
  items: { url: string; summary?: string }[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const CONCURRENCY = 10;

  // Only fetch for items without a summary already
  const needsFetch = items.filter((i) => (!i.summary || i.summary === "N/A") && i.url);

  for (let i = 0; i < needsFetch.length; i += CONCURRENCY) {
    const batch = needsFetch.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (item) => {
      const lede = await fetchLede(item.url);
      if (lede) results.set(item.url, lede);
    });
    await Promise.allSettled(promises);
  }

  return results;
}

function extractFirstParagraph(html: string): string | null {
  // Try <article> first, then <main>, then body
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const searchIn = articleMatch?.[1] ?? html;

  // Find first <p> with meaningful text (>50 chars, not navigation/meta)
  const pTags = searchIn.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);

  for (const match of pTags) {
    const text = stripHtml(match[1]).trim();
    // Skip short fragments, dates, bylines, navigation text
    if (text.length < 50) continue;
    if (text.match(/^(published|updated|written by|photo|image|advertisement)/i)) continue;
    // Return first 500 chars of the paragraph
    return text.slice(0, 500);
  }

  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
