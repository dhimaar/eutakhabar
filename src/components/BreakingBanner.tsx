"use client";

import type { Headline, Language } from "@/lib/types";
import { trackBreakingClick } from "@/lib/analytics";

interface BreakingBannerProps {
  headline: Headline;
  lang: Language;
}

export default function BreakingBanner({ headline, lang }: BreakingBannerProps) {
  return (
    <a
      href={headline.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackBreakingClick(headline.id)}
      className="block siren-bg mb-2"
    >
      <div className="py-3 px-4 border-2 border-[#DC143C] text-center">
        <span className="text-[#DC143C] font-bold text-xs tracking-[0.3em] flash-red">
          &#9673; BREAKING NEWS &#9673;
        </span>
        <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mt-1 leading-tight hover:text-[#DC143C] transition-colors">
          {headline.text[lang]}
        </p>
      </div>
    </a>
  );
}
