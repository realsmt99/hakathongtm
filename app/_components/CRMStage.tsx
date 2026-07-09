"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChatCircleDots,
  LinkSimple,
  Briefcase,
  Broadcast,
  ArrowClockwise,
  Sparkle,
  CircleNotch,
  Check,
  EnvelopeSimple,
  Phone,
  FloppyDisk,
  DownloadSimple,
  Megaphone,
  UserCirclePlus,
  Gift,
  Trophy,
  Handshake,
  Heart,
  ShareNetwork,
  CurrencyEur,
  Microphone,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import { api } from "@/app/_lib/api";
import type {
  Signal,
  EnrichedLead,
  ICPOutput,
  ClaudeAnalysis,
  RefinedAvatar,
  RunRecord,
} from "@/app/_lib/api";
import { OutreachDrawer } from "./OutreachDrawer";

const TYPE_META: Record<string, { icon: React.ReactNode; label: string; tint: string }> = {
  // Engagement types (a person publicly engaged with the cause on LinkedIn)
  commented: { icon: <ChatCircleDots size={15} weight="fill" />, label: "Commented", tint: "#956400" },
  liked_post: { icon: <Heart size={15} weight="fill" />, label: "Liked a post", tint: "#c2410c" },
  shared_post: { icon: <ShareNetwork size={15} weight="fill" />, label: "Shared", tint: "#1f6c9f" },
  new_fund: { icon: <CurrencyEur size={15} weight="fill" />, label: "New fund", tint: "#346538" },
  event_speaker: { icon: <Microphone size={15} weight="fill" />, label: "Speaking", tint: "#7c3aed" },
  // Fundable-moment types (mock + Claude triggers)
  appel_projets: { icon: <Megaphone size={15} weight="fill" />, label: "Appel à projets", tint: "#956400" },
  nomination: { icon: <UserCirclePlus size={15} weight="fill" />, label: "Nouvelle nomination", tint: "#1f6c9f" },
  nouveau_programme: { icon: <Gift size={15} weight="fill" />, label: "Nouveau programme", tint: "#7c3aed" },
  prix_ouvert: { icon: <Trophy size={15} weight="fill" />, label: "Prix ouvert", tint: "#b45309" },
  recherche_partenaires: { icon: <Handshake size={15} weight="fill" />, label: "Recherche partenaires", tint: "#346538" },
  // Real Sillage signal types (fallbacks)
  keyword_detection: { icon: <ChatCircleDots size={15} weight="fill" />, label: "Posted / commented", tint: "#956400" },
  connection: { icon: <LinkSimple size={15} weight="bold" />, label: "New connection", tint: "#1f6c9f" },
  job_update: { icon: <Briefcase size={15} weight="fill" />, label: "Changed role", tint: "#346538" },
};

function metaFor(type: string) {
  return TYPE_META[type] ?? { icon: <Broadcast size={15} weight="fill" />, label: type, tint: "#787774" };
}

function signalKey(s: Signal) {
  return String(s.id);
}

