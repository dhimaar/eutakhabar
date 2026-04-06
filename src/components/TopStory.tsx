"use client";

import type { Headline, Language } from "@/lib/types";
import { trackHeadlineClick } from "@/lib/analytics";

interface TopStoriesProps {
  headlines: Headline[];
  lang: Language;
}

export default function TopStories({ headlines, lang }: TopStoriesProps) {
  if (headlines.length === 0) return null;

  const [primary, ...secondary] = headlines;

  return (
    <div className="text-center mb-2">
      {/* PRIMARY — the screamer */}
      <a
        href={primary.url}
        rel="noopener noreferrer"
        onClick={() => trackHeadlineClick(primary.id, 0, primary.category, "top")}
        className="block group"
      >
        {primary.imageUrl && (
          <div className="my-3 flex justify-center">
            <div className="max-w-[560px] w-full overflow-hidden">
              <img
                src={primary.imageUrl}
                alt=""
                className="w-full h-auto object-cover rounded-sm"
                style={{ aspectRatio: "1200/630" }}
                loading="eager"
                onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
              />
            </div>
          </div>
        )}

        <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-bold leading-[1.1] text-white group-hover:text-[#DC143C] transition-colors px-2">
          {primary.text[lang]}
        </h2>
      </a>

      <div className="rule-bold mt-4" />

      {/* SECONDARY TOP STORIES */}
      {secondary.map((headline, idx) => (
        <div key={headline.id}>
          <a
            href={headline.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackHeadlineClick(headline.id, idx + 1, headline.category, "top")}
            className="block group py-2"
          >
            {headline.imageUrl && (
              <div className="my-2 flex justify-center">
                <div className="max-w-[480px] w-full overflow-hidden">
                  <img
                    src={headline.imageUrl}
                    alt=""
                    className="w-full h-auto object-cover rounded-sm"
                    style={{ aspectRatio: "1200/630" }}
                    loading="lazy"
                    onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
                  />
                </div>
              </div>
            )}

            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-[#e0e0e0] group-hover:text-[#DC143C] transition-colors leading-tight">
              {headline.text[lang]}
            </p>
          </a>
          <div className="rule" />
        </div>
      ))}

      <div className="rule-double" />
    </div>
  );
}
