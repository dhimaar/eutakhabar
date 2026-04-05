"use client";

import type { Language } from "@/lib/types";

interface FooterProps {
  lang: Language;
  lastUpdated: string;
}

const SOURCES = [
  { name: "Setopati", url: "https://setopati.com" },
  { name: "OnlineKhabar", url: "https://www.onlinekhabar.com" },
  { name: "eKantipur", url: "https://ekantipur.com" },
  { name: "Himalayan Times", url: "https://thehimalayantimes.com" },
  { name: "Kathmandu Post", url: "https://kathmandupost.com" },
  { name: "RONB", url: "https://www.ronbpost.com" },
  { name: "MyRepublica", url: "https://myrepublica.nagariknetwork.com" },
  { name: "HimalKhabar", url: "https://himalkhabar.com" },
  { name: "Nepali Times", url: "https://nepalitimes.com" },
  { name: "Annapurna Post", url: "https://annapurnapost.com" },
  { name: "Gorkhapatra", url: "https://gorkhapatraonline.com" },
  { name: "NepalCheck", url: "https://nepalcheck.org" },
  { name: "Shilapatra", url: "https://shilapatra.com" },
];

export default function Footer({ lang }: FooterProps) {
  return (
    <footer className="text-center mt-8 pb-6">
      <div className="rule-double" />

      <div className="text-[10px] text-[#555] tracking-wider mt-4">
        {SOURCES.map((s, i) => (
          <span key={s.url}>
            {i > 0 && " · "}
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#DC143C] transition-colors"
            >
              {s.name}
            </a>
          </span>
        ))}
      </div>

      <p className="text-[10px] text-[#444] mt-3 tracking-wider">
        © {new Date().getFullYear()} EUTAKHABAR.COM
      </p>
    </footer>
  );
}
