import type { EditorPick } from "@/lib/editor-picks";
import type { Language } from "@/lib/types";

interface Props {
  picks: EditorPick[];
  lang: Language;
}

export default function EditorPicks({ picks, lang }: Props) {
  if (picks.length === 0) return null;
  return (
    <div className="my-2">
      {picks.map((p, i) => (
        <div key={i}>
          <a
            href={p.url}
            rel="noopener noreferrer"
            className="block py-2 hover:text-[#DC143C] transition-colors text-base sm:text-lg font-semibold leading-snug"
          >
            {lang === "en" ? p.en : p.ne || p.en}
          </a>
          {i < picks.length - 1 && <div className="rule" style={{ margin: "6px 0" }} />}
        </div>
      ))}
    </div>
  );
}
