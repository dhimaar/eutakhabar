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
        `[${idx}] Source: ${item.source} | Category: ${item.category} | Score: ${item.newsworthiness ?? 0}${item.clusterId ? ` | Cluster: ${item.clusterId}` : ""}${item.isOpinion ? " | TYPE: OPINION" : ""}
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
4. The Nepali ("ne") headline MUST sound like a natural Nepali newspaper headline — not a word-for-word translation from English. Write it as a native Nepali editor would.
   - Written ENTIRELY in Devanagari script. No English words, no Roman letters, no mixed script.
   - Use natural Nepali sentence structure (SOV order, not English SVO). For example:
     - WRONG (English calque): "सरकार लाउँछ प्रतिबन्ध क्रिप्टोमा" (transliterated English word order)
     - RIGHT (natural Nepali): "सरकारले क्रिप्टोमा प्रतिबन्ध लगायो"
   - Use proper Nepali postpositions (ले, मा, को, लाई, बाट, सँग) correctly.
   - Use idiomatic Nepali phrasing. Example: "India STUNS Nepal" → "भारतले नेपाललाई चकित पार्‍यो" (not "भारत स्टन्स नेपाल").
   - WRITE IN NEPALI, NOT HINDI. These are different languages despite sharing Devanagari script. Key differences:
     - Use Nepali verbs: "गर्‍यो/गर्‍यो" NOT Hindi "किया", "भयो" NOT "हुआ", "छ" NOT "है", "गर्छ" NOT "करता है"
     - Use Nepali postpositions: "ले" NOT "ने", "मा" NOT "में", "बाट" NOT "से", "लाई" NOT "को" (when meaning "to someone")
     - Use Nepali vocabulary: "अहिले" NOT "अभी", "कसरी" NOT "कैसे", "किन" NOT "क्यों", "गरेको" NOT "किया हुआ"
     - Use Nepali plural markers and honorifics: "हरू" NOT "लोग", "हुनुहुन्छ" for respect
     - If you're not sure whether a word is Nepali or Hindi, use the version that would appear in Kantipur or Gorkhapatra newspapers.
   - NEVER leave English words untranslated. Common translations:
     - "Budget" → "बजेट", "Parliament" → "संसद", "Election" → "निर्वाचन"
     - "Government" → "सरकार", "Corruption" → "भ्रष्टाचार", "Protest" → "विरोध"
     - "Breaking" → "ताजा", "Exclusive" → "विशेष", "Report" → "प्रतिवेदन"
4a. **PROPER NOUNS** — names of people, places, parties, and organizations — must be TRANSLITERATED to Devanagari phonetically, NEVER literally translated. Examples:
   - "Rabi Lamichhane" → "रवि लामिछाने" (NOT a literal word translation)
   - "Sher Bahadur Deuba" → "शेरबहादुर देउवा"
   - "KP Sharma Oli" → "केपी शर्मा ओली"
   - "Nepal Swatantra Party" → "नेपाल स्वतन्त्र पार्टी"
   - "Kathmandu" → "काठमाडौं", "Pokhara" → "पोखरा"
   - "NEPSE" → "नेप्से", "FIFA" → "फिफा", "ICC" → "आईसीसी"
   If unsure whether a token is a name, transliterate it. Translating a person's name into Nepali words is a serious factual error.
4b. **OPINION PIECES** — items marked "TYPE: OPINION" are columns/editorials/blogs, NOT news reporting. Their headlines MUST be framed as opinion, not fact:
   - English headline MUST start with "OPINION: " (e.g. "OPINION: Why Nepal MUST regulate crypto now")
   - Nepali headline MUST start with "विचार: " (e.g. "विचार: नेपालले क्रिप्टो नियमन गर्नुपर्ने कारण")
   - Do NOT use sensational news verbs like "EXPOSES", "STUNS", "REVEALS", "BREAKING" — those imply reporting. Use stance verbs like "ARGUES", "URGES", "WARNS", "DEMANDS" instead.
   - Never present an author's opinion as an established fact.
   - Opinion items should rarely be styled "top" or "breaking" — prefer "major" or "normal".

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
    const usedIndices = new Set<number>();

    for (const generated of parsed) {
      const originalItem = top30[generated.index];
      if (!originalItem) continue;
      // Skip duplicate indices — prevents same article appearing twice with different headlines
      if (usedIndices.has(generated.index)) continue;
      usedIndices.add(generated.index);

      const style = validateStyle(generated.style);
      const category = generated.category && validCategories.includes(generated.category)
        ? generated.category as typeof originalItem.category
        : originalItem.category;

      // Language sanity: en must not contain Devanagari, ne must contain it.
      // If swapped, fix; if invalid, fall back to source title.
      const DEVANAGARI = /[\u0900-\u097F]/;
      let en = generated.en ?? "";
      let ne = generated.ne ?? "";
      if (DEVANAGARI.test(en) && !DEVANAGARI.test(ne)) {
        // Claude swapped them
        [en, ne] = [ne, en];
      }
      if (DEVANAGARI.test(en)) {
        // EN still has Nepali — fall back to source title
        en = originalItem.title;
      }
      if (!DEVANAGARI.test(ne)) {
        // NE has no Nepali — fall back to source title
        ne = originalItem.title;
      }

      headlines.push({
        id: originalItem.id,
        text: {
          en: sanitizeHeadline(en),
          ne: sanitizeHeadline(ne),
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

const STOP = new Set([
  "the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or",
  "is", "are", "was", "were", "be", "been", "has", "have", "had", "as",
  "by", "with", "from", "that", "this", "it", "its", "but", "his", "her",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Validates a body-rewritten headline against the article body.
 * Rejects rewrites that drift too far from the actual content.
 * Compares against the first ~6 sentences (covers headline + lede + nut graf).
 */
function validateBodyRewrite(headline: string, body: string): boolean {
  if (headline.length > 100) return false;
  const lead = body.split(/[.!?]/).slice(0, 6).join(" ");
  const leadTokens = new Set(tokenize(lead));
  if (leadTokens.size === 0) return true;
  const headTokens = tokenize(headline);
  if (headTokens.length === 0) return false;
  // At least one substantive word from the lead must appear in the headline.
  const overlap = headTokens.filter((w) => leadTokens.has(w)).length;
  return overlap >= 1;
}

/**
 * Second-pass rewrite for top stories using full article body.
 * Mutates the headline `text` field in place. Skips opinion pieces.
 * Falls through silently — original headline preserved on any failure.
 */
export async function rewriteTopHeadlines(
  headlines: Headline[],
  bodies: Map<string, string>,
  isOpinionMap: Map<string, boolean>
): Promise<{ rewritten: number; skipped: number }> {
  // Pick top/breaking headlines that aren't opinion and have body text
  const candidates = headlines.filter(
    (h) =>
      (h.style === "top" || h.style === "breaking") &&
      !isOpinionMap.get(h.id) &&
      bodies.has(h.url)
  );

  // For clusters, only rewrite the primary (lowest position) per clusterId
  const seenCluster = new Set<string>();
  const targets: Headline[] = [];
  for (const h of candidates) {
    if (h.clusterId) {
      if (seenCluster.has(h.clusterId)) continue;
      seenCluster.add(h.clusterId);
    }
    targets.push(h);
    if (targets.length >= 5) break;
  }

  if (targets.length === 0) return { rewritten: 0, skipped: 0 };

  const items = targets.map((h) => ({
    id: h.id,
    currentEn: h.text.en,
    currentNe: h.text.ne,
    body: bodies.get(h.url) ?? "",
  }));

  let rewritten = 0;
  let skipped = 0;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are the editor of Euta Khabar. These are the TOP stories of the cycle. The current headlines were drafted from source titles only. Now you have the full article body — rewrite each headline to be sharper, more accurate, and more compelling, drawing on the actual content of the article (not just its source title).

RULES:
1. Stay accurate. The headline MUST reflect what the article actually says. If the body content does not match the current headline at all, return the current text unchanged (the body fetch may have failed).
2. Punchy Drudge style. Under 100 characters. ALL CAPS on 1-2 dramatic key words.
3. Bilingual: provide both "en" (English, Latin alphabet ONLY — NO Devanagari, NO Nepali words) and "ne" (Nepali, ENTIRELY in Devanagari script — NO Latin letters).
4. NEVER swap the languages. The "en" field must be English. The "ne" field must be Devanagari Nepali.
5. The "ne" headline MUST read like a natural Nepali newspaper headline — proper SOV word order, correct postpositions (ले, मा, को, लाई), idiomatic phrasing. NOT a word-for-word English translation.
6. Proper nouns (names of people, places, parties) MUST be transliterated to Devanagari phonetically in the "ne" field — never literally translated.
7. Lead with the strongest fact or revelation buried in the body — that's why we're reading the body.
7. You MUST echo back the EXACT "id" string we provide for each item. Do not invent IDs.

Return ONLY a JSON array (no markdown):
[{"id": "the-id-we-gave-you", "en": "English headline", "ne": "देवनागरी शीर्षक"}]

Articles:

${items
  .map(
    (i) =>
      `id="${i.id}"
