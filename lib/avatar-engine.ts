import type { PersonaPayload } from "@/lib/sillage-client";

/**
 * Avatar Synthesis Engine
 * -----------------------
 * Executable implementation of skills/avatar-synthesis/SKILL.md.
 *
 * Flow: harvested LinkedIn activity -> Claude -> evidence-grounded PATRON avatars
 * -> ONE combined Sillage persona (single persona, single keyword agent).
 *
 * This module is the single source of truth for the prompt + persona mapping.
 * `lib/claude-client.ts` re-exports from here for backwards compatibility.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5-20250929";

export interface RefinedAvatar {
  label: string;
  summary: string;
  interests: string[];
  pains: string[];
  triggers: string[];
  tone: string;
  outreach_angle: string;
  evidence: string[]; // short quotes from the real activity that justify this avatar
}

export interface ClaudeAnalysis {
  overview: string;
  refined_avatars: RefinedAvatar[];
  recommended_persona_keywords: string[];
  recommended_industries: string[];
}

export interface ActivityItem {
  text: string;
  type: string; // linkedinComment | linkedinPost | signal
  company?: string;
  author?: string;
}

export interface SeedContext {
  seedAvatars?: { label: string; dominantIndustry: string; seniority: string }[];
  seedIndustries?: string[];
}

/** Claude sometimes wraps JSON in prose or ```json fences — strip and parse. */
export function extractJSON(raw: string): unknown {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Claude returned no JSON object. Raw: ${raw.slice(0, 300)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/** System prompt: frames Claude as a philanthropy/development analyst. */
export function buildSystemPrompt(): string {
  return `You are a philanthropy and fundraising development analyst. You are given REAL LinkedIn posts and comments from decision-makers who run corporate foundations and mécénat (corporate-giving) programs. Your job is to profile what kind of patron funds causes like these — the causes they champion, what they look for in a project or partner, and the "fundable moments" that make them receptive to being approached for grants, mécénat, or partnerships. Base everything only on the evidence in front of you. Do not invent facts. Ground every patron archetype in the provided activity.`;
}

/** User prompt: seed context + harvested activity + strict JSON contract. */
export function buildUserPrompt(activity: ActivityItem[], seedContext: SeedContext): string {
  const activityBlock = activity
    .slice(0, 200)
    .map((a, i) => {
      const meta = [a.type, a.company, a.author].filter(Boolean).join(" · ");
      return `[${i + 1}] (${meta})\n${a.text}`;
    })
    .join("\n\n");

  const seedBlock = seedContext.seedAvatars?.length
    ? `Our initial (keyword-guessed) avatars were:\n${seedContext.seedAvatars
        .map((s) => `- ${s.label} (${s.seniority}, ${s.dominantIndustry})`)
        .join("\n")}\nSeed industries: ${(seedContext.seedIndustries ?? []).join(", ")}`
    : "No seed avatars provided.";

  return `${seedBlock}

Here is the real LinkedIn activity we harvested from these corporate-foundation and mécénat leaders:

${activityBlock}

Analyze this activity and return ONLY a JSON object with this exact shape:
{
  "overview": "2-3 sentence summary of the dominant causes and giving themes across all activity",
  "refined_avatars": [
    {
      "label": "short name for this patron archetype (e.g. 'Arts & Culture Patron', 'Women's Empowerment Funder')",
      "summary": "1-2 sentences on who they are and what they fund",
      "interests": ["the causes and programs they support"],
      "pains": ["what they are trying to solve or fund"],
      "triggers": ["fundable moments — short phrases signalling an opening to approach them (new program, open call, fresh appointment, budget announcement)"],
      "tone": "how they communicate (formal, mission-driven, institutional, etc.)",
      "outreach_angle": "one concrete way a cause could approach them for funding, grounded in their activity",
      "evidence": ["short direct quotes from the activity above that justify this archetype"]
    }
  ],
  "recommended_persona_keywords": ["keywords to feed Sillage agents to find more patrons like these (causes, programs, mécénat terms)"],
  "recommended_industries": ["sectors these foundations belong to"]
}

Produce 2-4 patron archetypes. Return JSON only, no prose.`;
}

/**
 * Sends harvested LinkedIn activity to Claude and returns refined,
 * evidence-grounded patron avatars.
 */
export async function synthesizeAvatars(
  activity: ActivityItem[],
  seedContext: SeedContext
): Promise<ClaudeAnalysis> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable Claude analysis."
    );
  }
  if (activity.length === 0) {
    throw new Error(
      "No LinkedIn activity to analyze yet. Run the Sillage dispatch + let ingestion surface content first."
    );
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(activity, seedContext);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error("Claude request timed out after 60s.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Anthropic API error (HTTP ${res.status}): ${text.slice(0, 400)}`);
  }

  const json = JSON.parse(text) as { content?: { type: string; text?: string }[] };
  const rawText = json.content?.map((c) => c.text ?? "").join("") ?? "";
  const parsed = extractJSON(rawText) as ClaudeAnalysis;

  if (!Array.isArray(parsed.refined_avatars)) {
    throw new Error("Claude response missing refined_avatars array.");
  }
  return parsed;
}

function uniq(arr: (string | undefined | null)[]): string[] {
  return [...new Set(arr.filter((s): s is string => !!s && s.trim().length > 0))];
}

export interface CombinedPersona {
  persona: PersonaPayload;
  triggers: string[];
}

/**
 * Collapse all refined avatars into a SINGLE Sillage persona plus the union of
 * their fundable-moment triggers (the tracking keywords for one keyword agent).
 * See "Mapping avatars -> ONE Sillage persona" in the SKILL.
 */
export function deriveCombinedPersona(
  analysis: ClaudeAnalysis,
  location = "Paris, France"
): CombinedPersona {
  const keywords = uniq(analysis.recommended_persona_keywords ?? []).slice(0, 20);
  const industries = uniq(analysis.recommended_industries ?? []).slice(0, 10);
  const triggers = uniq(
    (analysis.refined_avatars ?? []).flatMap((a) => a.triggers ?? [])
  ).slice(0, 15);

  return {
    persona: {
      job_title: analysis.refined_avatars?.[0]?.label ?? "Patron / Mécène",
      location,
      keywords,
      industries,
      seniority_levels: [],
    },
    triggers,
  };
}
