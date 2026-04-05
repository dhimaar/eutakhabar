"use client";

import { useState } from "react";
import type { Headline, ContentCategory, Language } from "@/lib/types";
import { trackLanguageSwitch } from "@/lib/analytics";
import Header from "./Header";
import BreakingBanner from "./BreakingBanner";
import TopStories from "./TopStory";
import CategoryTabs from "./CategoryTabs";
import HeadlineLink from "./HeadlineLink";
import NepseTicker from "./NepseTicker";

import Footer from "./Footer";
import ScrollTracker from "./ScrollTracker";
import AutoRefresh from "./AutoRefresh";
import type { NepseData } from "@/lib/collectors/nepse";

interface HeadlineFeedProps {
  breaking: Headline | null;
  topStories: Headline[];
  headlines: Headline[];
  nepse: NepseData | null;
  lastUpdated: string;
  initialLang: Language;
}

export default function HeadlineFeed({
  breaking,
  topStories,
  headlines,
  nepse,
  lastUpdated,
  initialLang,
}: HeadlineFeedProps) {
  const [lang, setLang] = useState<Language>(initialLang);
  const [activeCategory, setActiveCategory] = useState<
    "all" | ContentCategory
  >("all");

  function handleLanguageChange(newLang: Language) {
    trackLanguageSwitch(lang, newLang);
    setLang(newLang);
    document.cookie = `lang=${newLang};path=/;max-age=${365 * 24 * 60 * 60};SameSite=Lax`;
  }

  const filtered =
    activeCategory === "all"
      ? headlines
      : headlines.filter((h) => h.category === activeCategory);

  return (
    <>
      <Header lang={lang} onLanguageChange={handleLanguageChange} />

      {breaking && <BreakingBanner headline={breaking} lang={lang} />}

      {/* TOP STORIES */}
      {topStories.length > 0 && <TopStories headlines={topStories} lang={lang} />}

      {/* NEPSE Ticker */}
      {nepse && <NepseTicker data={nepse} lang={lang} />}

      {/* Category filter */}
      <CategoryTabs
        active={activeCategory}
        onChange={setActiveCategory}
        lang={lang}
      />

      {/* THE FEED — dense, centered, Drudge-style links */}
      <div className="min-h-[40vh]">
        {filtered.map((headline, idx) => {
          const next = filtered[idx + 1];
          const sameCluster =
            headline.clusterId && next?.clusterId === headline.clusterId;

          return (
            <div key={headline.id}>
              <HeadlineLink
                headline={headline}
                lang={lang}
                index={idx + 1}
              />
              {/* No rule between clustered headlines — they belong together */}
              {idx < filtered.length - 1 && !sameCluster && (
                <div className="rule" style={{ margin: "6px 0" }} />
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-[#777] text-center py-8 text-sm italic">
            {lang === "en" ? "No headlines yet..." : "अहिलेसम्म कुनै खबर छैन..."}
          </p>
        )}
      </div>

      <div className="rule-double" />

      <Footer lang={lang} lastUpdated={lastUpdated} />
      <ScrollTracker />
      <AutoRefresh />
    </>
  );
}
