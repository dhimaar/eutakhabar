import { v4 as uuid } from "uuid";
import type { RawContentItem, SourceConfig } from "../types";
import { getSourceCategories } from "../sources";

interface TikTokOEmbedResponse {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url?: string;
}

export async function collectTikTok(source: SourceConfig): Promise<RawContentItem[]> {
  if (!source.handle) return [];

  // TikTok has no free search/timeline API.
  // This collector works with manually configured video URLs in sources.json
  // via the `url` field, or returns empty for handle-only sources.
  // Future: integrate TikTok Research API if approved.

  if (source.url) {
    const item = await fetchTikTokEmbed(source.url, source);
    return item ? [item] : [];
  }

  return [];
}

export async function fetchTikTokEmbed(
  videoUrl: string,
  source: SourceConfig
): Promise<RawContentItem | null> {
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as TikTokOEmbedResponse;
    const categories = getSourceCategories(source.id);

    return {
      id: uuid(),
      title: data.title || `TikTok by ${data.author_name}`,
      url: videoUrl,
      source: source.id,
      category: categories[0] ?? "general",
      timestamp: new Date().toISOString(),
      engagement: {},
      summary: data.title,
      imageUrl: data.thumbnail_url,
    };
  } catch (error) {
    console.error(`TikTok embed fetch failed for ${videoUrl}:`, error);
    return null;
  }
}
