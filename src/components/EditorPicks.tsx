import type { EditorPick } from "@/lib/editor-picks";
import type { Language } from "@/lib/types";

interface Props {
  picks: EditorPick[];
  lang: Language;
}

export default function EditorPicks({ picks, lang }: Props) {
  if (picks.length === 0) return null;
  return (
    <>
      <div className="rule" style={{ margin: "6px 0" }} />
      {picks.map((p, i) => (
        <div key={i}>
          <div className="text-center py-1">
            <a
              href={p.url}
              rel="noopener noreferrer"
              className="headline-link group inline-block"
            >
              <span className={`group-hover:text-[#DC143C] transition-colors leading-snug text-base sm:text-lg text-[#e0e0e0]`}>
                {lang === "en" ? p.en : p.ne || p.en}
              </span>
            </a>
          </div>
          <div className="rule" style={{ margin: "6px 0" }} />
        </div>
      ))}
    </>
  );
}
