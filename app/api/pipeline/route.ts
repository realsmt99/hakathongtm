import { NextRequest, NextResponse } from "next/server";
import { parseLinkedInCSV } from "@/lib/csv-parser";
import { synthesizeICP } from "@/lib/icp-synthesizer";
import { sillage } from "@/lib/sillage-client";
import { saveRun } from "@/lib/memory-store";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const run_id = randomUUID();
  const stages: Record<string, unknown> = {};
  const errors: string[] = [];

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded. Use multipart field name 'file'." }, { status: 400 });
    }

    const csvText = await (file as File).text();
    const filename = (file as File).name;

    // ── Stage 1: Parse CSV ──────────────────────────────────────────────────
    const parsed = parseLinkedInCSV(csvText);
    stages.upload = {
      filename,
      total_raw: parsed.totalRaw,
      valid_rows: parsed.rows.length,
      skipped: parsed.skipped,
      warnings: parsed.warnings,
    };

    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: "CSV has no valid rows.", stages }, { status: 400 });
    }

    // ── Stage 2: Enrich each donor via Sillage get_lead ─────────────────────
    const enrichedLeads: unknown[] = [];
    for (const row of parsed.rows.slice(0, 20)) {
      if (!row.linkedinUrl) continue;
      try {
        const lead = await sillage.getLead(row.linkedinUrl);
        enrichedLeads.push({ ...row, sillage_lead: lead });
      } catch {
        enrichedLeads.push({ ...row, sillage_lead: null });
      }
    }
    stages.enrichment = {
      attempted: Math.min(parsed.rows.length, 20),
      enriched: enrichedLeads.filter((l) => (l as { sillage_lead: unknown }).sillage_lead !== null).length,
    };

    // ── Stage 3: Synthesize ICP / Avatars ────────────────────────────────────
    const icp = synthesizeICP(parsed.rows, []);
    stages.synthesis = {
      avatars: icp.avatars.map((a) => ({ id: a.id, label: a.label, profileCount: a.profileCount })),
      top_industries: icp.sillage_feed_parameters.target_industries,
      top_triggers: icp.sillage_feed_parameters.high_intent_triggers.slice(0, 5),
    };

    // ── Stage 4: Push persona + accounts to Sillage ──────────────────────────
    const sillageLog: string[] = [];
    try {
      const persona = icp.sillage_feed_parameters.persona;
      await sillage.upsertPersona({
        job_title: persona.job_title,
        location: persona.location,
        keywords: persona.keywords,
        industries: persona.industries,
        seniority_levels: persona.seniority_levels,
      });
      sillageLog.push(`Persona upserted: ${persona.job_title} @ ${persona.location}`);

      const uniqueCompanies = [...new Set(parsed.rows.map((r) => r.company).filter(Boolean))];
      const accounts = uniqueCompanies.slice(0, 50).map((name) => ({ name }));
      await sillage.addTopAccounts(accounts);
      sillageLog.push(`Pushed ${accounts.length} accounts.`);

      let ingestionStatus;
      try {
        ingestionStatus = await sillage.pollIngestionUntilDone(3000, 2);
        sillageLog.push(`Ingestion: ${ingestionStatus.state}`);
      } catch {
        sillageLog.push("Ingestion still processing in background — proceeding.");
        ingestionStatus = { state: "processing" };
      }

      function extractId(res: unknown): number | undefined {
        const r = res as Record<string, unknown>;
        if (typeof r?.id === "number") return r.id;
        const d = r?.data as { id?: number } | { id?: number }[] | undefined;
        if (Array.isArray(d)) return d[0]?.id;
        if (d && typeof d === "object" && typeof d.id === "number") return d.id;
        return undefined;
      }

      const jobAgentRaw = await sillage.createAgent({
        type: "job_update",
        name: `Job Moves Monitor — Run ${run_id.slice(0, 8)}`,
      });
      const jobAgentId = extractId(jobAgentRaw);
      sillageLog.push(`Created job_update agent (id=${jobAgentId}).`);

      const kwAgentRaw = await sillage.createAgent({
        type: "keyword_detection",
        name: `ICP Keywords — Run ${run_id.slice(0, 8)}`,
        tracking_keywords: icp.sillage_feed_parameters.high_intent_triggers.slice(0, 10),
      });
      const kwAgentId = extractId(kwAgentRaw);
      sillageLog.push(`Created keyword agent (id=${kwAgentId}).`);

      let signals: unknown[] = [];
      if (kwAgentId) {
        try {
          const runs = await sillage.launchSignalRun(kwAgentId, 90);
          const signalRequestId = runs?.[0]?.signal_request_id;
          if (signalRequestId) {
            sillageLog.push(`Signal run launched (request_id=${signalRequestId}). Polling...`);
            await sillage.pollSignalRunUntilDone(signalRequestId, 5000, 10);
            const signalPage = await sillage.listSignals(50, kwAgentId);
            signals = signalPage.items ?? [];
            sillageLog.push(`Signal run complete. ${signals.length} detections.`);
          }
        } catch (e) {
          sillageLog.push(`Signal run skipped: ${String(e)}`);
        }
      }

      stages.sillage = {
        ok: true,
        log: sillageLog,
        accounts_pushed: accounts.length,
        agents_created: [kwAgentId, jobAgentId].filter(Boolean),
        signals_detected: (signals as unknown[]).length,
        signals_preview: (signals as unknown[]).slice(0, 3),
      };
    } catch (e) {
      errors.push(`Sillage dispatch error: ${String(e)}`);
      stages.sillage = { ok: false, error: String(e), log: sillageLog };
    }

    // ── Stage 5: FullEnrich mock ─────────────────────────────────────────────
    stages.fullenrich = {
      ok: true,
      _note: "Mocked — plug in FULLENRICH_API_KEY to activate.",
      primary_titles: icp.fullenrich_feed_parameters.primary_titles,
      mock_leads: icp.avatars.flatMap((a) =>
        a.representativeProfiles.map((p) => ({
          name: p.name,
          title: p.title,
          company: p.company,
          email_status: "mock",
        }))
      ).slice(0, 5),
    };

    // ── Stage 6: Persist to memory ───────────────────────────────────────────
    saveRun({
      run_id,
      created_at: new Date().toISOString(),
      csv_filename: filename,
      row_count: parsed.rows.length,
      avatar_count: icp.avatars.length,
      sillage_accounts_pushed: typeof stages.sillage === "object" && stages.sillage !== null && "accounts_pushed" in stages.sillage
        ? (stages.sillage as { accounts_pushed: number }).accounts_pushed
        : 0,
      sillage_agents_created: typeof stages.sillage === "object" && stages.sillage !== null && "agents_created" in stages.sillage
        ? ((stages.sillage as { agents_created: unknown[] }).agents_created as number[]).map(String)
        : [],
      signal_count: typeof stages.sillage === "object" && stages.sillage !== null && "signals_detected" in stages.sillage
        ? (stages.sillage as { signals_detected: number }).signals_detected
        : 0,
      icp_snapshot: icp,
    });

    return NextResponse.json({
      ok: true,
      run_id,
      errors: errors.length > 0 ? errors : undefined,
      stages,
      icp,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), stages }, { status: 500 });
  }
}
