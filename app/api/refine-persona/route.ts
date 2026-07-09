import { NextRequest, NextResponse } from "next/server";
import { sillage } from "@/lib/sillage-client";
import { loadJSON } from "@/lib/memory-store";
import { deriveCombinedPersona, type ClaudeAnalysis } from "@/lib/claude-client";

/**
 * Pushes Claude's REFINED, evidence-based avatars back to Sillage as ONE combined
 * persona, then launches a single keyword_detection agent carrying the union of
 * every avatar's fundable-moment triggers. This is the single, perfected push —
 * see "Mapping avatars -> ONE Sillage persona" in skills/avatar-synthesis/SKILL.md.
 *
 * Body (optional): { analysis?: ClaudeAnalysis; location?: string }
 * If analysis is omitted, uses the last saved analysis (data/latest_analysis.json).
 */
export async function POST(req: NextRequest) {
  try {
    let body: { analysis?: ClaudeAnalysis; location?: string } = {};
    try {
      body = await req.json();
    } catch {
      // fall back to saved analysis
    }

    let analysis = body.analysis;
    if (!analysis) {
      const saved = loadJSON<{ analysis: ClaudeAnalysis }>("latest_analysis");
      analysis = saved?.analysis;
    }
    if (!analysis) {
      return NextResponse.json(
        { error: "No analysis found. Run the Analyze step first." },
        { status: 400 }
      );
    }

    const log: string[] = [];

    // Collapse ALL avatars into ONE combined persona + the union of their triggers.
    const { persona, triggers } = deriveCombinedPersona(
      analysis,
      body.location ?? "Paris, France"
    );
    const keywords = persona.keywords ?? [];
    const industries = persona.industries ?? [];

    log.push(
      `Upserting combined persona: ${keywords.length} keywords, ${industries.length} industries.`
    );
    await sillage.upsertPersona(persona);
    log.push("Combined persona upserted.");

    function extractAgentId(res: unknown): number | undefined {
      const r = res as Record<string, unknown>;
      if (typeof r?.id === "number") return r.id;
      const d = r?.data as { id?: number } | { id?: number }[] | undefined;
      if (Array.isArray(d)) return d[0]?.id;
      if (d && typeof d === "object" && typeof d.id === "number") return d.id;
      return undefined;
    }

    // ONE keyword agent carrying every avatar's fundable-moment triggers.
    let refinedAgentId: number | undefined;
    if (triggers.length > 0) {
      log.push(`Creating combined keyword agent with ${triggers.length} triggers…`);
      const agent = await sillage.createAgent({
        type: "keyword_detection",
        name: "Mécénat — Fundable Moments",
        tracking_keywords: triggers,
      });
      refinedAgentId = extractAgentId(agent);
      log.push(`Keyword agent created (id=${refinedAgentId}).`);

      if (refinedAgentId) {
        try {
          const runs = await sillage.launchSignalRun(refinedAgentId, 90);
          const signalRequestId = runs?.[0]?.signal_request_id;
          log.push(
            signalRequestId
              ? `Signal run launched (request id=${signalRequestId}). Signals will populate shortly.`
              : "Signal run launched."
          );
        } catch (e) {
          log.push(`Signal run could not be launched: ${String(e)}`);
        }
      }
    } else {
      log.push("No triggers produced by analysis — skipped keyword agent.");
    }

    return NextResponse.json({
      ok: true,
      log,
      pushed_keywords: keywords,
      pushed_industries: industries,
      pushed_triggers: triggers,
      refined_agent_id: refinedAgentId,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
