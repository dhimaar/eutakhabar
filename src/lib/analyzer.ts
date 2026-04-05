import Anthropic from "@anthropic-ai/sdk";
import type { RawContentItem, AnalysisResult } from "./types";

const anthropic = new Anthropic();

export async function analyzeContent(
  items: RawContentItem[]
): Promise<RawContentItem[]> {
  // Social sources (YouTube, X) ALWAYS go through editorial analysis
  // so Claude decides if they're newsworthy enough to include.
  // News sources with transcripts or long summaries also get analyzed.
  const socialSources = new Set(
    items.filter((i) => i.source.startsWith("yt_") || i.source.startsWith("x_") || i.source === "twitter_search")
      .map((i) => i.source)
  );

  const needsAnalysis = items.filter(
    (item) =>
      socialSources.has(item.source) ||
      item.transcript ||
      (item.summary && item.summary.length > 200)
  );
  const noAnalysis = items.filter(
    (item) =>
      !socialSources.has(item.source) &&
      !item.transcript &&
      (!item.summary || item.summary.length <= 200)
  );

  if (needsAnalysis.length === 0) return items;

  // Batch analyze in groups of 10 to stay within token limits
  const batchSize = 10;
  const analyzed: RawContentItem[] = [...noAnalysis];

  for (let i = 0; i < needsAnalysis.length; i += batchSize) {
    const batch = needsAnalysis.slice(i, i + batchSize);
    const results = await analyzeBatch(batch);

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const result = results[j];

      if (result && result.newsworthiness >= 7) {
        analyzed.push({
          ...item,
          summary: result.summary,
          newsworthiness: result.newsworthiness,
          category: result.category,
        });
      }
      // Items scoring < 7 are dropped
    }
  }

  return analyzed;
}

async function analyzeBatch(
  items: RawContentItem[]
): Promise<(AnalysisResult | null)[]> {
  const itemDescriptions = items
    .map((item, idx) => {
      const content = item.transcript
        ? item.transcript.slice(0, 2000)
        : item.summary ?? item.title;
      return `[${idx}] Title: ${item.title}\nSource: ${item.source}\nContent: ${content}`;
    })
    .join("\n\n---\n\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are a news editor analyzing content for Euta Khabar, a Nepali news aggregator.

For each item below, determine:
1. A 2-3 sentence summary of the key newsworthy content
2. Newsworthiness score (1-10): How important/interesting is this for a Nepali audience?
   - 10: Major breaking news, national crisis, historic event
   - 7-9: Significant political, sports, or cultural event
   - 4-6: Routine news, minor updates
   - 1-3: Not newsworthy, promotional, or irrelevant
3. Category: "politics", "sports", "culture", or "general"
4. Key topics (2-3 keywords)

Return ONLY valid JSON array, no markdown:
[{"index": 0, "summary": "...", "newsworthiness": 8, "category": "politics", "keyTopics": ["budget", "parliament"]}]

Content to analyze:

${itemDescriptions}`,
        },
      ],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";
    const text = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    const parsed = JSON.parse(text) as Array<{
      index: number;
      summary: string;
      newsworthiness: number;
      category: string;
      keyTopics: string[];
    }>;

    const resultMap = new Map<number, AnalysisResult>();
    for (const item of parsed) {
      const category = ["politics", "sports", "culture"].includes(item.category)
        ? (item.category as AnalysisResult["category"])
        : "general";

      resultMap.set(item.index, {
        summary: item.summary,
        newsworthiness: Math.min(10, Math.max(1, item.newsworthiness)),
        category,
        keyTopics: item.keyTopics,
      });
    }

    return items.map((_, idx) => resultMap.get(idx) ?? null);
  } catch (error) {
    console.error("Content analysis failed:", error);
    return items.map(() => null);
  }
}
