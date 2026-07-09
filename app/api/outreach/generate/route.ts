import { NextRequest, NextResponse } from "next/server";
import { generateOutreachEmail, type OutreachProspect, type OutreachSender } from "@/lib/outreach-writer";
import type { RefinedAvatar } from "@/lib/avatar-engine";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Generate a tailored outreach email for one prospect, grounded in the matched
 * patron avatar + the prospect's real signal. Returns { subject, body }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      prospect?: OutreachProspect;
      avatar?: RefinedAvatar | null;
      sender?: OutreachSender;
    };

    if (!body.prospect?.name) {
      return NextResponse.json({ error: "Body must include prospect.name" }, { status: 400 });
    }

    const email = await generateOutreachEmail(body.prospect, body.avatar ?? null, body.sender ?? {});
    return NextResponse.json({ ok: true, email });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
