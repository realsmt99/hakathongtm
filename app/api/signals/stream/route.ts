import { NextRequest } from "next/server";
import { loadJSON } from "@/lib/memory-store";
import { generateMockSignals } from "@/lib/mock-activity";
import type { LinkedInRow } from "@/lib/csv-parser";
import { streamLiveSignals, type UISignal } from "@/lib/signals-service";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function mockSignals(): UISignal[] {
  const saved = loadJSON<{ rows: LinkedInRow[] }>("latest_rows");
  return generateMockSignals(saved?.rows ?? []) as unknown as UISignal[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Server-Sent Events stream of signals, emitted ONE BY ONE so the dashboard
 * fills in live ("got one… got another…"). Events:
 *   - `signal` : a single UISignal JSON payload
 *   - `done`   : { count, mode, mock, cached, live_error? }
 *   - `error`  : { message }
 */
export async function GET(req: NextRequest) {
  const mode = (new URL(req.url).searchParams.get("mode") ?? "live").toLowerCase();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        if (mode === "mock") {
          const signals = mockSignals();
          for (const s of signals) {
            send("signal", s);
            await sleep(600); // deliberate cadence for the "arriving" feel
          }
          send("done", { count: signals.length, mode: "mock", mock: true, cached: false });
        } else {
          let n = 0;
          const result = await streamLiveSignals(async (s) => {
            send("signal", s);
            n++;
            // Fresh fetches already pace naturally (per-signal hydration); when
            // replaying from cache, add a small delay so it still streams in.
            await sleep(250);
          });
          send("done", {
            count: n,
            mode: "live",
            mock: false,
            cached: result.cached,
            ...(result.live_error ? { live_error: result.live_error } : {}),
          });
        }
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
