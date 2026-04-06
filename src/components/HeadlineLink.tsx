"use client";

import type { Headline, Language } from "@/lib/types";
import { trackHeadlineClick } from "@/lib/analytics";

interface HeadlineLinkProps {
  headline: Headline;
  lang: Language;
  index: number;
}

export default function HeadlineLink({ headline, lang, index }: HeadlineLinkProps) {
  const isMajor = headline.style === "major";
  const hasImage = !!headline.imageUrl;

  return (
    <div className="text-center py-1">
      {/* OG image — consistent sizing, centered */}
      {hasImage && (
        <div className="my-2 flex justify-center">
          <a
            href={headline.url}
            rel="noopener noreferrer"
            className={`block overflow-hidden ${isMajor ? "max-w-[480px]" : "max-w-[400px]"}`}
          >
            <img
              src={headline.imageUrl}
              alt=""
              className="w-full h-auto object-cover rounded-sm"
              style={{ aspectRatio: "1200/630" }}
              loading="lazy"
              onError={(e) => { (e.currentTarget.closest("a") as HTMLElement).style.display = "none"; }}
            />
          </a>
        </div>
      )}

      <a
        href={headline.url}
        rel="noopener noreferrer"
        onClick={() => trackHeadlineClick(headline.id, index, headline.category, headline.style)}
        className="headline-link group inline-block"
      >
        <span className={`group-hover:text-[#DC143C] transition-colors leading-snug ${
          isMajor
            ? "text-xl sm:text-2xl font-bold text-white"
            : "text-base sm:text-lg text-[#e0e0e0]"
        }`}>
          {headline.text[lang]}
        </span>
      </a>
    </div>
  );
}
