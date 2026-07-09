import type { ICPOutput, ICPAvatar } from "@/lib/icp-synthesizer";
import type { ClaudeAnalysis, RefinedAvatar } from "@/lib/claude-client";

export type { ICPOutput, ICPAvatar, ClaudeAnalysis, RefinedAvatar };

export interface Row {
  fullName: string;
  title: string;
  company: string;
  linkedinUrl?: string;
  email?: string;
  location?: string;
  about?: string;
}

export interface UploadResp {
  ok: boolean;
  filename: string;
  valid_rows: number;
  skipped: number;
  warnings: string[];
  preview: Row[];
  rows: Row[];
  error?: string;
}

export interface HarvestResp {
  ok: boolean;
  mock: boolean;
  content_count: number;
  signal_count: number;
  activity_count: number;
  activity: { text: string; type: string; company?: string; author?: string }[];
  activity_full: { text: string; type: string; company?: string; author?: string }[];
  error?: string;
}

export interface AnalyzeResp {
  ok: boolean;
  analysis: ClaudeAnalysis;
  analyzed_count: number;
  error?: string;
}

export interface RefineResp {
  ok: boolean;
  pushed_keywords: string[];
  pushed_industries: string[];
  pushed_triggers: string[];
  refined_agent_id?: number;
  log: string[];
  error?: string;
}

export interface SignalLead {
  name: string;
  title?: string;
  linkedin_url?: string;
}

export interface Signal {
  id: number | string;
  type: string;
  summary: string;
  detected_at: string | null;
  lead: SignalLead | null;
  account: { name?: string; domain?: string } | null;
  mock?: boolean;
}

export interface SignalsResp {
  ok: boolean;
  mode: "live" | "mock";
  mock: boolean;
  count: number;
  signals: Signal[];
  live_error?: string;
  error?: string;
}

export interface EnrichedLead {
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

export interface EnrichResp {
  ok: boolean;
  mock: boolean;
  cached?: boolean;
  status?: string;
  credits?: number;
  lead: EnrichedLead;
  error?: string;
}

export interface OutreachEmail {
  subject: string;
  body: string;
}

export interface GenerateOutreachResp {
  ok: boolean;
  email: OutreachEmail;
  error?: string;
}

export interface SendOutreachResp {
  ok: boolean;
  id: string;
  sent_at: string;
  error?: string;
}

// A signal as delivered over the SSE stream (same shape as Signal, no mock flag).
export type StreamSignal = Omit<Signal, "mock">;

export interface StreamDone {
  count: number;
  mode: "live" | "mock";
  mock: boolean;
  cached: boolean;
  live_error?: string;
}

export interface RunRecord {
  run_id: string;
  created_at: string;
  csv_filename: string;
  row_count: number;
  avatar_count: number;
  signal_count: number;
}

async function jsonPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data: T;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`HTTP ${res.status}: ${raw.slice(0, 200)}`);
  }
  if (!res.ok || (data as { ok?: boolean }).ok === false) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  async upload(file: File): Promise<UploadResp> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = (await res.json()) as UploadResp;
    if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed");
    return data;
  },
  synthesize: (rows: Row[]) =>
    jsonPost<{ ok: boolean; icp: ICPOutput }>("/api/synthesize", { rows, signals: [] }),
  seedAccounts: (rows: Row[]) =>
    jsonPost<{ ok: boolean; accounts_pushed: number; leads_resolved: number; companies: string[] }>(
      "/api/seed-accounts",
      { rows }
    ),
  harvest: () => jsonPost<HarvestResp>("/api/harvest", {}),
  analyze: (activity: HarvestResp["activity"], seedAvatars: unknown[], seedIndustries: string[]) =>
    jsonPost<AnalyzeResp>("/api/analyze", { activity, seedAvatars, seedIndustries }),
  refinePersona: (analysis: ClaudeAnalysis, location: string) =>
    jsonPost<RefineResp>("/api/refine-persona", { analysis, location }),
  async signals(mode: "live" | "mock" = "live"): Promise<SignalsResp> {
    const res = await fetch(`/api/signals?mode=${mode}`);
    const data = (await res.json()) as SignalsResp;
    if (!res.ok || !data.ok) throw new Error(data.error || "Signals failed");
    return data;
  },
  enrichLead: (lead: { name: string; title?: string; company?: string; linkedin_url?: string }) =>
    jsonPost<EnrichResp>("/api/enrich-lead", lead),
  /**
   * Open an SSE stream of signals that arrive one-by-one. Returns a cleanup
   * function that closes the stream.
   */
  streamSignals(
    mode: "live" | "mock",
    handlers: {
      onSignal: (s: StreamSignal) => void;
      onDone?: (d: StreamDone) => void;
      onError?: (message: string) => void;
    }
  ): () => void {
    const es = new EventSource(`/api/signals/stream?mode=${mode}`);
    es.addEventListener("signal", (e) => {
      try {
        handlers.onSignal(JSON.parse((e as MessageEvent).data) as StreamSignal);
      } catch {
        /* ignore malformed frame */
      }
    });
    es.addEventListener("done", (e) => {
      try {
        handlers.onDone?.(JSON.parse((e as MessageEvent).data) as StreamDone);
      } catch {
        /* ignore */
      }
      es.close();
    });
    es.addEventListener("error", (e) => {
      const data = (e as MessageEvent).data;
      handlers.onError?.(typeof data === "string" && data ? data : "stream connection error");
      es.close();
    });
    return () => es.close();
  },
  generateOutreach: (payload: {
    prospect: { name: string; title?: string; company?: string; signal_summary?: string; signal_type?: string };
    avatar?: RefinedAvatar | null;
    sender?: { sender_name?: string; org_name?: string; cause?: string };
  }) => jsonPost<GenerateOutreachResp>("/api/outreach/generate", payload),
  sendOutreach: (payload: { to: string; subject: string; text: string; name?: string; replyTo?: string }) =>
    jsonPost<SendOutreachResp>("/api/outreach/send", payload),
  saveRun: (payload: unknown) =>
    jsonPost<{ ok: boolean; run_id: string; saved_leads: number; runs: RunRecord[] }>(
      "/api/save-run",
      payload
    ),
  async runs(): Promise<RunRecord[]> {
    const res = await fetch("/api/save-run");
    const data = (await res.json()) as { runs: RunRecord[] };
    return data.runs ?? [];
  },
};
