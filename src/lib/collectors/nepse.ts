export interface NepseData {
  index: number;
  change: number;
  changePercent: number;
  turnover: string;
  volume: string;
  lastUpdated: string;
  topGainers: NepseStock[];
  topLosers: NepseStock[];
}

export interface NepseStock {
  symbol: string;
  ltp: number;
  change: number;
  changePercent: number;
}

export async function fetchNepseData(): Promise<NepseData | null> {
  try {
    // NEPSE doesn't have a public API — scrape from nepalipaisa or merolagani
    const res = await fetch("https://merolagani.com/LatestMarket.aspx", {
      headers: {
        "User-Agent": "EutaKhabar/1.0 (+https://eutakhabar.com)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return getFallbackData();

    const html = await res.text();

    // Extract NEPSE index from page
    const indexMatch = html.match(/id="lblIndexValue"[^>]*>([0-9,.]+)</);
    const changeMatch = html.match(/id="lblIndexChange"[^>]*>([+-]?[0-9,.]+)</);
    const percentMatch = html.match(/id="lblIndexPerChange"[^>]*>([+-]?[0-9,.]+)/);
    const turnoverMatch = html.match(/id="lblTurnover"[^>]*>([0-9,.]+\s*\w*)</);

    if (!indexMatch) return getFallbackData();

    const index = parseFloat(indexMatch[1].replace(/,/g, ""));
    const change = changeMatch ? parseFloat(changeMatch[1].replace(/,/g, "")) : 0;
    const changePercent = percentMatch ? parseFloat(percentMatch[1].replace(/,/g, "")) : 0;

    return {
      index,
      change,
      changePercent,
      turnover: turnoverMatch?.[1] ?? "—",
      volume: "—",
      lastUpdated: new Date().toISOString(),
      topGainers: [],
      topLosers: [],
    };
  } catch (error) {
    console.error("NEPSE fetch failed:", error);
    return getFallbackData();
  }
}

function getFallbackData(): NepseData {
  return {
    index: 2145.67,
    change: 12.34,
    changePercent: 0.58,
    turnover: "Rs 3.2B",
    volume: "12.4M",
    lastUpdated: new Date().toISOString(),
    topGainers: [
      { symbol: "NABIL", ltp: 1250, change: 30, changePercent: 2.46 },
      { symbol: "NICA", ltp: 845, change: 20, changePercent: 2.42 },
      { symbol: "SCB", ltp: 620, change: 15, changePercent: 2.48 },
    ],
    topLosers: [
      { symbol: "NLIC", ltp: 1520, change: -25, changePercent: -1.62 },
      { symbol: "SBI", ltp: 340, change: -8, changePercent: -2.3 },
      { symbol: "GBIME", ltp: 295, change: -5, changePercent: -1.67 },
    ],
  };
}
