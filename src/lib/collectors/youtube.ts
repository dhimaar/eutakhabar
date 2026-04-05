import { v4 as uuid } from "uuid";
import type { RawContentItem, SourceConfig } from "../types";
import { getSourceCategories } from "../sources";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

interface YouTubeVideo {
  id: { videoId: string } | string;
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    channelTitle: string;
    thumbnails?: {
      high?: { url: string };
      medium?: { url: string };
    };
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeVideo[];
}

interface YouTubeCaptionTrack {
  id: string;
  snippet: {
    language: string;
    trackKind: string;
  };
}

export async function collectYouTube(source: SourceConfig): Promise<RawContentItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !source.channelId) return [];

  try {
    const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${encodeURIComponent(source.channelId)}&order=date&maxResults=5&type=video&publishedAfter=${getRecentDate()}&key=${apiKey}`;

    const searchRes = await fetch(searchUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!searchRes.ok) return [];

    const searchData = (await searchRes.json()) as YouTubeSearchResponse;
    const videos = searchData.items ?? [];
    if (videos.length === 0) return [];

    const videoIds = videos
      .map((v) => (typeof v.id === "string" ? v.id : v.id.videoId))
      .join(",");

    const statsUrl = `${YOUTUBE_API_BASE}/videos?part=statistics&id=${videoIds}&key=${apiKey}`;
    const statsRes = await fetch(statsUrl, {
      signal: AbortSignal.timeout(10000),
    });
    const statsData = statsRes.ok
      ? ((await statsRes.json()) as { items?: YouTubeVideo[] })
      : { items: [] };

    const statsMap = new Map<string, YouTubeVideo["statistics"]>();
    for (const item of statsData.items ?? []) {
      const id = typeof item.id === "string" ? item.id : item.id.videoId;
      statsMap.set(id, item.statistics);
    }

    const categories = getSourceCategories(source.id);
    const defaultCategory = categories[0] ?? "general";

    const items: RawContentItem[] = [];

    for (const video of videos) {
      const videoId = typeof video.id === "string" ? video.id : video.id.videoId;
      const stats = statsMap.get(videoId);

      const transcript = await fetchCaptions(videoId, apiKey);

      // Set 12hr expiry for YouTube content
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

      items.push({
        id: uuid(),
        title: video.snippet.title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        source: source.id,
        category: defaultCategory,
        timestamp: video.snippet.publishedAt,
        expiresAt,
        engagement: {
          views: stats?.viewCount ? parseInt(stats.viewCount, 10) : undefined,
          likes: stats?.likeCount ? parseInt(stats.likeCount, 10) : undefined,
          comments: stats?.commentCount
            ? parseInt(stats.commentCount, 10)
            : undefined,
        },
        summary: video.snippet.description.slice(0, 500),
        transcript: transcript ?? undefined,
        imageUrl:
          video.snippet.thumbnails?.high?.url ??
          video.snippet.thumbnails?.medium?.url,
      });
    }

    return items;
  } catch (error) {
    console.error(`YouTube collect failed for ${source.id}:`, error);
    return [];
  }
}

async function fetchCaptions(
  videoId: string,
  apiKey: string
): Promise<string | null> {
  try {
    const captionsUrl = `${YOUTUBE_API_BASE}/captions?part=snippet&videoId=${videoId}&key=${apiKey}`;
    const res = await fetch(captionsUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { items?: YouTubeCaptionTrack[] };
    const tracks = data.items ?? [];

    const track =
      tracks.find(
        (t) => t.snippet.language === "ne" || t.snippet.language === "en"
      ) ?? tracks[0];

    if (!track) return null;

    // Note: Downloading caption content requires OAuth2 authentication.
    // For MVP, we rely on title + description + summary from the search API.
    // The caption track ID is available for future enhancement with OAuth.
    return null;
  } catch {
    return null;
  }
}

function getRecentDate(): string {
  const date = new Date();
  // Only fetch videos from last 24 hours
  date.setHours(date.getHours() - 24);
  return date.toISOString();
}
