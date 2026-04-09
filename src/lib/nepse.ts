import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface NepseStock {
  symbol: string;
  ltp: number;
  change: number;
  changePercent: number;
}

export interface NepseData {
  index: number;
  change: number;
  changePercent: number;
  turnover: string;
  volume: string;
  lastUpdated: string;
  topGainers: NepseStock[];
  topLosers: NepseStock[];
  marketStatus?: "OPEN" | "CLOSED";
  stale?: boolean;
}

const CACHE_DIR = join(process.cwd(), ".cache");
const CACHE_FILE = join(CACHE_DIR, "nepse.json");
const UA = "Mozilla/5.0 (compatible; EutaKhabar/1.0)";

function readDiskCache(): NepseData | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as NepseData;
  } catch {
    return null;
  }
}

function writeDiskCache(data: NepseData): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch {}
}

function isNepseHours(): boolean {
  const now = new Date();
  const nptMinutes =
    now.getUTCHours() * 60 + now.getUTCMinutes() + 5 * 60 + 45;
  const nptHour = Math.floor((nptMinutes % 1440) / 60);
  const nptDay = now.getUTCDay();
  if (nptDay === 5 || nptDay === 6) return false;
  return nptHour >= 11 && nptHour < 15;
}

function cacheTTL(): number {
  return isNepseHours() ? 90_000 : 15 * 60_000;
}

// ---- Upstream fetchers ----

interface NpStock {
  stockSymbol: string;
  closingPrice: number;
  previousClosing: number;
  differenceRs: number;
  percentChange: number;
  volume: number;
  noOfTransactions: number;
}

async function fetchStocks(): Promise<NpStock[]> {
  const res = await fetch("https://nepalipaisa.com/api/GetStockLive", {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`stocks ${res.status}`);
  const json = (await res.json()) as { result?: { stocks?: NpStock[] } };
  return json.result?.stocks ?? [];
}

async function fetchMarketStatus(): Promise<"OPEN" | "CLOSED" | undefined> {
  try {
    const res = await fetch("https://nepalipaisa.com/api/GetMarketStatus", {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      result?: { marketStatus?: string };
    };
    const s = json.result?.marketStatus?.toUpperCase();
    if (s === "OPEN" || s === "CLOSED") return s;
    return undefined;
  } catch {
    return undefined;
  }
}

interface IndexSnapshot {
  index: number;
  change: number;
  changePercent: number;
}

async function fetchIndexFromSharesansar(): Promise<IndexSnapshot | null> {
  try {
    const res = await fetch("https://www.sharesansar.com/", {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(
      /NEPSE Index closed at ([\d,]+\.\d+),\s*(up|down)\s+([\d,]+\.\d+)\s*points\s*\(([\d.]+)%\)/i
    );
    if (!m) return null;
    const index = parseFloat(m[1].replace(/,/g, ""));
    const dir = m[2].toLowerCase() === "up" ? 1 : -1;
    const change = dir * parseFloat(m[3].replace(/,/g, ""));
    const changePercent = dir * parseFloat(m[4]);
    if (isNaN(index)) return null;
    return { index, change, changePercent };
  } catch {
    return null;
  }
}

function computeMovers(stocks: NpStock[]): {
  gainers: NepseStock[];
  losers: NepseStock[];
} {
  const traded = stocks.filter((s) => (s.volume ?? 0) > 0);
  const toStock = (s: NpStock): NepseStock => ({
    symbol: s.stockSymbol,
    ltp: s.closingPrice,
    change: s.differenceRs,
    changePercent: s.percentChange,
  });
  const gainers = [...traded]
    .sort((a, b) => b.percentChange - a.percentChange)
    .slice(0, 3)
    .map(toStock);
  const losers = [...traded]
    .sort((a, b) => a.percentChange - b.percentChange)
    .slice(0, 3)
    .map(toStock);
  return { gainers, losers };
}

// ---- Public ----

export async function getNepseData(): Promise<NepseData | null> {
  const cached = readDiskCache();
  if (cached) {
    const age = Date.now() - new Date(cached.lastUpdated).getTime();
    if (age < cacheTTL()) return cached;
  }

  try {
    const [stocksRes, statusRes, indexRes] = await Promise.allSettled([
      fetchStocks(),
      fetchMarketStatus(),
      fetchIndexFromSharesansar(),
    ]);

    const stocks = stocksRes.status === "fulfilled" ? stocksRes.value : [];
    const marketStatus =
      statusRes.status === "fulfilled" ? statusRes.value : undefined;
    const snap = indexRes.status === "fulfilled" ? indexRes.value : null;

    if (stocks.length === 0 && !snap) {
      return cached ? { ...cached, stale: true } : null;
    }

    const { gainers, losers } = computeMovers(stocks);

    const data: NepseData = {
      index: snap?.index ?? cached?.index ?? 0,
      change: snap?.change ?? cached?.change ?? 0,
      changePercent: snap?.changePercent ?? cached?.changePercent ?? 0,
      turnover: "—",
      volume: "—",
      lastUpdated: new Date().toISOString(),
      topGainers: gainers.length > 0 ? gainers : cached?.topGainers ?? [],
      topLosers: losers.length > 0 ? losers : cached?.topLosers ?? [],
      marketStatus,
      stale: false,
    };

    writeDiskCache(data);
    return data;
  } catch (err) {
    console.error("[nepse] fetch failed:", err);
    return cached ? { ...cached, stale: true } : null;
  }
}
