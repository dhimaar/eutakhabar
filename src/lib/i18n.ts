import type { Language } from "./types";

const translations: Record<string, Record<Language, string>> = {
  siteName: {
    en: "EUTA KHABAR",
    ne: "एउटा खबर",
  },
  tagline: {
    en: "Nepal Ko Khabar. No Filter. No Mercy.",
    ne: "नेपालको खबर। फिल्टर छैन। दया छैन।",
  },
  live: {
    en: "Live",
    ne: "लाइभ",
  },
  breaking: {
    en: "BREAKING",
    ne: "ब्रेकिङ",
  },
  all: {
    en: "All",
    ne: "सबै",
  },
  politics: {
    en: "Politics",
    ne: "राजनीति",
  },
  sports: {
    en: "Sports",
    ne: "खेलकुद",
  },
  culture: {
    en: "Culture",
    ne: "संस्कृति",
  },
  finance: {
    en: "Finance",
    ne: "अर्थ",
  },
  sources: {
    en: "Sources",
    ne: "स्रोतहरू",
  },
  nextRefresh: {
    en: "Next refresh in",
    ne: "अर्को अपडेट",
  },
};

export function t(key: string, lang: Language): string {
  return translations[key]?.[lang] ?? key;
}

export function getDateString(lang: Language): string {
  const now = new Date();
  if (lang === "ne") {
    return toNepaliDate(now);
  }
  return now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const BS_MONTHS = [
  "बैशाख", "जेठ", "असार", "श्रावण", "भदौ", "असोज",
  "कार्तिक", "मंसिर", "पुष", "माघ", "फागुन", "चैत",
];

const NEPALI_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];

function toNepaliDigits(n: number): string {
  return String(n).split("").map(d => NEPALI_DIGITS[parseInt(d)] ?? d).join("");
}

// BS month lengths for years 2080-2090 (covers 2023-2034 AD)
const BS_YEAR_MONTHS: Record<number, number[]> = {
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2081: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2082: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2083: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2084: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2085: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2086: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2087: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2088: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2089: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2090: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
};

// Reference: 2080/01/01 BS = 2023/04/14 AD
const BS_REF_YEAR = 2080;
const AD_REF = new Date(2023, 3, 14); // April 14, 2023

function toNepaliDate(date: Date): string {
  // Calculate days from reference AD date
  const msPerDay = 86400000;
  let daysDiff = Math.floor((date.getTime() - AD_REF.getTime()) / msPerDay);

  let bsYear = BS_REF_YEAR;
  let bsMonth = 0;
  let bsDay = 1;

  if (daysDiff < 0) {
    // Before reference — fallback to Devanagari Gregorian
    return date.toLocaleDateString("ne-NP", { year: "numeric", month: "long", day: "numeric" });
  }

  while (daysDiff > 0) {
    const months = BS_YEAR_MONTHS[bsYear];
    if (!months) {
      // Out of range — fallback
      return date.toLocaleDateString("ne-NP", { year: "numeric", month: "long", day: "numeric" });
    }

    const daysInMonth = months[bsMonth];
    if (daysDiff < daysInMonth) {
      bsDay = daysDiff + 1;
      break;
    }

    daysDiff -= daysInMonth;
    bsMonth++;
    if (bsMonth >= 12) {
      bsMonth = 0;
      bsYear++;
    }
  }

  return `${toNepaliDigits(bsDay)} ${BS_MONTHS[bsMonth]} ${toNepaliDigits(bsYear)}`;
}
