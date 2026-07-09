import { NextRequest, NextResponse } from "next/server";
import { analyzeInterests, type ActivityItem, type ClaudeAnalysis } from "@/lib/claude-client";
import { saveJSON, loadJSON } from "@/lib/memory-store";

/**
 * Takes harvested LinkedIn activity, sends it to Claude for summarization/analysis,
 * gets back refined evidence-based avatars, and persists them.
 *
 * Body (optional): { activity?: ActivityItem[]; seedAvatars?: [...]; seedIndustries?: [...] }
 * If activity is omitted, uses the last saved harvest (data/latest_harvest.json).
 */
export async function POST(req: NextRequest) {
  try {
    let body: {
      activity?: ActivityItem[];
      seedAvatars?: { label: string; dominantIndustry: string; seniority: string }[];
      seedIndustries?: string[];
    } = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine — fall back to saved harvest
    }

    let activity = body.activity;
    if (!activity || activity.length === 0) {
      const saved = loadJSON<{ activity: ActivityItem[] }>("latest_harvest");
      activity = saved?.activity ?? [];
    }

    if (activity.length === 0) {
      return NextResponse.json(
        { error: "No activity to analyze. Run the Harvest step first." },
        { status: 400 }
      );
    }

    const analysis: ClaudeAnalysis = await analyzeInterests(activity, {
      seedAvatars: body.seedAvatars,
      seedIndustries: body.seedIndustries,
    });

    const record = {
      analyzed_at: new Date().toISOString(),
      source_activity_count: activity.length,
      analysis,
    };
    saveJSON("latest_analysis", record);

    return NextResponse.json({
      ok: true,
      analyzed_count: activity.length,
      analysis,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
