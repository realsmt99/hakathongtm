import { NextResponse } from "next/server";
import { sillage } from "@/lib/sillage-client";
import type { ActivityItem } from "@/lib/claude-client";
import { saveJSON, loadJSON } from "@/lib/memory-store";
import { generateMockActivity } from "@/lib/mock-activity";
import type { LinkedInRow } from "@/lib/csv-parser";

/**
 * Pulls the REAL LinkedIn activity Sillage has surfaced for the tracked accounts:
 *  - get_contents  -> LinkedIn posts / comments (what people said)
 *  - list_signals  -> detected "raised-their-hand" events
 * Normalizes both into a flat ActivityItem[] ready for Claude analysis.
 */
export async function POST() {
  try {
    const log: string[] = [];

    log.push("Fetching LinkedIn contents from Sillage…");
    const contentsRes = await sillage.getContents(100);
    const contents = contentsRes?.data ?? [];
    log.push(`Got ${contents.length} content items.`);

    log.push("Fetching signals from Sillage…");
    let signals: { items?: unknown[] } | { data?: unknown[] } = {};
    try {
      signals = await sillage.listSignals(50) as unknown as { items?: unknown[] };
    } catch {
      log.push("No signals available yet (agents may still be running).");
    }
    const signalItems =
      (signals as { items?: unknown[] }).items ??
      (signals as { data?: unknown[] }).data ??
      [];
    log.push(`Got ${signalItems.length} signals.`);

    const activity: ActivityItem[] = [];

    for (const c of contents) {
      const text = c.data?.text?.trim();
      if (text) {
        activity.push({
          text,
          type: c.content_type,
          company: c.company_id ? `company#${c.company_id}` : undefined,
          author: c.lead_id ? `lead#${c.lead_id}` : undefined,
        });
      }
    }

    for (const s of signalItems as Record<string, unknown>[]) {
      const summary = (s.summary as string) || (s.signal_type as string);
      if (summary) {
        const lead = s.lead as { name?: string; title?: string } | undefined;
        const account = s.account as { name?: string } | undefined;
        activity.push({
          text: summary,
          type: `signal:${s.signal_type ?? "unknown"}`,
          company: account?.name,
          author: lead?.name,
        });
      }
    }

    log.push(`Normalized ${activity.length} real activity items.`);

    // Fallback: if Sillage has surfaced nothing yet, generate realistic mock
    // activity from the actual donors so the pipeline still has material.
    let mock = false;
    if (activity.length === 0) {
      const saved = loadJSON<{ rows: LinkedInRow[] }>("latest_rows");
      const rows = saved?.rows ?? [];
      if (rows.length > 0) {
        activity.push(...generateMockActivity(rows));
        mock = true;
        log.push(`No real activity yet — generated ${activity.length} MOCK items from ${rows.length} donors.`);
      } else {
        log.push("No real activity and no saved donors to mock from.");
      }
    }

    // Persist the raw harvest so analysis is reproducible.
    saveJSON("latest_harvest", { harvested_at: new Date().toISOString(), activity, mock });

    return NextResponse.json({
      ok: true,
      log,
      mock,
      content_count: contents.length,
      signal_count: signalItems.length,
      activity_count: activity.length,
      activity: activity.slice(0, 50),
      activity_full: activity,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
