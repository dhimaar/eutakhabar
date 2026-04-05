import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { SiteContent } from "./types";

const CACHE_DIR = join(process.cwd(), ".cache");
const CACHE_FILE = join(CACHE_DIR, "headlines.json");

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function readCache(): SiteContent | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as SiteContent;
  } catch {
    return null;
  }
}

export function writeCache(content: SiteContent): void {
  ensureCacheDir();
  writeFileSync(CACHE_FILE, JSON.stringify(content, null, 2), "utf-8");
}

export function getCacheAge(): number | null {
  const cache = readCache();
  if (!cache?.lastUpdated) return null;
  return Date.now() - new Date(cache.lastUpdated).getTime();
}

export function isCacheStale(maxAgeMs: number = 30 * 60 * 1000): boolean {
  const age = getCacheAge();
  if (age === null) return true;
  return age > maxAgeMs;
}
