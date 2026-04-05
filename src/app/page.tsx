import { cookies } from "next/headers";
import { readCache } from "@/lib/cache";
import HeadlineFeed from "@/components/HeadlineFeed";
import { fetchNepseData } from "@/lib/collectors/nepse";
import type { Language } from "@/lib/types";

export const revalidate = 1800;

export default async function HomePage() {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get("lang")?.value;
  const initialLang: Language = langCookie === "ne" ? "ne" : "en";

  let content = readCache();
  if (!content) {
    const { runPipeline } = await import("@/lib/pipeline");
    content = await runPipeline();
  }
  const nepse = await fetchNepseData();

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
