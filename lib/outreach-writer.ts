import type { RefinedAvatar } from "./avatar-engine";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5-20250929";

export function hasAnthropicKey() {
  return !!ANTHROPIC_API_KEY;
}

export interface OutreachProspect {
  name: string;
  title?: string;
  company?: string;
  signal_summary?: string; // what they actually posted/commented (grounds the email)
  signal_type?: string;
}

export interface OutreachSender {
  sender_name?: string;
  org_name?: string;
  cause?: string; // 1-2 sentences describing the non-profit / what we raise for
}

export interface OutreachEmail {
  subject: string;
  body: string;
}

const DEFAULTS: Required<OutreachSender> = {
  sender_name: process.env.OUTREACH_SENDER_NAME || "The team",
  org_name: process.env.OUTREACH_ORG_NAME || "our non-profit",
  cause:
    process.env.OUTREACH_CAUSE ||
    "a non-profit advancing women's empowerment and equal opportunity through education and mentorship programs",
};

function systemPrompt(): string {
  return `You are an elite non-profit development writer who crafts warm, human, one-to-one fundraising emails to patrons, investors and corporate-giving decision-makers.

Rules:
- Write like a real person emailing another real person — NOT a marketing blast. No buzzwords, no "I hope this email finds you well", no template smell.
- Be specific: reference the exact thing the prospect recently did/said (the signal) as the natural reason you're reaching out.
- Ground the pitch in what THIS patron actually cares about (their interests, tone, and the outreach angle provided).
- Keep it short: 90–150 words in the body. One clear, low-friction ask (a 20-minute conversation), not a hard money ask.
- Match the LANGUAGE of the prospect's activity. If their post/comment is in French, write the whole email in French. Otherwise write in English.
- Sound like the sender's org but stay humble and curious.
- Never invent facts about the prospect beyond what's given. Never fabricate metrics.
- Return ONLY JSON: {"subject": string, "body": string}. The body uses \\n for line breaks and includes a short sign-off with the sender name.`;
}

function userPrompt(prospect: OutreachProspect, avatar: RefinedAvatar | null, sender: Required<OutreachSender>): string {
  const av = avatar
    ? `Matched patron archetype (use this to tailor tone + angle):
- Archetype: ${avatar.label}
- Who they are: ${avatar.summary}
- Interests: ${avatar.interests?.join(", ") || "—"}
- What they care about solving: ${avatar.pains?.join(", ") || "—"}
- Communication tone: ${avatar.tone || "warm, professional"}
- Best outreach angle: ${avatar.outreach_angle || "—"}`
    : "No specific archetype matched — use a warm, mission-driven tone.";

  return `Write a tailored fundraising outreach email.

SENDER
- From: ${sender.sender_name} at ${sender.org_name}
- Our cause: ${sender.cause}

PROSPECT
- Name: ${prospect.name}
- Title: ${prospect.title || "—"}
- Company / org: ${prospect.company || "—"}
- Recent signal (the reason we're reaching out — reference it naturally): ${prospect.signal_summary || "engaged publicly with causes like ours"}

${av}

Goal: open a genuine conversation to explore whether they'd be interested in supporting our cause. Soft ask: a short call. Personalize the opening line to their recent signal. Return ONLY the JSON object.`;
}

/** Strip prose/fences and parse the {subject, body} JSON. */
function parseEmail(raw: string): OutreachEmail {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`No JSON in model output: ${raw.slice(0, 200)}`);
  const obj = JSON.parse(candidate.slice(start, end + 1)) as OutreachEmail;
  if (!obj.subject || !obj.body) throw new Error("Model output missing subject/body");
  return { subject: obj.subject.trim(), body: obj.body.trim() };
}

export async function generateOutreachEmail(
  prospect: OutreachProspect,
  avatar: RefinedAvatar | null,
  sender: OutreachSender = {}
): Promise<OutreachEmail> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local to generate emails.");
  }
  const merged: Required<OutreachSender> = { ...DEFAULTS, ...clean(sender) };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
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
        max_tokens: 900,
        temperature: 0.7,
        system: systemPrompt(),
        messages: [{ role: "user", content: userPrompt(prospect, avatar, merged) }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic API error (HTTP ${res.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { content?: { type: string; text?: string }[] };
  const out = json.content?.find((c) => c.type === "text")?.text ?? "";
  return parseEmail(out);
}

function clean(s: OutreachSender): OutreachSender {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v)) as OutreachSender;
}
