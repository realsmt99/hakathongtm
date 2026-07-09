import { NextResponse } from "next/server";
import { loadRuns } from "@/lib/memory-store";

export async function GET() {
  try {
    const runs = loadRuns();
    return NextResponse.json({ ok: true, runs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
