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

interface CityWeather {
  temp: number | null;
  code: number | null;
}
interface Weather {
  ktm: CityWeather;
  jnk: CityWeather;
}

const NE_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];
function toNepaliDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => NE_DIGITS[Number(d)]);
}
function formatTemp(t: number | null, lang: Language): string {
  if (t === null) return "—";
  // Nepali: digits in Devanagari, °C kept in Latin per user preference
  return lang === "ne" ? `${toNepaliDigits(t)}°C` : `${t}°C`;
}

// Open-Meteo WMO weather codes → emoji icon
// https://open-meteo.com/en/docs (weather_code section)
function weatherIcon(code: number | null): string {
  if (code === null) return "";
  if (code === 0) return "☀️"; // clear
  if (code === 1 || code === 2) return "🌤️"; // mainly/partly clear
  if (code === 3) return "☁️"; // overcast
  if (code === 45 || code === 48) return "🌫️"; // fog
  if (code >= 51 && code <= 57) return "🌦️"; // drizzle
  if (code >= 61 && code <= 67) return "🌧️"; // rain
  if (code >= 71 && code <= 77) return "❄️"; // snow
  if (code >= 80 && code <= 82) return "🌧️"; // rain showers
  if (code >= 85 && code <= 86) return "🌨️"; // snow showers
  if (code >= 95 && code <= 99) return "⛈️"; // thunderstorm
  return "";
}

async function fetchWeather(): Promise<Weather> {
  const empty: Weather = {
    ktm: { temp: null, code: null },
    jnk: { temp: null, code: null },
  };
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=27.7172,26.7288&longitude=85.3240,85.9266&current=temperature_2m,weather_code&timezone=Asia/Kathmandu";
    const res = await fetch(url);
    if (!res.ok) throw new Error("weather fetch failed");
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [data];
    const parse = (i: number): CityWeather => {
      const t = arr[i]?.current?.temperature_2m;
      const c = arr[i]?.current?.weather_code;
      return {
        temp: typeof t === "number" ? Math.round(t) : null,
        code: typeof c === "number" ? c : null,
      };
    };
    return { ktm: parse(0), jnk: parse(1) };
  } catch {
    return empty;
  }
}

export default function Header({ lang, onLanguageChange }: HeaderProps) {
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [weather, setWeather] = useState<Weather>({
    ktm: { temp: null, code: null },
    jnk: { temp: null, code: null },
  });

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
        {(weather.ktm.temp !== null || weather.jnk.temp !== null) && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <span className="text-[#999] font-medium">
                {lang === "en" ? "KTM" : "काठमाडौं"}
              </span>
              {weather.ktm.code !== null && (
                <span aria-hidden className="text-sm leading-none">
                  {weatherIcon(weather.ktm.code)}
                </span>
              )}
              <span className="text-[#e8e8e3]">{formatTemp(weather.ktm.temp, lang)}</span>
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <span className="text-[#999] font-medium">
                {lang === "en" ? "JNK" : "जनकपुर"}
              </span>
              {weather.jnk.code !== null && (
                <span aria-hidden className="text-sm leading-none">
                  {weatherIcon(weather.jnk.code)}
                </span>
              )}
              <span className="text-[#e8e8e3]">{formatTemp(weather.jnk.temp, lang)}</span>
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
