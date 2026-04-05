/**
 * Fetches Open Graph images from article URLs.
 * OG images are social preview images that sites explicitly publish for sharing —
 * consistently sized, relevant, and intended for external display.
 */

const OG_CACHE = new Map<string, string | null>();

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
