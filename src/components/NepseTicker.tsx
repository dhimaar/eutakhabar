"use client";

import { useState, useEffect } from "react";
import type { Language } from "@/lib/types";
import type { NepseData } from "@/lib/collectors/nepse";

interface NepseTickerProps {
  data: NepseData | null;
  lang: Language;
}

function isNepseHours(): boolean {
  // NEPSE trades Sun-Thu, 11:00-15:00 Nepal time (UTC+5:45)
  const now = new Date();
  const nptOffset = 5 * 60 + 45; // minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nptMinutes = utcMinutes + nptOffset;
  const nptHour = Math.floor((nptMinutes % 1440) / 60);
  const nptDay = now.getUTCDay(); // 0=Sun

  // Sun=0, Mon=1, Tue=2, Wed=3, Thu=4 are trading days
  // Fri=5, Sat=6 are off
  if (nptDay === 5 || nptDay === 6) return false;
  return nptHour >= 11 && nptHour < 15;
}

export default function NepseTicker({ data: initialData, lang }: NepseTickerProps) {
  const [data, setData] = useState<NepseData | null>(initialData);

  useEffect(() => {
    if (!isNepseHours()) return;

    const interval = setInterval(async () => {
      if (!isNepseHours()) return;
      try {
        const res = await fetch("/api/nepse");
        if (res.ok) {
          const fresh = await res.json();
          setData(fresh);
        }
      } catch { /* silent */ }
    }, 90_000);

    return () => clearInterval(interval);
  }, []);

  if (!data) return null;

  const isPositive = data.change >= 0;
  const color = isPositive ? "#22c55e" : "#ef4444";
  const arrow = isPositive ? "▲" : "▼";

  return (
    <div className="text-center my-4">
      <div className="text-xs font-bold tracking-[0.3em] text-[#777] uppercase mb-2">
        {lang === "en" ? "NEPSE INDEX" : "नेप्से सूचकांक"}
      </div>
      <div className="text-3xl font-bold text-white">
        {data.index.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        <span className="text-lg ml-3" style={{ color }}>
          {arrow} {Math.abs(data.change).toFixed(2)} ({isPositive ? "+" : ""}{data.changePercent.toFixed(2)}%)
        </span>
      </div>

      {/* Gainers / Losers — compact inline */}
      {(data.topGainers.length > 0 || data.topLosers.length > 0) && (
        <div className="mt-3 flex justify-center gap-8 text-xs">
          {data.topGainers.length > 0 && (
            <div>
              <span className="text-[#22c55e] font-bold">GAINERS: </span>
              {data.topGainers.slice(0, 3).map((s, i) => (
                <span key={s.symbol} className="text-[#777]">
                  {i > 0 && " · "}
                  <span className="text-white">{s.symbol}</span>{" "}
                  <span className="text-[#22c55e]">+{s.changePercent.toFixed(1)}%</span>
                </span>
              ))}
            </div>
          )}
          {data.topLosers.length > 0 && (
            <div>
              <span className="text-[#ef4444] font-bold">LOSERS: </span>
              {data.topLosers.slice(0, 3).map((s, i) => (
                <span key={s.symbol} className="text-[#777]">
                  {i > 0 && " · "}
                  <span className="text-white">{s.symbol}</span>{" "}
                  <span className="text-[#ef4444]">{s.changePercent.toFixed(1)}%</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rule mt-4" />
    </div>
  );
}
