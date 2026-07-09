const SILLAGE_MCP_URL =
  process.env.SILLAGE_MCP_URL ?? "https://api.getsillage.com/api/mcp/v2";
const SILLAGE_API_KEY = process.env.SILLAGE_API_KEY ?? "";

let _idCounter = 1;
function nextId() {
  return _idCounter++;
}

async function mcpCall<T = unknown>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: nextId(),
    method,
    params,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let res: Response;
  try {
    res = await fetch(SILLAGE_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${SILLAGE_API_KEY}`,
      },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`Sillage request timed out after 20s (method=${method})`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();

  let json: { result?: { content?: { text: string }[]; structuredContent?: T }; error?: { message: string } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Sillage non-JSON response (${res.status}): ${text.slice(0, 300)}`);
  }

  if (json.error) {
    throw new Error(`Sillage MCP error: ${json.error.message}`);
  }

  if (json.result?.structuredContent !== undefined) {
    return json.result.structuredContent as T;
  }

  if (json.result?.content?.[0]?.text) {
    try {
      return JSON.parse(json.result.content[0].text) as T;
    } catch {
      return json.result.content[0].text as unknown as T;
    }
  }

  return json.result as T;
}

async function toolCall<T = unknown>(
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  return mcpCall<T>("tools/call", { name: toolName, arguments: args });
}

export interface SetupState {
  persona_set: boolean;
  list_uploaded: boolean;
  ingestion_complete: boolean;
  has_contents: boolean;
  checklist: {
    persona: { status: string; message: string };
    accounts: { status: string; message: string; count: number; ingestion_state: string; recommended_next_tool?: string };
    agents: { status: string; message: string; count: number; missing_priority_types: string[]; recommended_next_tool?: string };
    contents: { status: string; message: string };
  };
}

export interface PersonaPayload {
  job_title?: string;
  location?: string;
  keywords?: string[];
  industries?: string[];
  seniority_levels?: string[];
  company_sizes?: string[];
}

export interface TopAccount {
  domain?: string;
  linkedin_url?: string;
  name?: string;
}

export interface AgentCreatePayload {
  type: "keyword_detection" | "competitor" | "partner" | "customer" | "influencer" | "champion" | "job_update" | "job_posting_keyword_detection";
  name: string;
  tracking_keywords?: string[];
}

export interface AccountListStatus {
  state: "queued" | "processing" | "completed" | "failed";
  total: number;
  resolved: number;
  failed: number;
}

export interface Signal {
  id: number;
  signal_type: string;
  account?: { name: string; domain?: string };
  lead?: { name: string; title?: string; linkedin_url?: string };
  summary?: string;
  detected_at?: string;
  raw?: unknown;
}

export interface SillageContent {
  id: number;
  content_type: string; // "linkedinComment" | "linkedinPost" | ...
  created_at: string;
  data: { text?: string; post_content_id?: number; [k: string]: unknown };
  lead_id: number | null;
  company_id: number | null;
}

export const sillage = {
  getSetupState: () => toolCall<SetupState>("sillage_v2_get_setup_state"),

  getPersona: () =>
    toolCall<{ data: PersonaPayload | null }>("sillage_v2_get_persona"),

  upsertPersona: (payload: PersonaPayload) =>
    toolCall("sillage_v2_upsert_persona", payload as Record<string, unknown>),

  addTopAccounts: (accounts: TopAccount[]) =>
    toolCall("sillage_v2_add_top_accounts", { accounts }),

  getTopAccountListStatus: () =>
    toolCall<AccountListStatus>("sillage_v2_get_top_account_list_status"),

  readTopAccountList: (page_size = 100, cursor?: string) =>
    toolCall("sillage_v2_read_top_account_list", {
      page_size,
      ...(cursor ? { cursor } : {}),
    }),

  getCompany: (domain: string) =>
    toolCall("sillage_v2_get_company", { domain }),

  enrichCompany: (domain: string) =>
    toolCall("sillage_v2_enrich_company", { domain }),

  getLead: (linkedin_url: string) =>
    toolCall("sillage_v2_get_lead", { linkedin_url }),

  getAgents: () => toolCall<{ agents: { id: number; name: string; type: string }[] }>("sillage_v2_get_agents"),

  createAgent: (payload: AgentCreatePayload) =>
    toolCall("sillage_v2_create_agent", payload as unknown as Record<string, unknown>),

  deleteAgent: (agent_id: number) =>
    toolCall("sillage_v2_delete_agent", { agent_id }),

  launchSignalRun: (agent_id: number, lookback_days = 90) =>
    toolCall<{ signal_request_id: number }[]>("sillage_v2_launch_signal_run", {
      agent_id,
      lookback_days,
    }),

  getSignalRun: (signal_request_id: number) =>
    toolCall<{ stage: string; metadata?: unknown }>("sillage_v2_get_signal_run", {
      signal_request_id,
    }),

  listSignals: (page_size = 50, agent_id?: number, cursor?: string) =>
    toolCall<{ items: Signal[]; meta: { next_cursor: string | null } }>(
      "sillage_v2_list_signals",
      {
        page_size,
        ...(agent_id ? { agent_id } : {}),
        ...(cursor ? { cursor } : {}),
      }
    ),

  getSignal: (id: number) => toolCall<Signal>("sillage_v2_get_signal", { id }),

  getContents: (page_size = 100, cursor?: string) =>
    toolCall<{ data: SillageContent[]; meta: { next_cursor: string | null; has_more: boolean } }>(
      "sillage_v2_get_contents",
      { page_size, ...(cursor ? { cursor } : {}) }
    ),

  getSignalPlaybook: (agent_type?: string) =>
    toolCall(
      "sillage_v2_get_signal_playbook",
      agent_type ? { agent_type } : {}
    ),

  pollIngestionUntilDone: async (
    intervalMs = 8000,
    maxAttempts = 30
  ): Promise<AccountListStatus> => {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await sillage.getTopAccountListStatus();
      if (status.state === "completed" || status.state === "failed") {
        return status;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error("Ingestion timed out after polling");
  },

  pollSignalRunUntilDone: async (
    signal_request_id: number,
    intervalMs = 5000,
    maxAttempts = 30
  ): Promise<{ stage: string }> => {
    for (let i = 0; i < maxAttempts; i++) {
      const run = await sillage.getSignalRun(signal_request_id);
      if (run.stage === "completed" || run.stage === "completed_partial" || run.stage === "failed") {
        return run;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error("Signal run timed out after polling");
  },
};
