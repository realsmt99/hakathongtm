import { NextRequest, NextResponse } from "next/server";
import { synthesizeICP } from "@/lib/icp-synthesizer";
import type { LinkedInRow } from "@/lib/csv-parser";
import type { Signal } from "@/lib/sillage-client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { rows: LinkedInRow[]; signals?: Signal[] };

    if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "Body must include a non-empty 'rows' array." }, { status: 400 });
    }

    const icp = synthesizeICP(body.rows, body.signals ?? []);

    return NextResponse.json({ ok: true, icp });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
