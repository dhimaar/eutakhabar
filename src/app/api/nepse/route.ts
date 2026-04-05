import { NextResponse } from "next/server";
import { fetchNepseData } from "@/lib/collectors/nepse";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const data = await fetchNepseData();
  if (!data) {
    return NextResponse.json({ error: "Failed to fetch NEPSE data" }, { status: 502 });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
