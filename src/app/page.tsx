import { cookies } from "next/headers";
import { readCache } from "@/lib/cache";
import { runPipeline } from "@/lib/pipeline";
import type { SiteContent, Language } from "@/lib/types";
import HeadlineFeed from "@/components/HeadlineFeed";

export const revalidate = 1800;
export const maxDuration = 300;

// Module-level promise lock — all concurrent cold-start requests await the
// same pipeline run instead of stampeding the upstream APIs.
let coldStartPromise: Promise<SiteContent> | null = null;

export default async function HomePage() {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get("lang")?.value;
  const initialLang: Language = langCookie === "ne" ? "ne" : "en";

  let content = readCache();

  // Cold-start safety net: if cache is missing (e.g. fresh Cloud Run revision),
  // run the pipeline inline so the first visitor doesn't see a "loading" page.
  // Subsequent requests read from cache. Cron keeps it fresh after that.
  if (!content) {
    try {
      if (!coldStartPromise) {
        console.log("[Page] No cache found, running pipeline inline...");
        coldStartPromise = runPipeline().finally(() => {
          coldStartPromise = null;
        });
      } else {
        console.log("[Page] Pipeline already running, awaiting existing run...");
      }
      content = await coldStartPromise;
    } catch (error) {
      console.error("[Page] Inline pipeline run failed:", error);
    }
  }

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
      lastUpdated={content.lastUpdated}
      initialLang={initialLang}
    />
  );
}
