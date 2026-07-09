import { NextRequest, NextResponse } from "next/server";
import { sillage } from "@/lib/sillage-client";
import type { ICPOutput } from "@/lib/icp-synthesizer";
import type { LinkedInRow } from "@/lib/csv-parser";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { icp: ICPOutput; rows: LinkedInRow[] };

    if (!body.icp || !body.rows) {
      return NextResponse.json({ error: "Body must include 'icp' and 'rows'." }, { status: 400 });
    }

    const { icp, rows } = body;
    const log: string[] = [];

    const persona = icp.sillage_feed_parameters.persona;
    log.push(`Upserting persona: ${persona.job_title} @ ${persona.location}`);
    await sillage.upsertPersona({
      job_title: persona.job_title,
      location: persona.location,
      keywords: persona.keywords,
      industries: persona.industries,
      seniority_levels: persona.seniority_levels,
    });
    log.push("Persona upserted.");

    const uniqueCompanies = [...new Set(rows.map((r) => r.company).filter(Boolean))];
    const accounts = uniqueCompanies.slice(0, 50).map((name) => ({ name }));
    log.push(`Pushing ${accounts.length} companies as top accounts...`);
    await sillage.addTopAccounts(accounts);
    log.push("Accounts pushed. Polling ingestion status...");

    // Ingestion on Sillage's side can take several minutes. We do NOT block the
    // HTTP request on it — poll a couple of times quickly, then continue. Agents
    // can be created while ingestion runs in the background.
    let ingestionStatus;
    try {
      ingestionStatus = await sillage.pollIngestionUntilDone(3000, 2);
      log.push(`Ingestion status: ${ingestionStatus.state} (resolved ${ingestionStatus.resolved}/${ingestionStatus.total})`);
    } catch {
      log.push("Ingestion still processing in background — continuing with agent creation.");
      ingestionStatus = { state: "processing", total: accounts.length, resolved: 0, failed: 0 };
    }

    log.push("Creating signal detection agents...");
    const agentsCreated: { id: unknown; name: string; type: string }[] = [];

    function extractAgentId(res: unknown): number | undefined {
      const r = res as Record<string, unknown>;
      if (typeof r?.id === "number") return r.id;
      const data = r?.data as { id?: number } | { id?: number }[] | undefined;
      if (Array.isArray(data)) return data[0]?.id;
      if (data && typeof data === "object" && typeof data.id === "number") return data.id;
      return undefined;
    }

    const jobUpdateAgent = await sillage.createAgent({
      type: "job_update",
      name: "GTM Donor Job Moves",
    });
    const jobId = extractAgentId(jobUpdateAgent);
    agentsCreated.push({ id: jobId, name: "GTM Donor Job Moves", type: "job_update" });
    log.push(`Created job_update agent (id=${jobId}).`);

    const keywordAgent = await sillage.createAgent({
      type: "keyword_detection",
      name: "GTM Donor Keyword Monitor",
      tracking_keywords: icp.sillage_feed_parameters.high_intent_triggers.slice(0, 10),
    });
    const kwId = extractAgentId(keywordAgent);
    agentsCreated.push({ id: kwId, name: "GTM Donor Keyword Monitor", type: "keyword_detection" });
    log.push(`Created keyword_detection agent (id=${kwId}).`);

    const setupState = await sillage.getSetupState();
    log.push(`Setup state: persona=${setupState.persona_set}, accounts=${setupState.list_uploaded}, ingestion=${setupState.ingestion_complete}`);

    return NextResponse.json({
      ok: true,
      log,
      persona_upserted: persona,
      accounts_pushed: accounts.length,
      ingestion_status: ingestionStatus,
      agents_created: agentsCreated,
      setup_state: setupState,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
