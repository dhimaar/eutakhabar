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

interface Weather {
  ktm: number | null;
  jnk: number | null;
}

const NE_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];
function toNepaliDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => NE_DIGITS[Number(d)]);
}
function formatTemp(t: number | null, lang: Language): string {
  if (t === null) return "—";
  return lang === "ne" ? `${toNepaliDigits(t)}°से` : `${t}°C`;
}

async function fetchWeather(): Promise<Weather> {
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=27.7172,26.7288&longitude=85.3240,85.9266&current=temperature_2m&timezone=Asia/Kathmandu";
    const res = await fetch(url);
    if (!res.ok) throw new Error("weather fetch failed");
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [data];
    return {
      ktm: Math.round(arr[0]?.current?.temperature_2m ?? NaN) || null,
      jnk: Math.round(arr[1]?.current?.temperature_2m ?? NaN) || null,
    };
  } catch {
    return { ktm: null, jnk: null };
  }
}

export default function Header({ lang, onLanguageChange }: HeaderProps) {
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [weather, setWeather] = useState<Weather>({ ktm: null, jnk: null });

  useEffect(() => {
    setDateStr(getNepalDate(lang));
    setTimeStr(getNepalTime());
    fetchWeather().then(setWeather);

    const interval = setInterval(() => {
      setTimeStr(getNepalTime());
    }, 1000);
    const weatherInterval = setInterval(() => {
      fetchWeather().then(setWeather);
    }, 15 * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearInterval(weatherInterval);
    };
  }, [lang]);

  return (
    <header className="text-center mb-2">
      {/* Title */}
      <div className="flex items-center justify-center">
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
        {(weather.ktm !== null || weather.jnk !== null) && (
          <>
            <span>·</span>
            <span className="tabular-nums">
              {lang === "en" ? "KTM" : "काठमाडौं"} {formatTemp(weather.ktm, lang)}
            </span>
            <span>·</span>
            <span className="tabular-nums">
              {lang === "en" ? "JNK" : "जनकपुर"} {formatTemp(weather.jnk, lang)}
            </span>
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
