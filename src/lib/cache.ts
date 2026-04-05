import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { SiteContent } from "./types";

const CACHE_DIR = join(process.cwd(), ".cache");
const CACHE_FILE = join(CACHE_DIR, "headlines.json");

const GCS_BUCKET = "eutakhabar-cache";
const GCS_FILE = "headlines.json";

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function readCache(): SiteContent | null {
  // Always try local file first (fast)
  try {
    if (existsSync(CACHE_FILE)) {
      const raw = readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(raw) as SiteContent;
    }
  } catch { /* fall through */ }

  return null;
}

export async function readCacheWithFallback(): Promise<SiteContent | null> {
  // Try local first
  const local = readCache();
  if (local) return local;

  // In production, try GCS
  if (isProduction()) {
    try {
      const { Storage } = await import("@google-cloud/storage");
      const storage = new Storage();
      const [contents] = await storage.bucket(GCS_BUCKET).file(GCS_FILE).download();
      const data = JSON.parse(contents.toString()) as SiteContent;
      // Write to local for fast subsequent reads
      ensureCacheDir();
      writeFileSync(CACHE_FILE, contents.toString(), "utf-8");
      return data;
    } catch {
      return null;
    }
  }

  return null;
}

export async function writeCache(content: SiteContent): Promise<void> {
  const json = JSON.stringify(content, null, 2);

  // Always write local
  ensureCacheDir();
  writeFileSync(CACHE_FILE, json, "utf-8");

  // In production, also write to GCS for persistence across deploys
  if (isProduction()) {
    try {
      const { Storage } = await import("@google-cloud/storage");
      const storage = new Storage();
      await storage.bucket(GCS_BUCKET).file(GCS_FILE).save(json, {
        contentType: "application/json",
      });
    } catch (error) {
      console.error("[Cache] GCS write failed:", error);
    }
  }
}

export function getCacheAge(): number | null {
  const cache = readCache();
  if (!cache?.lastUpdated) return null;
  return Date.now() - new Date(cache.lastUpdated).getTime();
}

export function isCacheStale(maxAgeMs: number = 60 * 60 * 1000): boolean {
  const age = getCacheAge();
  if (age === null) return true;
  return age > maxAgeMs;
}
