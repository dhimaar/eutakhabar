import { v4 as uuid } from "uuid";
import type { RawContentItem, SourceConfig } from "../types";
import { getSourceCategories } from "../sources";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

interface PlaylistItem {
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    channelTitle: string;
    resourceId: { videoId: string };
    thumbnails?: {
      high?: { url: string };
      medium?: { url: string };
    };
  };
}

interface PlaylistResponse {
  items?: PlaylistItem[];
}

interface VideoStats {
  id: string;
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
}

export async function collectYouTube(source: SourceConfig): Promise<RawContentItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !source.channelId) return [];

  try {
    // Use playlistItems.list (1 quota unit) instead of search.list (100 units)
    // Uploads playlist ID = "UU" + channelId without "UC" prefix
    const uploadsPlaylistId = "UU" + source.channelId.slice(2);
    const listUrl = `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=5&key=${apiKey}`;

    const listRes = await fetch(listUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!listRes.ok) {
      console.error(`YouTube API error for ${source.id}: ${listRes.status}`);
      return [];
    }

    const listData = (await listRes.json()) as PlaylistResponse;
    const items = listData.items ?? [];
    if (items.length === 0) return [];

    // Filter to last 24 hours only
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentItems = items.filter(
      (item) => new Date(item.snippet.publishedAt) > cutoff
    );
    if (recentItems.length === 0) return [];

    // Fetch stats (1 unit per call)
    const videoIds = recentItems.map((v) => v.snippet.resourceId.videoId).join(",");
    const statsUrl = `${YOUTUBE_API_BASE}/videos?part=statistics&id=${videoIds}&key=${apiKey}`;
    const statsRes = await fetch(statsUrl, {
      signal: AbortSignal.timeout(10000),
    });
    const statsData = statsRes.ok
      ? ((await statsRes.json()) as { items?: VideoStats[] })
      : { items: [] };

    const statsMap = new Map<string, VideoStats["statistics"]>();
    for (const item of statsData.items ?? []) {
      statsMap.set(item.id, item.statistics);
    }

    const categories = getSourceCategories(source.id);
    const defaultCategory = categories[0] ?? "general";

    const results: RawContentItem[] = [];

    for (const item of recentItems) {
      const videoId = item.snippet.resourceId.videoId;
      const stats = statsMap.get(videoId);

      // Set 12hr expiry for YouTube content
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

      results.push({
        id: uuid(),
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        source: source.id,
        category: defaultCategory,
        timestamp: item.snippet.publishedAt,
        expiresAt,
        engagement: {
          views: stats?.viewCount ? parseInt(stats.viewCount, 10) : undefined,
          likes: stats?.likeCount ? parseInt(stats.likeCount, 10) : undefined,
          comments: stats?.commentCount ? parseInt(stats.commentCount, 10) : undefined,
        },
        summary: item.snippet.description.slice(0, 500),
        imageUrl:
          item.snippet.thumbnails?.high?.url ??
          item.snippet.thumbnails?.medium?.url,
      });
    }

    console.log(`[YouTube] ${source.id}: ${results.length} recent videos`);
    return results;
  } catch (error) {
    console.error(`YouTube collect failed for ${source.id}:`, error);
    return [];
  }
}
