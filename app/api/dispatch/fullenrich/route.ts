import { NextRequest, NextResponse } from "next/server";
import type { ICPOutput } from "@/lib/icp-synthesizer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { icp: ICPOutput };

    if (!body.icp) {
      return NextResponse.json({ error: "Body must include 'icp'." }, { status: 400 });
    }

    const { icp } = body;

    const mockResponse = {
      ok: true,
      _note: "FullEnrich integration is mocked — plug in FULLENRICH_API_KEY to activate.",
      primary_titles: icp.fullenrich_feed_parameters.primary_titles,
      secondary_titles: icp.fullenrich_feed_parameters.secondary_titles,
      seniority_level: icp.fullenrich_feed_parameters.seniority_level,
      mock_enriched_leads: icp.avatars.flatMap((avatar) =>
        avatar.representativeProfiles.map((p) => ({
          name: p.name,
          title: p.title,
          company: p.company,
          linkedin_url: p.linkedinUrl,
          email_status: "mock_not_verified",
          email: `${p.name.toLowerCase().replace(/\s+/g, ".")}@${p.company.toLowerCase().replace(/\s+/g, "")}.com`,
        }))
      ),
    };

    return NextResponse.json(mockResponse);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
