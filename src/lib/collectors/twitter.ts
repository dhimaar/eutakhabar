import { v4 as uuid } from "uuid";
import type { RawContentItem, SourceConfig } from "../types";
import { getSourceCategories } from "../sources";

// Balen Shah (PM) — always include his original posts
const ALWAYS_INCLUDE_HANDLES = ["shahbalen"];

interface Tweet {
  id: string;
  text: string;
  created_at?: string;
  referenced_tweets?: { type: string; id: string }[];
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    impression_count?: number;
  };
  author_id?: string;
}

interface TwitterUserTimelineResponse {
  data?: Tweet[];
}

interface TwitterSearchResponse {
  data?: Tweet[];
  meta?: { result_count: number };
}

export async function collectTwitter(source: SourceConfig): Promise<RawContentItem[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken || !source.handle) return [];

  const handle = source.handle.replace(/^@/, "");
  const categories = getSourceCategories(source.id);
  const defaultCategory = categories[0] ?? "general";
  const alwaysInclude = ALWAYS_INCLUDE_HANDLES.includes(handle.toLowerCase());

  try {
    // Get user ID from handle
    const userRes = await fetch(
      `https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}`,
      {
        headers: { Authorization: `Bearer ${bearerToken}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!userRes.ok) return [];

    const userData = (await userRes.json()) as { data?: { id: string } };
    const userId = userData.data?.id;
    if (!userId) return [];

    // Get recent tweets — exclude retweets, only last 6 hours
    const sinceTime = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const tweetsRes = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics,referenced_tweets&exclude=retweets&start_time=${sinceTime}`,
      {
        headers: { Authorization: `Bearer ${bearerToken}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!tweetsRes.ok) return [];

    const tweetsData = (await tweetsRes.json()) as TwitterUserTimelineResponse;
    const tweets = tweetsData.data ?? [];

    // Filter: skip replies (keep only original tweets)
    const originalTweets = tweets.filter((t) => {
      if (!t.referenced_tweets) return true;
      return !t.referenced_tweets.some((ref) => ref.type === "replied_to");
    });

    return originalTweets.map((tweet) => ({
      id: uuid(),
      title: truncateText(tweet.text, 280),
      url: `https://x.com/${handle}/status/${tweet.id}`,
      source: source.id,
      category: defaultCategory,
      timestamp: tweet.created_at ?? new Date().toISOString(),
      engagement: {
        likes: tweet.public_metrics?.like_count,
        shares: (tweet.public_metrics?.retweet_count ?? 0) +
          (tweet.public_metrics?.quote_count ?? 0),
        comments: tweet.public_metrics?.reply_count,
        views: tweet.public_metrics?.impression_count,
      },
      summary: tweet.text,
      alwaysInclude,
    }));
  } catch (error) {
    console.error(`Twitter collect failed for ${source.id}:`, error);
    return [];
  }
}

export async function searchTwitter(query: string): Promise<RawContentItem[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) return [];

  try {
    const res = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=10&tweet.fields=created_at,public_metrics,author_id`,
      {
        headers: { Authorization: `Bearer ${bearerToken}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return [];

    const data = (await res.json()) as TwitterSearchResponse;
    const tweets = data.data ?? [];

    return tweets.map((tweet) => ({
      id: uuid(),
      title: truncateText(tweet.text, 280),
      url: `https://x.com/i/status/${tweet.id}`,
      source: "twitter_search",
      category: "general" as const,
      timestamp: tweet.created_at ?? new Date().toISOString(),
      engagement: {
        likes: tweet.public_metrics?.like_count,
        shares: (tweet.public_metrics?.retweet_count ?? 0) +
          (tweet.public_metrics?.quote_count ?? 0),
        comments: tweet.public_metrics?.reply_count,
        views: tweet.public_metrics?.impression_count,
      },
      summary: tweet.text,
    }));
  } catch (error) {
    console.error("Twitter search failed:", error);
    return [];
  }
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
