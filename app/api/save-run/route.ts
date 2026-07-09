import { NextRequest, NextResponse } from "next/server";
import { saveJSON, loadJSON, saveRun, loadRuns } from "@/lib/memory-store";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: true, runs: loadRuns() });
  }
  const detail = loadJSON(`crm_${id}`);
  if (!detail) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, detail });
}

interface SavedLead {
  name: string;
  title?: string;
  company?: string;
  linkedin_url?: string;
  email?: string;
  phone?: string;
  email_status?: string;
  signal_type?: string;
}

/**
 * Persists a CRM snapshot: the selected/enriched prospects, the signals that
 * surfaced them, and the persona used. Also writes a run into the history index
 * so it shows up in the "Saved" view.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      csv_filename?: string;
      row_count?: number;
      avatar_count?: number;
      overview?: string;
      selected_leads?: SavedLead[];
      signals?: unknown[];
      icp_snapshot?: unknown;
    };

    const run_id = randomUUID();
    const created_at = new Date().toISOString();
    const selected = body.selected_leads ?? [];

    // Full CRM detail (leads + signals) stored separately.
    saveJSON(`crm_${run_id}`, {
      run_id,
      created_at,
      overview: body.overview ?? "",
      selected_leads: selected,
      signals: body.signals ?? [],
    });

    // Lightweight record for the history index.
    saveRun({
      run_id,
      created_at,
      csv_filename: body.csv_filename ?? "upload.csv",
      row_count: body.row_count ?? 0,
      avatar_count: body.avatar_count ?? 0,
      sillage_accounts_pushed: 0,
      sillage_agents_created: [],
      signal_count: (body.signals ?? []).length,
      icp_snapshot: body.icp_snapshot ?? null,
    });

    return NextResponse.json({
      ok: true,
      run_id,
      saved_leads: selected.length,
      runs: loadRuns(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
