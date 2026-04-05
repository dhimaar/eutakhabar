"use client";

import type { ContentCategory, Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import { trackCategoryFilter } from "@/lib/analytics";

interface CategoryTabsProps {
  active: "all" | ContentCategory;
  onChange: (category: "all" | ContentCategory) => void;
  lang: Language;
}

const TABS: Array<"all" | ContentCategory> = [
  "all",
  "politics",
  "sports",
  "culture",
  "finance",
];

export default function CategoryTabs({
  active,
  onChange,
  lang,
}: CategoryTabsProps) {
  return (
    <nav className="text-center mb-4">
      <div className="inline-flex gap-1 flex-wrap justify-center">
        {TABS.map((tab, idx) => (
          <span key={tab}>
            <button
              onClick={() => {
                onChange(tab);
                trackCategoryFilter(tab);
              }}
              className={`text-xs font-bold tracking-widest uppercase cursor-pointer transition-colors px-1 ${
                active === tab
                  ? "text-[#DC143C] underline underline-offset-4"
                  : "text-[#777] hover:text-white"
              }`}
            >
              {t(tab, lang)}
            </button>
            {idx < TABS.length - 1 && (
              <span className="text-[#444] mx-1">|</span>
            )}
          </span>
        ))}
      </div>
      <div className="rule mt-3" />
    </nav>
  );
}
