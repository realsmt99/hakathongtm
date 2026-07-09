import { NextRequest, NextResponse } from "next/server";
import { enrichContact, hasFullEnrichKey, type FERecord } from "@/lib/fullenrich-client";
import { getCached, setCached, cacheKey } from "@/lib/cache";

// Enrichment costs credits + takes time, so cache each result for a long time.
const ENRICH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// FullEnrich runs a multi-provider waterfall that can take up to a minute, so
// allow this route a long execution budget and never cache it.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface LeadOut {
  name: string;
  title: string;
  company: string;
  linkedin_url: string;
  email: string;
  email_status: string;
  phone: string;
  confidence: number;
  location: string;
}

// Map FullEnrich email status → a rough confidence score, boosted if we also
// found a mobile number.
function confidenceFor(status: string | undefined, hasPhone: boolean): number {
  const base: Record<string, number> = {
    DELIVERABLE: 95,
    HIGH_PROBABILITY: 82,
    CATCH_ALL: 65,
    INVALID: 20,
    INVALID_DOMAIN: 15,
  };
  const score = base[status ?? ""] ?? 45;
  return Math.min(99, score + (hasPhone ? 4 : 0));
}

function mapRecord(record: FERecord | undefined, fallback: {
  name: string;
  title: string;
  company: string;
  linkedin_url: string;
  location: string;
}): LeadOut {
  const info = record?.contact_info;
  const profile = record?.profile;
  const emailObj = info?.most_probable_work_email ?? info?.most_probable_personal_email;
  const phoneObj = info?.most_probable_phone;

  const current = profile?.employment?.current;
  const loc = profile?.location;
  const location = [loc?.city, loc?.country].filter(Boolean).join(", ");

  return {
    name: profile?.full_name || fallback.name,
    title: current?.title || fallback.title,
    company: current?.company?.name || fallback.company,
    linkedin_url: fallback.linkedin_url,
    email: emailObj?.email || "",
    email_status: emailObj?.status || "not_found",
    phone: phoneObj?.number || "",
    confidence: emailObj?.email || phoneObj?.number ? confidenceFor(emailObj?.status, !!phoneObj?.number) : 0,
    location: location || fallback.location || "",
  } as LeadOut & { location: string };
}

// Deterministic mock so the CRM still works without an API key.
function mockLead(body: { name: string; title?: string; company?: string; linkedin_url?: string }): LeadOut {
  const name = body.name;
  const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, "").trim().replace(/\s+/g, ".");
  const domain =
    (body.company || "company").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").slice(0, 20) || "company";
  const confidence = 70 + ((name.length * 7) % 30);
  const areaCode = 600000000 + ((name.length * 137) % 99999999);
  return {
    name,
    title: body.title || "",
    company: body.company || "",
    linkedin_url: body.linkedin_url || "",
    email: `${slug}@${domain}.com`,
    email_status: "mock_probable",
    phone: `+33 ${String(areaCode).slice(0, 1)} ${String(areaCode).slice(1, 3)} ${String(areaCode).slice(3, 5)} ${String(areaCode).slice(5, 7)} ${String(areaCode).slice(7, 9)}`,
    confidence,
    location: "Paris, France",
  };
}

/**
 * Per-lead FullEnrich lookup. Given a single prospect surfaced by a signal
 * (usually just a name + LinkedIn URL), runs the real FullEnrich waterfall to
 * find a verified work/personal email and mobile phone. Falls back to a
 * deterministic mock when FULLENRICH_API_KEY is not set.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      name?: string;
      title?: string;
      company?: string;
      linkedin_url?: string;
    };

    const name = (body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Body must include 'name'." }, { status: 400 });
    }

    const fallback = {
      name,
      title: body.title || "",
      company: body.company || "",
      linkedin_url: body.linkedin_url || "",
      location: "",
    };

    if (!hasFullEnrichKey()) {
      return NextResponse.json({ ok: true, mock: true, lead: mockLead({ ...body, name }) });
    }

    // Cache by LinkedIn URL when available (most stable), else name+company.
    const key = cacheKey("enrich", body.linkedin_url || `${name}_${body.company ?? ""}`);
    const cached = getCached<LeadOut>(key, ENRICH_TTL_MS);
    if (cached) {
      return NextResponse.json({ ok: true, mock: false, cached: true, lead: cached });
    }

    const result = await enrichContact({
      full_name: name,
      linkedin_url: body.linkedin_url,
      company_name: body.company,
    });

    const lead = mapRecord(result.data?.[0], fallback);

    // Only cache results that actually found something, so a transient miss
    // doesn't get pinned for 30 days.
    if (lead.email || lead.phone) setCached(key, lead);

    return NextResponse.json({
      ok: true,
      mock: false,
      cached: false,
      status: result.status,
      credits: result.cost?.credits ?? 0,
      lead,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
