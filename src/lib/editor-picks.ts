import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface EditorPick {
  en: string;
  ne: string;
  url: string;
  label?: string;
  imageUrl?: string;
}

export function loadEditorPicks(): EditorPick[] {
  const path = join(process.cwd(), "content", "editor-picks.json");
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw) as { picks?: EditorPick[] };
    return (data.picks ?? []).filter(
      (p) => p && typeof p.url === "string" && typeof p.en === "string"
    );
  } catch {
    return [];
  }
}
