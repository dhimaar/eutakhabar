import type { EditorPick } from "@/lib/editor-picks";
import type { Language } from "@/lib/types";

interface Props {
  picks: EditorPick[];
  lang: Language;
}

export default function EditorPicks({ picks, lang }: Props) {
  if (picks.length === 0) return null;
  return (
    <div className="my-4">
      <div className="rule-bold" />
      <div className="text-[10px] tracking-[0.2em] text-[#DC143C] font-bold uppercase py-1">
        {lang === "en" ? "EDITOR'S PICK" : "सम्पादकको छनोट"}
      </div>
      <div className="rule" />
      {picks.map((p, i) => (
        <div key={i}>
          <a
            href={p.url}
            rel="noopener noreferrer"
            className="block py-2 hover:text-[#DC143C] transition-colors"
          >
            <span className="text-[10px] tracking-[0.15em] text-[#777] font-bold mr-2">
              {p.label ?? "LINK"}
            </span>
            <span className="text-base sm:text-lg font-semibold leading-snug">
              {lang === "en" ? p.en : p.ne || p.en}
            </span>
          </a>
          {i < picks.length - 1 && <div className="rule" />}
        </div>
      ))}
      <div className="rule-bold" />
    </div>
  );
}
