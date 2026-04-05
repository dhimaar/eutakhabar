import puppeteer from "puppeteer";

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

// In-memory cache with timestamp
let cachedData: NepseData | null = null;
let cacheTime = 0;
const CACHE_TTL = 90_000; // 90 seconds

export async function fetchNepseData(): Promise<NepseData | null> {
  // Return cached if fresh
  if (cachedData && Date.now() - cacheTime < CACHE_TTL) {
    return cachedData;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Intercept API responses to capture JSON data directly
    let marketSummary: Record<string, unknown> | null = null;
    let topGainersData: Record<string, unknown>[] = [];
    let topLosersData: Record<string, unknown>[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      try {
        if (url.includes("/api/nots/market-summary") && !url.includes("history")) {
          const json = await response.json();
          marketSummary = json;
        }
        if (url.includes("top-gainers") || url.includes("topGainers")) {
          const json = await response.json();
          if (Array.isArray(json)) topGainersData = json;
        }
        if (url.includes("top-losers") || url.includes("topLosers")) {
          const json = await response.json();
          if (Array.isArray(json)) topLosersData = json;
        }
      } catch { /* not JSON */ }
    });

    await page.goto("https://nepalstock.com.np/live-market", {
      waitUntil: "networkidle2",
      timeout: 45000,
    });

    // Wait for market data to load
    await new Promise((r) => setTimeout(r, 5000));

    // If we didn't capture API response, fall back to DOM scraping
    let data: NepseData;

    if (marketSummary) {
      // Use captured API data
      const ms = marketSummary as Record<string, number | string>;
      data = {
        index: Number(ms.currentValue ?? ms.index ?? ms.nepseIndex ?? 0),
        change: Number(ms.change ?? ms.pointChange ?? 0),
        changePercent: Number(ms.perChange ?? ms.percentageChange ?? ms.changePercent ?? 0),
        turnover: ms.turnover ? `Rs ${Number(ms.turnover).toLocaleString()}` : "—",
        volume: ms.volume ? String(ms.volume) : "—",
        lastUpdated: new Date().toISOString(),
        topGainers: topGainersData.slice(0, 5).map(mapStock),
        topLosers: topLosersData.slice(0, 5).map(mapStock),
      };
    } else {
      // DOM scraping fallback
      const scraped = await page.evaluate(() => {
        const text = document.body.innerText;

        let index = 0;
        let change = 0;
        let changePercent = 0;
        let turnover = "—";

        // NEPSE index is usually the first large number on the page
        const allNums = text.match(/[\d,]+\.\d{2}/g) ?? [];
        for (const n of allNums) {
          const val = parseFloat(n.replace(/,/g, ""));
          if (val > 1000 && val < 10000) {
            index = val;
            break;
          }
        }

        // Look for change values near "NEPSE" or "Index"
        const nepseSection = text.match(/NEPSE[\s\S]{0,200}/i)?.[0] ?? "";
        const changes = nepseSection.match(/[+-]?\d+\.\d{2}/g) ?? [];
        if (changes[0]) change = parseFloat(changes[0]);
        if (changes[1]) changePercent = parseFloat(changes[1]);

        // Turnover
        const turnoverMatch = text.match(/turnover[:\s]*([\d,.]+\s*(?:Ar|Cr|B|M)?)/i);
        if (turnoverMatch) turnover = `Rs ${turnoverMatch[1]}`;

        return { index, change, changePercent, turnover };
      });

      data = {
        ...scraped,
        volume: "—",
        lastUpdated: new Date().toISOString(),
        topGainers: [],
        topLosers: [],
      };
    }

    await browser.close();
    browser = undefined;

    if (data.index === 0) {
      console.error("[NEPSE] Failed to extract index from nepalstock.com.np");
      return cachedData; // Return stale cache
    }

    cachedData = data;
    cacheTime = Date.now();
    console.log(`[NEPSE] Index: ${data.index}, Change: ${data.change} (${data.changePercent}%)`);
    return data;
  } catch (error) {
    console.error("[NEPSE] Fetch failed:", error);
    if (browser) await browser.close();
    return cachedData; // Return stale cache on error
  }
}

function mapStock(s: Record<string, unknown>): NepseStock {
  return {
    symbol: String(s.symbol ?? s.securityName ?? ""),
    ltp: Number(s.ltp ?? s.lastTradedPrice ?? s.closingPrice ?? 0),
    change: Number(s.change ?? s.pointChange ?? 0),
    changePercent: Number(s.perChange ?? s.percentageChange ?? s.changePercent ?? 0),
  };
}
