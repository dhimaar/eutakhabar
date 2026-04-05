import { readFileSync } from "fs";
import { join } from "path";
import type { SourceConfig } from "./types";

let cachedSources: SourceConfig[] | null = null;

export function getSources(): SourceConfig[] {
  if (cachedSources) return cachedSources;

  const filePath = join(process.cwd(), "content", "sources.json");
  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as { sources: SourceConfig[] };

  cachedSources = data.sources.filter((s) => s.enabled);
  return cachedSources;
}

export function getSourcesByType(type: SourceConfig["type"]): SourceConfig[] {
  return getSources().filter((s) => s.type === type);
}

export function getSourceWeight(sourceId: string): number {
  const source = getSources().find((s) => s.id === sourceId);
  return source?.weight ?? 1.0;
}

export function getSourceCategories(sourceId: string): SourceConfig["categories"] {
  const source = getSources().find((s) => s.id === sourceId);
  return source?.categories ?? ["general"];
}

export function clearSourceCache(): void {
  cachedSources = null;
}
