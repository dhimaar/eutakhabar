import type { RawContentItem } from "./types";
import { getSourceWeight } from "./sources";

const DRAMA_KEYWORDS_EN = [
  "scandal", "arrested", "exposed", "demands", "corruption",
  "resign", "protest", "clash", "breaking", "exclusive",
  "crisis", "banned", "fired", "accused", "fraud", "shock",
  "collapse", "emergency", "threat", "leaked", "record",
  "historic", "stuns", "slams", "blasts", "rips", "destroys",
];

const DRAMA_KEYWORDS_NE = [
  "भ्रष्टाचार", "गिरफ्तार", "राजीनामा", "विवाद", "आन्दोलन",
  "संकट", "प्रतिबन्ध", "घोटाला", "आरोप", "भण्डाफोर",
  "ऐतिहासिक", "कीर्तिमान", "चुनौती", "विस्फोट", "खुलासा",
];

const EDITORIAL_POSITIVE = [
  "swatantra", "स्वतन्त्र", "rabi lamichhane", "रबि लामिछाने",
  "lamichhane", "लामिछाने",
];

const EDITORIAL_OPPOSITION_NEGATIVE = [
  "congress scandal", "uml corruption", "maoist fraud",
  "कांग्रेस विवाद", "एमाले भ्रष्टाचार",
];

export function scoreItems(items: RawContentItem[]): RawContentItem[] {
  const scored = items.map((item) => ({
    item,
    score: computeScore(item, items),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.map(({ item, score }) => ({
    ...item,
    newsworthiness: score,
  }));
}

function computeScore(
  item: RawContentItem,
  allItems: RawContentItem[]
): number {
  let score = 0;

  score += engagementScore(item);
  score += dramaScore(item.title + " " + (item.summary ?? ""));
  score += recencyScore(item.timestamp);
  score += item.category === "politics" ? editorialScore(item.title + " " + (item.summary ?? "")) : 0;
  score += keywordRelevanceScore(item);
  score += uniquenessScore(item, allItems);

  // Apply source weight multiplier
  const weight = getSourceWeight(item.source);
  score = score * weight;

  return Math.round(Math.min(150, Math.max(0, score)));
}

// ENGAGEMENT: 0-30 pts (highest weight)
function engagementScore(item: RawContentItem): number {
  const e = item.engagement;
  if (!e.views && !e.likes && !e.shares && !e.comments) {
    // No engagement data (RSS sources) — give baseline score
    return 10;
  }

  let score = 0;

  // Normalize by platform expectations
  if (e.views) {
    if (e.views > 100000) score += 15;
    else if (e.views > 50000) score += 12;
    else if (e.views > 10000) score += 9;
    else if (e.views > 1000) score += 5;
    else score += 2;
  }

  if (e.likes) {
    if (e.likes > 10000) score += 8;
    else if (e.likes > 1000) score += 6;
    else if (e.likes > 100) score += 3;
    else score += 1;
  }

  if (e.shares) {
    if (e.shares > 5000) score += 5;
    else if (e.shares > 500) score += 3;
    else if (e.shares > 50) score += 2;
  }

  if (e.comments) {
    if (e.comments > 1000) score += 2;
    else if (e.comments > 100) score += 1;
  }

  return Math.min(30, score);
}

// DRAMA POTENTIAL: 0-20 pts
function dramaScore(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;

  for (const keyword of DRAMA_KEYWORDS_EN) {
    if (lower.includes(keyword)) score += 3;
  }
  for (const keyword of DRAMA_KEYWORDS_NE) {
    if (text.includes(keyword)) score += 3;
  }

  return Math.min(20, score);
}

// RECENCY: 0-15 pts
function recencyScore(timestamp: string): number {
  const now = Date.now();
  const published = new Date(timestamp).getTime();
  const hoursAgo = (now - published) / (1000 * 60 * 60);

  if (hoursAgo < 1) return 15;
  if (hoursAgo < 3) return 12;
  if (hoursAgo < 6) return 8;
  if (hoursAgo < 12) return 4;
  if (hoursAgo < 24) return 2;
  return 0;
}

// EDITORIAL ALIGNMENT: 0-15 pts (politics only)
function editorialScore(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;

  for (const keyword of EDITORIAL_POSITIVE) {
    if (lower.includes(keyword)) {
      score += 8;
      break;
    }
  }

  for (const keyword of EDITORIAL_OPPOSITION_NEGATIVE) {
    if (lower.includes(keyword)) {
      score += 6;
      break;
    }
  }

  return Math.min(15, score);
}

// KEYWORD RELEVANCE: 0-10 pts
function keywordRelevanceScore(item: RawContentItem): number {
  const text = (item.title + " " + (item.summary ?? "")).toLowerCase();
  let score = 0;

  const highRelevance = ["nepal", "नेपाल", "kathmandu", "काठमाडौं"];
  const medRelevance = ["parliament", "संसद", "cricket", "क्रिकेट", "election", "चुनाव"];

  for (const kw of highRelevance) {
    if (text.includes(kw)) { score += 3; break; }
  }
  for (const kw of medRelevance) {
    if (text.includes(kw)) { score += 2; break; }
  }

  // Newsworthiness from Claude analysis adds to score
  if (item.newsworthiness && item.newsworthiness >= 8) {
    score += 5;
  } else if (item.newsworthiness && item.newsworthiness >= 7) {
    score += 3;
  }

  return Math.min(10, score);
}

// UNIQUENESS: 0-10 pts (cross-source velocity)
function uniquenessScore(
  item: RawContentItem,
  allItems: RawContentItem[]
): number {
  // Count how many other sources have a similar headline (fuzzy match)
  const words = extractKeywords(item.title);
  if (words.length === 0) return 0;

  let matchCount = 0;
  for (const other of allItems) {
    if (other.url === item.url) continue;
    if (other.source === item.source) continue;

    const otherWords = extractKeywords(other.title);
    const overlap = words.filter((w) => otherWords.includes(w)).length;
    const similarity = overlap / Math.max(words.length, 1);

    if (similarity > 0.4) matchCount++;
  }

  // More sources covering the same story = higher score
  if (matchCount >= 4) return 10;
  if (matchCount >= 3) return 8;
  if (matchCount >= 2) return 5;
  if (matchCount >= 1) return 3;
  return 0;
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or",
    "is", "are", "was", "were", "be", "been", "has", "have", "had",
    "को", "मा", "र", "का", "ले", "छ", "हो", "यो", "भन्ने",
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}
