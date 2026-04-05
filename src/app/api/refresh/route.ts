import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<NextResponse> {
  // Verify cron secret to prevent unauthorized access
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const providedSecret =
      authHeader?.replace("Bearer ", "") ??
      new URL(request.url).searchParams.get("secret");

    if (providedSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const content = await runPipeline();

    return NextResponse.json({
      success: true,
      headlines: content.headlines.length,
      hasBreaking: !!content.breaking,
      topStories: content.topStories.length,
      lastUpdated: content.lastUpdated,
    });
  } catch (error) {
    console.error("[API] Refresh failed:", error);
    return NextResponse.json(
      { error: "Pipeline failed", message: String(error) },
      { status: 500 }
    );
  }
}
