import { cookies } from "next/headers";
import { readCache, readCacheWithFallback } from "@/lib/cache";
import HeadlineFeed from "@/components/HeadlineFeed";
import { fetchNepseData } from "@/lib/collectors/nepse";
import type { Language } from "@/lib/types";

export const revalidate = 1800;

export default async function HomePage() {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get("lang")?.value;
  const initialLang: Language = langCookie === "ne" ? "ne" : "en";

  const content = readCache() ?? await readCacheWithFallback();
  const nepse = await fetchNepseData();

  if (!content) {
    return (
      <div className="text-center py-20 text-[#777]">
        <h1 className="text-4xl font-bold mb-4" style={{ fontFamily: "'Georgia', serif" }}>
          EUTA <span className="text-[#DC143C]">KHABAR</span>
        </h1>
        <p className="text-sm">Headlines loading — first refresh in progress...</p>
      </div>
    );
  }

  return (
    <HeadlineFeed
      breaking={content.breaking}
      topStories={content.topStories}
      headlines={content.headlines}
      nepse={nepse}
      lastUpdated={content.lastUpdated}
      initialLang={initialLang}
    />
  );
}
