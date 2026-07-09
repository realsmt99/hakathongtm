import { NextRequest, NextResponse } from "next/server";
import { loadJSON } from "@/lib/memory-store";
import { generateMockSignals } from "@/lib/mock-activity";
import type { LinkedInRow } from "@/lib/csv-parser";
import { streamLiveSignals } from "@/lib/signals-service";

// Per-signal hydration is sequential and can take a while — give the route room
// and never cache the HTTP response (we cache the data ourselves).
export const maxDuration = 120;
export const dynamic = "force-dynamic";

function mockSignals() {
  const saved = loadJSON<{ rows: LinkedInRow[] }>("latest_rows");
  const rows = saved?.rows ?? [];
  return generateMockSignals(rows);
}

/**
 * Signals feed (batch). Prefer the SSE endpoint (/api/signals/stream) for the
 * realtime dashboard; this remains for a simple one-shot fetch.
 *
 * ?mode=live (default) → real Sillage signals (cached ~5min). On live error we
 *   fall back to the last good cache, else return empty with `live_error`.
 * ?mode=mock → realistic sample prospects, contact-less until enrichment.
 */
export async function GET(req: NextRequest) {
  const mode = (new URL(req.url).searchParams.get("mode") ?? "live").toLowerCase();

  if (mode === "mock") {
    const mock = mockSignals();
    return NextResponse.json({ ok: true, mode: "mock", mock: true, count: mock.length, signals: mock });
  }

  try {
    const { signals, cached, live_error } = await streamLiveSignals();
    return NextResponse.json({
      ok: true,
      mode: "live",
      mock: false,
      cached,
      count: signals.length,
      signals,
      ...(live_error ? { live_error } : {}),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
