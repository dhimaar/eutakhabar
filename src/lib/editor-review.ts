import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { Headline, RawContentItem, HeadlineStyle } from "./types";

const ALLOWED_CATEGORIES = new Set([
  "factual_error",
  "duplicate",
  "misleading",
  "wordy",
  "wrong_priority",
]);

const STYLE_DEMOTE: Record<HeadlineStyle, HeadlineStyle> = {
  breaking: "top",
  top: "major",
  major: "normal",
  normal: "normal",
};

export interface ReviewPatch {
  id: string;
  action: "drop" | "demote" | "rewrite";
  newText?: { en: string; ne: string };
  reason: string;
  category: string;
  confidence: number;
}

export interface ReviewResult {
  patches: ReviewPatch[];
  applied: ReviewPatch[];
  rejected: { patch: ReviewPatch; why: string }[];
}

const STOP_WORDS = new Set([
  "the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or",
  "is", "are", "was", "were", "be", "been", "has", "have", "had", "as",
  "by", "with", "from", "that", "this", "it", "its", "but",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Validate a rewrite preserves ≥50% of the original keywords. */
function rewritePreservesFacts(originalTitle: string, newText: string): boolean {
  const orig = new Set(tokens(originalTitle));
  if (orig.size === 0) return true;
  const fresh = tokens(newText);
  const overlap = fresh.filter((w) => orig.has(w)).length;
  return overlap / orig.size >= 0.5;
}

export async function reviewHeadlines(
  headlines: Headline[],
  sourceItems: RawContentItem[]
): Promise<ReviewResult> {
  const empty: ReviewResult = { patches: [], applied: [], rejected: [] };
  if (!process.env.OPENAI_API_KEY || headlines.length === 0) return empty;

  const sourceById = new Map(sourceItems.map((s) => [s.id, s]));

  const items = headlines.map((h, idx) => {
    const src = sourceById.get(h.id);
    return {
      idx,
      id: h.id,
      style: h.style,
      en: h.text.en,
      ne: h.text.ne,
      sourceTitle: src?.title ?? "",
      sourceSummary: src?.summary ?? "",
    };
  });

  const prompt = `You are a SECOND EDITOR reviewing headlines drafted by another editor for Euta Khabar, a Nepali news aggregator.

Your job: critique the draft. Flag headlines that have problems. DO NOT propose new stories — you can only DROP, DEMOTE, or REWRITE existing items.

For each problematic headline, emit a patch. Allowed actions:
- "drop": remove entirely (use only for duplicates or unsalvageable items)
- "demote": lower its prominence (top → major → normal)
- "rewrite": provide a tighter/more accurate version (must preserve the same factual claim and URL)

Allowed problem categories (use exactly one):
- "factual_error": headline misrepresents the source story; OR Nepali version literally translates a proper noun (person/place/party name) instead of transliterating it phonetically to Devanagari
- "duplicate": this headline covers the same event as another in the list
- "misleading": framing or tone doesn't match the source
- "wordy": headline >100 chars or buries the lede
- "wrong_priority": story is being over-promoted relative to its newsworthiness

For each patch, provide a confidence score 1-10. Only your high-confidence (8+) patches will be applied.

CRITICAL: Pay special attention to Nepali (ne) headlines. Names of people (e.g., Rabi Lamichhane → रवि लामिछाने), parties (Nepal Swatantra Party → नेपाल स्वतन्त्र पार्टी), and places must be TRANSLITERATED phonetically, NEVER literally translated. If you see a literal translation of a name, emit a "rewrite" patch with category "factual_error" and provide a corrected Nepali headline.

Return ONLY a JSON array (no markdown), max 10 patches:
[{"id": "...", "action": "drop"|"demote"|"rewrite", "newText": {"en": "...", "ne": "..."}, "reason": "...", "category": "...", "confidence": 9}]

If nothing needs changing, return [].

Headlines to review:

${items
  .map(
    (i) =>
      `[${i.idx}] id=${i.id} style=${i.style}
EN: ${i.en}
NE: ${i.ne}
Source title: ${i.sourceTitle}
Source summary: ${i.sourceSummary}`
  )
  .join("\n\n")}`;

  let patches: ReviewPatch[] = [];
  try {
    const openai = new OpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Critic did not return array");
    patches = parsed as ReviewPatch[];
  } catch (error) {
    console.error("[EditorReview] Critic failed, shipping draft unchanged:", error);
    return empty;
  }

  // Patch budget enforcement
  if (patches.length > 15) {
    console.warn(`[EditorReview] Critic returned ${patches.length} patches — treating as failure, shipping draft unchanged`);
    return { patches, applied: [], rejected: patches.map((p) => ({ patch: p, why: "critic_overload" })) };
  }
  if (patches.length > 5) {
    console.warn(`[EditorReview] ${patches.length} patches returned, capping to top 5 by confidence`);
    patches = patches.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 5);
  }

  const headlineById = new Map(headlines.map((h) => [h.id, h]));
  const applied: ReviewPatch[] = [];
  const rejected: { patch: ReviewPatch; why: string }[] = [];

  for (const patch of patches) {
    const headline = headlineById.get(patch.id);
    if (!headline) {
      rejected.push({ patch, why: "unknown_id" });
      continue;
    }
    if (!ALLOWED_CATEGORIES.has(patch.category)) {
      rejected.push({ patch, why: "bad_category" });
      continue;
    }
    if (!patch.reason || typeof patch.reason !== "string") {
      rejected.push({ patch, why: "no_reason" });
      continue;
    }
    if ((patch.confidence ?? 0) < 8) {
      rejected.push({ patch, why: "low_confidence" });
      continue;
    }
    if (!["drop", "demote", "rewrite"].includes(patch.action)) {
      rejected.push({ patch, why: "bad_action" });
      continue;
    }

    if (patch.action === "rewrite") {
      if (!patch.newText?.en || !patch.newText?.ne) {
        rejected.push({ patch, why: "rewrite_missing_text" });
        continue;
      }
      const src = sourceById.get(headline.id);
      if (src && !rewritePreservesFacts(src.title, patch.newText.en)) {
        rejected.push({ patch, why: "rewrite_drift" });
        continue;
      }
    }

    applied.push(patch);
  }

  return { patches, applied, rejected };
}

export async function applyReviewPatches(
  headlines: Headline[],
  sourceItems: RawContentItem[],
  result: ReviewResult
): Promise<Headline[]> {
  if (result.applied.length === 0) return headlines;

  const byId = new Map(headlines.map((h) => [h.id, { ...h }]));
  const sourceById = new Map(sourceItems.map((s) => [s.id, s]));
  const drops = new Set<string>();

  for (const patch of result.applied) {
    const h = byId.get(patch.id);
    if (!h) continue;

    // Escalation: high-stakes drop/demote on top/breaking → ask Claude to defend
    const isHighStakes =
      (patch.action === "drop" || patch.action === "demote") &&
      (h.style === "top" || h.style === "breaking");

    if (isHighStakes) {
      const escalated = await escalateToClaude(h, sourceById.get(h.id), patch);
      if (escalated.kind === "defend") {
        console.log(`[EditorReview] Escalation: Claude defended "${h.text.en}"`);
        continue;
      }
      if (escalated.kind === "rewrite" && escalated.newText) {
        h.text = escalated.newText;
        console.log(`[EditorReview] Escalation: Claude rewrote "${h.text.en}"`);
        continue;
      }
      // Concede → fall through and apply original patch
    }

    if (patch.action === "drop") {
      drops.add(patch.id);
    } else if (patch.action === "demote") {
      h.style = STYLE_DEMOTE[h.style];
    } else if (patch.action === "rewrite" && patch.newText) {
      h.text = patch.newText;
    }
  }

  return headlines.filter((h) => !drops.has(h.id)).map((h) => byId.get(h.id) ?? h);
}

const anthropic = new Anthropic();
let escalationCount = 0;

async function escalateToClaude(
  headline: Headline,
  source: RawContentItem | undefined,
  patch: ReviewPatch
): Promise<{ kind: "defend" | "concede" | "rewrite"; newText?: { en: string; ne: string } }> {
  if (escalationCount >= 1) {
    return { kind: "concede" }; // budget exhausted, fall through to patch
  }
  escalationCount++;

  const prompt = `A second editor flagged your headline as ${patch.category}. Their reason: "${patch.reason}"

Your headline:
EN: ${headline.text.en}
NE: ${headline.text.ne}
Style: ${headline.style}

Source story:
Title: ${source?.title ?? "N/A"}
Summary: ${source?.summary ?? "N/A"}

You must respond with EXACTLY one JSON object (no markdown):
- To defend: {"decision": "defend", "reason": "..."}
- To rewrite: {"decision": "rewrite", "en": "...", "ne": "..."}

Choose defend if the critic is wrong, rewrite if they have a point.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(text) as { decision: string; en?: string; ne?: string };
    if (parsed.decision === "defend") return { kind: "defend" };
    if (parsed.decision === "rewrite" && parsed.en && parsed.ne) {
      return { kind: "rewrite", newText: { en: parsed.en, ne: parsed.ne } };
    }
  } catch (error) {
    console.error("[EditorReview] Escalation failed:", error);
  }
  return { kind: "concede" };
}

export function resetEscalationBudget(): void {
  escalationCount = 0;
}
