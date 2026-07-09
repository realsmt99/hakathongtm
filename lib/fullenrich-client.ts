const FULLENRICH_BASE = "https://app.fullenrich.com/api/v2";
const FULLENRICH_API_KEY = process.env.FULLENRICH_API_KEY ?? "";

export function hasFullEnrichKey() {
  return !!FULLENRICH_API_KEY;
}

interface FEEmail {
  email: string;
  status?: "DELIVERABLE" | "HIGH_PROBABILITY" | "CATCH_ALL" | "INVALID" | "INVALID_DOMAIN";
}
interface FEPhone {
  number: string;
  region?: string;
}
interface FEContactInfo {
  most_probable_work_email?: FEEmail;
  most_probable_personal_email?: FEEmail;
  most_probable_phone?: FEPhone;
  work_emails?: FEEmail[];
  personal_emails?: FEEmail[];
  phones?: FEPhone[];
}
interface FEEmployment {
  title?: string;
  company?: { name?: string; domain?: string };
}
interface FEProfile {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  location?: { country?: string; country_code?: string; city?: string; region?: string };
  employment?: { current?: FEEmployment };
}
export interface FERecord {
  input?: Record<string, unknown>;
  contact_info?: FEContactInfo;
  profile?: FEProfile;
}
interface FEResult {
  id: string;
  name: string;
  status: "CREATED" | "IN_PROGRESS" | "CANCELED" | "CREDITS_INSUFFICIENT" | "FINISHED" | "RATE_LIMIT" | "UNKNOWN";
  data?: FERecord[];
  cost?: { credits?: number };
}

export interface EnrichContactInput {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  linkedin_url?: string;
  company_name?: string;
  domain?: string;
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${FULLENRICH_API_KEY}`,
  };
}

/** Split a display name into first/last, tolerant of ALL-CAPS surnames. */
export function splitName(full: string): { first_name: string; last_name: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

/** Kick off a single-contact bulk enrichment. Returns the enrichment_id. */
export async function startEnrichment(contact: EnrichContactInput): Promise<string> {
  const { first_name, last_name } =
    contact.first_name || contact.last_name
      ? { first_name: contact.first_name ?? "", last_name: contact.last_name ?? "" }
      : splitName(contact.full_name ?? "");

  const body = {
    name: `gtm-memory-engine · ${contact.full_name || `${first_name} ${last_name}`.trim() || "lead"}`,
    data: [
      {
        first_name,
        last_name,
        ...(contact.linkedin_url ? { linkedin_url: contact.linkedin_url } : {}),
        ...(contact.company_name ? { company_name: contact.company_name } : {}),
        ...(contact.domain ? { domain: contact.domain } : {}),
        enrich_fields: ["contact.work_emails", "contact.personal_emails", "contact.phones"],
      },
    ],
  };

  const res = await fetch(`${FULLENRICH_BASE}/contact/enrich/bulk`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: { enrichment_id?: string; code?: string; message?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`FullEnrich non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || !json.enrichment_id) {
    throw new Error(`FullEnrich start failed (${res.status}): ${json.message || json.code || text.slice(0, 200)}`);
  }
  return json.enrichment_id;
}

/** Fetch the current enrichment result. Returns null while still in progress. */
export async function getEnrichmentResult(
  enrichmentId: string,
  forceResults = false
): Promise<FEResult | null> {
  const url = `${FULLENRICH_BASE}/contact/enrich/bulk/${enrichmentId}${forceResults ? "?forceResults=true" : ""}`;
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  let json: FEResult & { code?: string; message?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`FullEnrich non-JSON result (${res.status}): ${text.slice(0, 200)}`);
  }
  // 400 with in_progress code means: not ready yet, keep polling.
  if (res.status === 400 && json.code === "error.enrichment.in_progress") {
    return null;
  }
  if (!res.ok) {
    throw new Error(`FullEnrich result failed (${res.status}): ${json.message || json.code || text.slice(0, 200)}`);
  }
  return json;
}

const TERMINAL: FEResult["status"][] = [
  "FINISHED",
  "CANCELED",
  "CREDITS_INSUFFICIENT",
  "RATE_LIMIT",
  "UNKNOWN",
];

/**
 * Start an enrichment and poll until it reaches a terminal state. Enrichment
 * runs a multi-provider waterfall, so this can take 10–60s — poll patiently.
 */
export async function enrichContact(
  contact: EnrichContactInput,
  { intervalMs = 4000, maxAttempts = 25 }: { intervalMs?: number; maxAttempts?: number } = {}
): Promise<FEResult> {
  const enrichmentId = await startEnrichment(contact);

  let last: FEResult | null = null;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const result = await getEnrichmentResult(enrichmentId);
    if (result) {
      last = result;
      if (TERMINAL.includes(result.status)) return result;
    }
  }

  // Timed out waiting — return whatever we have so far.
  const forced = await getEnrichmentResult(enrichmentId, true).catch(() => null);
  if (forced) return forced;
  if (last) return last;
  return { id: enrichmentId, name: "", status: "IN_PROGRESS", data: [] };
}
