import { sillage } from "./sillage-client";
import { getCached, getCachedStale, setCached } from "./cache";

export interface UISignal {
  id: number | string;
  type: string;
  summary: string;
  detected_at: string | null;
  lead: { name: string; title?: string; linkedin_url?: string } | null;
  account: { name?: string; domain?: string } | null;
}

const LIVE_CACHE_KEY = "signals_live";
const LIVE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

// Sillage returns signal_type in camelCase (e.g. "keywordDetection", "jobUpdate").
function normalizeType(raw: unknown): string {
  const t = String(raw ?? "").trim();
  const map: Record<string, string> = {
    keywordDetection: "keyword_detection",
    jobUpdate: "job_update",
    jobPostingKeywordDetection: "keyword_detection",
    recentlyPromoted: "job_update",
    newJob: "job_update",
  };
  return map[t] ?? t;
}

// Build a human summary for job-change signals (recentlyPromoted / newJob),
// which carry no author/excerpt — only a role transition under `data`.
function jobSummary(rawType: string, data: Record<string, unknown>): { summary: string; company?: string } | null {
  const np = data.new_position as Record<string, unknown> | undefined;
  const pp = data.previous_position as Record<string, unknown> | undefined;
  if (!np && !pp) return null;
  const newRole = firstString(np?.role, np?.title);
  const company = firstString(np?.company_name, np?.company, pp?.company_name);
  const prevRole = firstString(pp?.role, pp?.title);
  if (rawType === "recentlyPromoted") {
    const from = prevRole ? ` (depuis ${prevRole})` : "";
    return { summary: `Promotion : ${newRole || "nouveau poste"}${company ? ` chez ${company}` : ""}${from}.`, company: company || undefined };
  }
  return { summary: `Nouveau poste : ${newRole || "—"}${company ? ` chez ${company}` : ""}.`, company: company || undefined };
}

/** Pull a display-ready signal out of a Sillage list_signals item. */
export function normalizeSignal(s: Record<string, unknown>): UISignal {
  const data = (s.data as Record<string, unknown>) ?? {};
  const author =
    (s.author as Record<string, unknown>) ??
    (data.author as Record<string, unknown>) ??
    undefined;

  const excerpt = firstString(s.excerpt, data.excerpt, s.summary, s.content);
  const keywords = Array.isArray(data.keywords_found) ? (data.keywords_found as string[]) : [];
  const rawType = String(s.signal_type ?? s.type ?? "").trim();
  const type = normalizeType(rawType);

  const lead = author
    ? {
        name: firstString(author.full_name, author.name, author.fullName) || "Prospect",
        title: firstString(author.headline, author.title, author.position) || undefined,
        linkedin_url: firstString(author.linkedin_url, author.linkedinUrl, author.url, s.source_url) || undefined,
      }
    : null;

  // Job-change signals carry no author/excerpt — surface the role transition
  // and the company (used as the row's account when there's no named person).
  const job = !excerpt ? jobSummary(rawType, data) : null;

  const kw = keywords.length ? ` (mots-clés : ${keywords.join(", ")})` : "";
  const summary = excerpt
    ? `${excerpt}${kw}`
    : job
      ? job.summary
      : lead?.name
        ? `${lead.name} a déclenché un signal${kw}.`
        : `Nouveau signal ${type}${kw}.`;

  return {
    id: (s.id as number | string) ?? Math.random().toString(36).slice(2),
    type,
    summary,
    detected_at: (s.detected_at as string) ?? (s.signal_date as string) ?? (s.created_at as string) ?? null,
    lead,
    account: job?.company ? { name: job.company } : null,
  };
}

/** Hydrate a single list stub, fetching detail one-by-one when it's bare. */
async function hydrateStub(stub: Record<string, unknown>): Promise<UISignal> {
  let full = stub;
  const data = (stub.data as Record<string, unknown>) ?? {};
  const hasDetail = stub.author || stub.excerpt || data.author || data.new_position || data.previous_position;
  if (!hasDetail && typeof stub.id === "number") {
    try {
      const raw = (await sillage.getSignal(stub.id)) as unknown as Record<string, unknown>;
      const inner = (raw?.data as Record<string, unknown>) ?? raw;
      if (inner && typeof inner === "object") full = { ...stub, ...inner };
    } catch {
      /* keep the stub if the per-signal fetch fails */
    }
  }
  return normalizeSignal(full);
}

export interface LiveSignalsResult {
  signals: UISignal[];
  cached: boolean;
  live_error?: string;
}

/**
 * Fetch live signals ONE BY ONE. Calls `onSignal` as each one is ready (for
 * SSE streaming) and returns the full list. Results are cached for LIVE_TTL_MS;
 * a fresh cache is replayed through `onSignal` so the UI still streams, but
 * instantly. On a live error we fall back to the last good cache if present.
 */
export async function streamLiveSignals(
  onSignal?: (s: UISignal) => void | Promise<void>,
  limit = 30
): Promise<LiveSignalsResult> {
  const cached = getCached<UISignal[]>(LIVE_CACHE_KEY, LIVE_TTL_MS);
  if (cached) {
    if (onSignal) for (const s of cached) await onSignal(s);
    return { signals: cached, cached: true };
  }

  let items: Record<string, unknown>[];
  try {
    const res = (await sillage.listSignals(50)) as unknown as {
      items?: unknown[];
      data?: unknown[];
    };
    items = (res.items ?? res.data ?? []) as Record<string, unknown>[];
  } catch (e) {
    const stale = getCachedStale<UISignal[]>(LIVE_CACHE_KEY);
    const live_error = String(e instanceof Error ? e.message : e);
    if (stale) {
      if (onSignal) for (const s of stale.data) await onSignal(s);
      return { signals: stale.data, cached: true, live_error };
    }
    return { signals: [], cached: false, live_error };
  }

  const signals: UISignal[] = [];
  for (const stub of items.slice(0, limit)) {
    const sig = await hydrateStub(stub);
    signals.push(sig);
    if (onSignal) await onSignal(sig);
  }

  setCached(LIVE_CACHE_KEY, signals);
  return { signals, cached: false };
}