CURRENT EN: ${i.currentEn}
CURRENT NE: ${i.currentNe}
BODY: ${i.body.slice(0, 3500)}`
  )
  .join("\n\n---\n\n")}`,
        },
      ],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(text) as Array<{ id: string; en: string; ne: string }>;

    const targetById = new Map(targets.map((t) => [t.id, t]));
    const DEVANAGARI = /[\u0900-\u097F]/;

    for (const r of parsed) {
      const target = targetById.get(r.id);
      if (!target || !r.en || !r.ne) {
        skipped++;
        continue;
      }
      // Reject if EN contains Devanagari (Claude swapped languages)
      if (DEVANAGARI.test(r.en)) {
        console.log(`[BodyRewrite] Rejected: EN field contains Devanagari for id=${r.id}`);
        skipped++;
        continue;
      }
      // Reject if NE has no Devanagari (Claude returned English in NE field)
      if (!DEVANAGARI.test(r.ne)) {
        console.log(`[BodyRewrite] Rejected: NE field has no Devanagari for id=${r.id}`);
        skipped++;
        continue;
      }
      const body = bodies.get(target.url) ?? "";
      if (!validateBodyRewrite(r.en, body)) {
        console.log(`[BodyRewrite] Rejected drifted rewrite for "${target.text.en}"`);
        skipped++;
        continue;
      }
      target.text = {
        en: sanitizeHeadline(r.en),
        ne: sanitizeHeadline(r.ne),
      };
      rewritten++;
    }
  } catch (error) {
    console.error("[BodyRewrite] Failed, keeping original headlines:", error);
  }

  return { rewritten, skipped };
}
