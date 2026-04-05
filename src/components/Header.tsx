"use client";

import type { Language } from "@/lib/types";
import { getDateString } from "@/lib/i18n";
import { useState, useEffect } from "react";

interface HeaderProps {
  lang: Language;
  onLanguageChange: (lang: Language) => void;
}

export default function Header({ lang, onLanguageChange }: HeaderProps) {
  const [dateStr, setDateStr] = useState("");
  useEffect(() => { setDateStr(getDateString(lang)); }, [lang]);

  return (
    <header className="text-center mb-2">
      {/* Title */}
      <h1
        className="font-bold tracking-tight leading-none cursor-default text-5xl sm:text-6xl md:text-7xl"
        style={{
          fontFamily: "'Georgia', 'Times New Roman', serif",
          ...(lang === "ne" ? { fontSize: "clamp(3.5rem, 10vw, 5.5rem)" } : {}),
        }}
      >
        {lang === "en" ? (
          <>EUTA <span className="text-[#DC143C]">KHABAR</span></>
        ) : (
          <>एउटा <span className="text-[#DC143C]">खबर</span></>
        )}
      </h1>

      {/* Tagline + meta */}
      <div className="mt-2 flex items-center justify-center gap-3 text-xs text-[#777]">
        {dateStr && <span>{dateStr}</span>}
        <span>·</span>
        <button
          onClick={() => onLanguageChange(lang === "en" ? "ne" : "en")}
          className="hover:text-[#DC143C] transition-colors cursor-pointer font-bold"
        >
          {lang === "en" ? "नेपाली" : "English"}
        </button>
      </div>

      {/* Rules */}
      <div className="rule-bold mt-3" />
      <div className="rule mt-0" />
    </header>
  );
}
