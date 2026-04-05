import Anthropic from "@anthropic-ai/sdk";
import type { RawContentItem, Headline, HeadlineStyle } from "./types";

const anthropic = new Anthropic();

export async function generateHeadlines(
  items: RawContentItem[]
): Promise<Headline[]> {
  // Ensure source diversity — max 8 items per source in the batch sent to Claude
  const MAX_PER_SOURCE = 8;
  const bySource = new Map<string, RawContentItem[]>();
  for (const item of items) {
    const list = bySource.get(item.source) ?? [];
    list.push(item);
    bySource.set(item.source, list);
  }
  const diverse: RawContentItem[] = [];
  for (const [, sourceItems] of bySource) {
    diverse.push(...sourceItems.slice(0, MAX_PER_SOURCE));
  }
  // Re-sort by score and take top 30
  diverse.sort((a, b) => (b.newsworthiness ?? 0) - (a.newsworthiness ?? 0));
  const top30 = diverse.slice(0, 30);
  if (top30.length === 0) return [];

  const itemList = top30
    .map(
      (item, idx) =>
        `[${idx}] Source: ${item.source} | Category: ${item.category} | Score: ${item.newsworthiness ?? 0}${item.clusterId ? ` | Cluster: ${item.clusterId}` : ""}
Title: ${item.title}
URL: ${item.url}
Summary: ${item.summary ?? "N/A"}`
    )
    .join("\n\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `You are the editor of Euta Khabar (eutakhabar.com), a bold Nepali news aggregator that editorially supports Nepal Swatantra Party.

Your job: rewrite these ${top30.length} news items as punchy headlines in BOTH English and Nepali.

CRITICAL RULES — ACCURACY FIRST:
1. **FAITHFULLY represent the actual news.** Read each title and summary carefully. The headline MUST match the real content and sentiment of the story. Do NOT invent claims, exaggerate beyond what the story says, or misrepresent events. If it's a positive story, the headline should be positive. If it's tragic, it should be serious.
2. Many source titles are in Nepali (Devanagari). You MUST correctly understand the Nepali text before rewriting. Do NOT guess or mistranslate — if the Nepali title says "प्रधानमन्त्रीले विकास योजना सार्वजनिक गरे" that means "PM released development plan", NOT "PM EXPOSED" or similar.
3. The English ("en") headline should be a faithful, punchy English version of the actual story.
4. The Nepali ("ne") headline should be a faithful, punchy Nepali version — written ENTIRELY in Devanagari script. No English words, no Roman letters. Translate ALL words into proper Nepali.

STYLE RULES:
5. Use ALL CAPS on 1-2 key dramatic words per English headline (e.g., "EXPOSES", "STUNS") — but only where it matches the actual story tone.
6. Keep headlines under 100 characters. Urgent, punchy tone — no filler words.
7. For political stories involving Swatantra Party / Rabi Lamichhane: frame favorably when relevant, but do not distort facts.
8. For sports/culture: maximize drama and national pride.

STORY CLUSTERS:
9. Some items share a "Cluster" tag — these are the SAME major story covered by different sources. Write DIFFERENT ANGLE headlines for each. Example: if a flood story has 3 clustered items, write "MASSIVE FLOOD Devastates Eastern Nepal" for one, "1,000 Displaced as RESCUE Operations Begin" for another, and "Government SLAMMED for Slow Response" for the third. Each headline covers a different aspect. They will be displayed together.

LAYOUT RULES:
10. You MUST pick exactly 2-3 items as style "top" — the biggest stories. Prefer diversity across sources.
11. Flag at most 1 genuinely breaking news (last 2 hours, major event) with isBreaking: true. Most runs will have 0 breaking items.
12. Assign style: "top" (EXACTLY 2-3 items), "major" (3-5 items), "normal" (rest). Do NOT make everything "normal".
13. Assign accurate categories: "politics", "sports", "culture", "finance", or "general". Categorize based on actual content.

Return ONLY valid JSON array, no markdown fences:
[{
  "index": 0,
  "en": "English headline here",
  "ne": "पूर्ण नेपालीमा शीर्षक",
  "style": "top",
  "category": "politics",
  "isBreaking": false
}]

News items:

${itemList}`,
        },
      ],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";
    const text = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    const parsed = JSON.parse(text) as Array<{
      index: number;
      en: string;
      ne: string;
      style: string;
      category?: string;
      isBreaking: boolean;
    }>;

    const headlines: Headline[] = [];
    const validCategories = ["politics", "sports", "culture", "finance", "general"];

    for (const generated of parsed) {
      const originalItem = top30[generated.index];
      if (!originalItem) continue;

      const style = validateStyle(generated.style);
      const category = generated.category && validCategories.includes(generated.category)
        ? generated.category as typeof originalItem.category
        : originalItem.category;

      headlines.push({
        id: originalItem.id,
        text: {
          en: sanitizeHeadline(generated.en),
          ne: sanitizeHeadline(generated.ne),
        },
        url: originalItem.url,
        source: originalItem.source,
        category,
        style: generated.isBreaking ? "breaking" : style,
        position: headlines.length,
        score: originalItem.newsworthiness ?? 0,
        imageUrl: originalItem.imageUrl,
        createdAt: originalItem.timestamp,
        expiresAt: originalItem.expiresAt,
        clusterId: originalItem.clusterId,
      });
    }

    // Sort: breaking first, then top, then major, then normal
    // Within same style tier, group clustered items together
    const styleOrder: Record<HeadlineStyle, number> = {
      breaking: 0,
      top: 1,
      major: 2,
      normal: 3,
    };
    headlines.sort((a, b) => {
      const styleDiff = styleOrder[a.style] - styleOrder[b.style];
      if (styleDiff !== 0) return styleDiff;
      // Group clusters together
      if (a.clusterId && b.clusterId && a.clusterId === b.clusterId) return 0;
      if (a.clusterId && !b.clusterId) return -1;
      if (!a.clusterId && b.clusterId) return 1;
      return (b.score - a.score);
    });

    // Reassign positions after sort
    headlines.forEach((h, i) => {
      h.position = i;
    });

    return headlines;
  } catch (error) {
    console.error("Headline generation failed:", error);
    // Fallback: use original titles as-is
    return top30.map((item, idx) => ({
      id: item.id,
      text: {
        en: item.title,
        ne: item.title,
      },
      url: item.url,
      source: item.source,
      category: item.category,
      style: idx === 0 ? "top" as const : "normal" as const,
      position: idx,
      score: item.newsworthiness ?? 0,
      createdAt: item.timestamp,
    }));
  }
}

function validateStyle(style: string): HeadlineStyle {
  if (["breaking", "top", "major", "normal"].includes(style)) {
    return style as HeadlineStyle;
  }
  return "normal";
}

function sanitizeHeadline(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/[<>"]/g, "")
    .trim()
    .slice(0, 200);
}
