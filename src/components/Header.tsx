"use client";

import type { Language } from "@/lib/types";
import { getDateString } from "@/lib/i18n";
import { useState, useEffect } from "react";

interface HeaderProps {
  lang: Language;
  onLanguageChange: (lang: Language) => void;
}

function getNepalTime(): string {
  const now = new Date();
  return now.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kathmandu",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function getNepalDate(lang: Language): string {
  // Pass a Nepal-timezone date to getDateString
  const nptStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
  const nptDate = new Date(nptStr + "T00:00:00");
  return getDateString(lang, nptDate);
}

export default function Header({ lang, onLanguageChange }: HeaderProps) {
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    setDateStr(getNepalDate(lang));
    setTimeStr(getNepalTime());

    const interval = setInterval(() => {
      setTimeStr(getNepalTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [lang]);

  return (
    <header className="text-center mb-2">
      {/* Logo + Title */}
      <div className="flex items-center justify-center gap-3 sm:gap-4">
        <img
          src="/logo-mark.svg"
          alt=""
          className="h-12 sm:h-14 md:h-16 w-auto"
          aria-hidden="true"
        />
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
      </div>

      {/* Date + Clock + Language */}
      <div className="mt-2 flex items-center justify-center gap-3 text-xs text-[#777]">
        {dateStr && <span>{dateStr}</span>}
        {timeStr && (
          <>
            <span>·</span>
            <span className="tabular-nums">{timeStr}</span>
          </>
        )}
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