/** Pick the avatar whose interests/triggers best overlap the signal text. */
function matchAvatar(s: Signal, avatars: RefinedAvatar[]): RefinedAvatar | null {
  if (!avatars.length) return null;
  const hay = `${s.summary} ${s.lead?.title ?? ""}`.toLowerCase();
  let best = avatars[0];
  let bestScore = -1;
  for (const a of avatars) {
    const terms = [...(a.interests ?? []), ...(a.triggers ?? []), a.label]
      .join(" ")
      .toLowerCase()
      .split(/[^a-zàâäéèêëîïôùûüç]+/)
      .filter((t) => t.length > 4);
    const score = terms.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

export function CRMStage({
  icp,
  analysis,
  csvFilename,
  rowCount,
  onSaved,
}: {
  icp: ICPOutput;
  analysis: ClaudeAnalysis;
  csvFilename: string;
  rowCount: number;
  onSaved: (runs: RunRecord[]) => void;
}) {
  const [mode, setMode] = useState<"live" | "mock">("live");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [cached, setCached] = useState(false);
  const [auto, setAuto] = useState(true);
  const [enriched, setEnriched] = useState<Record<string, EnrichedLead>>({});
  const [enriching, setEnriching] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [sentKeys, setSentKeys] = useState<Record<string, boolean>>({});
  const [outreachKey, setOutreachKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeStream = useRef<(() => void) | null>(null);

  // Stream signals in one-by-one via SSE. `clear` resets the list (mode switch
  // / manual refresh); otherwise new signals just slide in and dedupe.
  const startStream = useCallback(
    (clear: boolean) => {
      closeStream.current?.();
      if (clear) {
        setSignals([]);
        setLiveError(null);
      }
      setStreaming(true);
      setLoading(clear);
      const seen = new Set<string>();
      closeStream.current = api.streamSignals(mode, {
        onSignal: (s) => {
          const key = String(s.id);
          if (seen.has(key)) return;
          seen.add(key);
          setSignals((prev) => (prev.some((p) => String(p.id) === key) ? prev : [...prev, s as Signal]));
          setLoading(false);
        },
        onDone: (d) => {
          setStreaming(false);
          setLoading(false);
          setCached(d.cached);
          setLiveError(d.live_error ?? null);
        },
        onError: (msg) => {
          setStreaming(false);
          setLoading(false);
          setLiveError(msg);
        },
      });
    },
    [mode]
  );

  function switchMode(next: "live" | "mock") {
    if (next === mode) return;
    setCached(false);
    setMode(next);
  }

  useEffect(() => {
    // Kick off the SSE subscription on mount / mode change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startStream(true);
    return () => closeStream.current?.();
  }, [startStream]);

  useEffect(() => {
    if (auto) {
      // Re-stream periodically; don't clear, so genuinely new signals arrive live.
      timer.current = setInterval(() => startStream(false), 20000);
    } else if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto, startStream]);

  const refresh = useCallback(() => startStream(true), [startStream]);

  async function enrich(s: Signal) {
    const key = signalKey(s);
    if (enriched[key] || enriching[key]) return;
    setEnriching((e) => ({ ...e, [key]: true }));
    try {
      const res = await api.enrichLead({
        name: s.lead?.name || s.account?.name || "Prospect",
        title: s.lead?.title,
        company: s.account?.name,
        linkedin_url: s.lead?.linkedin_url,
      });
      setEnriched((e) => ({ ...e, [key]: res.lead }));
      setSelected((sel) => ({ ...sel, [key]: true }));
    } catch {
      /* ignore */
    } finally {
      setEnriching((e) => ({ ...e, [key]: false }));
    }
  }

  const selectedLeads = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => enriched[k])
    .filter(Boolean) as EnrichedLead[];

  // Outreach drawer derived data.
  const outreachSignal = outreachKey ? signals.find((s) => signalKey(s) === outreachKey) ?? null : null;
  const outreachLead = outreachKey ? enriched[outreachKey] : undefined;
  const outreachProspect = outreachSignal
    ? {
        name: outreachLead?.name || outreachSignal.lead?.name || "Prospect",
        title: outreachLead?.title || outreachSignal.lead?.title,
        company: outreachLead?.company,
        email: outreachLead?.email,
        linkedin_url: outreachLead?.linkedin_url || outreachSignal.lead?.linkedin_url,
        signal_summary: outreachSignal.summary,
        signal_type: outreachSignal.type,
      }
    : null;
  const outreachAvatar = outreachSignal ? matchAvatar(outreachSignal, analysis.refined_avatars) : null;
  const cause = analysis.overview || undefined;

  async function save() {
    setSaving(true);
    try {
      const payload = {
        csv_filename: csvFilename,
        row_count: rowCount,
        avatar_count: analysis.refined_avatars.length,
        overview: analysis.overview,
        selected_leads: Object.entries(selected)
          .filter(([, v]) => v)
          .map(([k]) => {
            const sig = signals.find((s) => signalKey(s) === k);
            const lead = enriched[k];
            return { ...lead, signal_type: sig?.type };
          }),
        signals,
        icp_snapshot: icp,
      };
      const res = await api.saveRun(payload);
      setSavedId(res.run_id);
      onSaved(res.runs);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10">
      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${mode === "live" ? "animate-ping bg-[#346538]" : "bg-[#956400]"}`}
              />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${mode === "live" ? "bg-[#346538]" : "bg-[#956400]"}`} />
            </span>
            <h2 className="font-serif text-3xl tracking-[-0.02em] text-foreground">
              {mode === "live" ? "Live signals" : "Sample prospects"}
            </h2>
          </div>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-muted">
            <span>
              {mode === "live"
                ? `${signals.length} live signal${signals.length === 1 ? "" : "s"} from Sillage`
                : `${signals.length} sample prospect${signals.length === 1 ? "" : "s"} · enrich to reveal contact details`}
            </span>
            {streaming && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-[#346538]">
                <CircleNotch size={11} weight="bold" className="animate-spin" /> receiving…
              </span>
            )}
            {!streaming && cached && mode === "live" && (
              <span className="font-mono text-[11px] text-muted">· cached</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Live / Mock segmented toggle */}
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5 text-[12px]">
            <button
              onClick={() => switchMode("live")}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                mode === "live" ? "bg-foreground text-white" : "text-muted hover:text-foreground"
              }`}
            >
              Live
            </button>
            <button
              onClick={() => switchMode("mock")}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                mode === "mock" ? "bg-foreground text-white" : "text-muted hover:text-foreground"
              }`}
            >
              Mock
            </button>
          </div>
          <button
            onClick={() => setAuto((a) => !a)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] transition-colors ${
              auto ? "border-foreground/20 bg-surface text-foreground" : "border-border bg-surface text-muted"
            }`}
          >
            <ArrowClockwise size={14} weight="bold" className={auto ? "animate-spin" : ""} style={auto ? { animationDuration: "3s" } : {}} />
            Auto-refresh {auto ? "on" : "off"}
          </button>
          <button
            onClick={refresh}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-[12px] text-foreground transition-colors hover:border-foreground/30"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Signal feed */}
        <div className="flex flex-col gap-3">
          {loading && signals.length === 0 && (
            <div className="rounded-xl border border-border bg-surface p-8 text-center text-[13px] text-muted">
              <CircleNotch size={20} weight="bold" className="mx-auto mb-2 animate-spin text-accent" />
              {mode === "live" ? "Querying Sillage for live signals…" : "Loading sample prospects…"}
            </div>
          )}
          {!loading && signals.length === 0 && mode === "live" && (
            <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-[13px] text-muted">
              {liveError ? (
                <>
                  <p className="font-medium text-foreground">Sillage couldn&apos;t return live signals yet.</p>
                  <p className="mt-1 font-mono text-[11px] text-[#c2410c]">{liveError}</p>
                </>
              ) : (
                <p>No live signals yet. Agents just launched — detection can take a few minutes.</p>
              )}
              <button
                onClick={() => switchMode("mock")}
                className="mt-4 rounded-lg border border-border bg-background px-3 py-2 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/30"
              >
                Preview with sample prospects
              </button>
            </div>
          )}
          {!loading && signals.length === 0 && mode === "mock" && (
            <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-[13px] text-muted">
              No sample prospects available — upload a donor list first.
            </div>
          )}

          <AnimatePresence initial={false}>
            {signals.map((s) => {
              const key = signalKey(s);
              const meta = metaFor(s.type);
              const lead = enriched[key];
              const isSel = !!selected[key];
              return (
                <motion.div
                  key={key}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`rounded-xl border bg-surface p-4 transition-colors ${
                    isSel ? "border-foreground/25" : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: meta.tint + "18", color: meta.tint }}
                    >
                      {meta.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-foreground">
                          {s.lead?.name || s.account?.name || "Prospect"}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.05em]"
                          style={{ background: meta.tint + "18", color: meta.tint }}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] leading-5 text-muted">{s.summary}</p>

                      {!lead && s.lead?.linkedin_url && (
                        <a
                          href={s.lead.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
                        >
                          <LinkSimple size={11} weight="bold" /> LinkedIn only · no contact yet
                        </a>
                      )}

                      <AnimatePresence>
                        {lead && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="mt-3 overflow-hidden rounded-lg border border-border bg-background p-3"
                          >
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-foreground">
                              <span className="flex items-center gap-1.5">
                                <EnvelopeSimple size={13} weight="bold" className="text-muted" />
                                {lead.email || "no email found"}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Phone size={13} weight="bold" className="text-muted" />
                                {lead.phone || "no mobile found"}
                              </span>
                              {(lead.email || lead.phone) ? (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.05em]"
                                  style={{
                                    background: lead.email_status === "DELIVERABLE" ? "#edf3ec" : "#fbf3db",
                                    color: lead.email_status === "DELIVERABLE" ? "#346538" : "#956400",
                                  }}
                                >
                                  {lead.confidence}% · {lead.email_status.replace(/_/g, " ").toLowerCase()}
                                </span>
                              ) : (
                                <span className="rounded-full bg-[#f4e4e4] px-2 py-0.5 text-[9px] uppercase tracking-[0.05em] text-[#c2410c]">
                                  no contact found
                                </span>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="shrink-0">
                      {!lead ? (
                        <button
                          onClick={() => enrich(s)}
                          disabled={enriching[key]}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/30 disabled:opacity-60"
                        >
                          {enriching[key] ? (
                            <CircleNotch size={13} weight="bold" className="animate-spin" />
                          ) : (
                            <Sparkle size={13} weight="fill" className="text-accent" />
                          )}
                          {enriching[key] ? "Enriching…" : "Enrich"}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setOutreachKey(key)}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                              sentKeys[key]
                                ? "border-[#cfe3cf] bg-[#edf3ec] text-[#346538]"
                                : "border-border bg-background text-foreground hover:border-foreground/30"
                            }`}
                          >
                            {sentKeys[key] ? (
                              <Check size={13} weight="bold" />
                            ) : (
                              <PaperPlaneTilt size={13} weight="fill" className="text-accent" />
                            )}
                            {sentKeys[key] ? "Sent" : "Draft email"}
                          </button>
                          <button
                            onClick={() => setSelected((sel) => ({ ...sel, [key]: !sel[key] }))}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                              isSel
                                ? "border-foreground bg-foreground text-white"
                                : "border-border bg-background text-transparent hover:border-foreground/40"
                            }`}
                            aria-label="Select prospect"
                          >
                            <Check size={13} weight="bold" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Selected pipeline / save */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <span className="text-[13px] font-medium text-foreground">Outreach list</span>
              <span className="font-mono text-xs text-muted">{selectedLeads.length} selected</span>
            </div>

            <div className="max-h-[380px] overflow-y-auto p-3">
              {selectedLeads.length === 0 ? (
                <p className="px-2 py-8 text-center text-[12px] text-muted">
                  Enrich a patron to add them to your outreach list.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedLeads.map((l) => (
                    <div key={l.email} className="rounded-lg border border-border bg-background px-3 py-2.5">
                      <p className="text-[13px] font-medium text-foreground">{l.name}</p>
                      <p className="truncate text-[11px] text-muted">{l.title || l.company}</p>
                      <p className="mt-1 truncate font-mono text-[10px] text-muted">{l.email}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border p-4">
              <button
                onClick={save}
                disabled={saving || selectedLeads.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-5 py-3 text-[13px] font-medium text-white transition-all duration-200 hover:bg-[#1f2325] active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? (
                  <CircleNotch size={15} weight="bold" className="animate-spin" />
                ) : savedId ? (
                  <Check size={15} weight="bold" />
                ) : (
                  <FloppyDisk size={15} weight="fill" />
                )}
                {savedId ? "Saved to memory" : "Save pipeline"}
              </button>
              {savedId && (
                <p className="mt-2 flex items-center justify-center gap-1.5 font-mono text-[10px] text-muted">
                  <DownloadSimple size={11} weight="bold" /> run {savedId.slice(0, 8)} · view in Saved
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <OutreachDrawer
        open={!!outreachKey}
        prospect={outreachProspect}
        avatar={outreachAvatar}
        cause={cause}
        onClose={() => setOutreachKey(null)}
        onSent={() => {
          if (outreachKey) {
            setSentKeys((s) => ({ ...s, [outreachKey]: true }));
            setSelected((sel) => ({ ...sel, [outreachKey]: true }));
          }
        }}
      />
    </div>
  );
}
