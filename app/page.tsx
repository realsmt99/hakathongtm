"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkle, ClockCounterClockwise, ArrowCounterClockwise } from "@phosphor-icons/react";
import { UploadHero } from "./_components/UploadHero";
import { ThinkingStream, type ThinkStep } from "./_components/ThinkingStream";
import { GraphStage } from "./_components/GraphStage";
import { CRMStage } from "./_components/CRMStage";
import { SavedRuns } from "./_components/SavedRuns";
import { api } from "./_lib/api";
import type { Row, ICPOutput, ClaudeAnalysis, RunRecord } from "./_lib/api";

type Phase = "upload" | "thinking" | "graph" | "crm";

const INITIAL_STEPS: ThinkStep[] = [
  { key: "parse", label: "Reading your donor list and validating rows", status: "pending" },
  { key: "baseline", label: "Sketching baseline patron avatars", status: "pending" },
  { key: "seed", label: "Tracking the donors in Sillage (people-first)", status: "pending" },
  { key: "harvest", label: "Harvesting their real LinkedIn activity", status: "pending" },
  { key: "analyze", label: "Claude is profiling the fundable-patron archetypes", status: "pending" },
];

export default function Home() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [steps, setSteps] = useState<ThinkStep[]>(INITIAL_STEPS);
  const [rows, setRows] = useState<Row[]>([]);
  const [filename, setFilename] = useState("upload.csv");
  const [icp, setIcp] = useState<ICPOutput | null>(null);
  const [analysis, setAnalysis] = useState<ClaudeAnalysis | null>(null);
  const [pushing, setPushing] = useState(false);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);

  const loadRuns = useCallback(async () => {
    try {
      setRuns(await api.runs());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  function patch(key: string, status: ThinkStep["status"], detail?: string) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, status, detail: detail ?? s.detail } : s)));
  }

  async function runPipeline(file: File) {
    setPhase("thinking");
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    try {
      patch("parse", "active");
      const up = await api.upload(file);
      setRows(up.rows);
      setFilename(up.filename);
      patch("parse", "done", `${up.valid_rows} valid rows · ${up.skipped} skipped`);

      patch("baseline", "active");
      const synth = await api.synthesize(up.rows);
      setIcp(synth.icp);
      patch("baseline", "done", `${synth.icp.avatars.length} baseline avatars · ${synth.icp.sillage_feed_parameters.target_industries.length} industries`);

      patch("seed", "active");
      const seed = await api.seedAccounts(up.rows);
      patch("seed", "done", `${seed.leads_resolved} patrons resolved · ${seed.accounts_pushed} accounts tracked`);

      patch("harvest", "active");
      const harvest = await api.harvest();
      patch(
        "harvest",
        "done",
        `${harvest.activity_count} activity items${harvest.mock ? " (simulated)" : ""} · ${harvest.content_count} posts/comments · ${harvest.signal_count} signals`
      );

      patch("analyze", "active");
      const seedAvatars = synth.icp.avatars.map((a) => ({
        label: a.label,
        dominantIndustry: a.dominantIndustry,
        seniority: a.seniority,
      }));
      const analyzed = await api.analyze(
        harvest.activity_full,
        seedAvatars,
        synth.icp.sillage_feed_parameters.target_industries
      );
      setAnalysis(analyzed.analysis);
      patch("analyze", "done", `${analyzed.analysis.refined_avatars.length} refined avatars from ${analyzed.analyzed_count} items`);

      await new Promise((r) => setTimeout(r, 500));
      setPhase("graph");
    } catch (e) {
      const active = steps.find((s) => s.status === "active");
      const msg = e instanceof Error ? e.message : "Something went wrong";
      if (active) patch(active.key, "error", msg);
      else patch("parse", "error", msg);
    }
  }

  async function pushPersona() {
    if (!analysis) return;
    setPushing(true);
    try {
      const locCount: Record<string, number> = {};
      rows.forEach((r) => {
        if (r.location) locCount[r.location] = (locCount[r.location] || 0) + 1;
      });
      const location = Object.entries(locCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "Paris, France";
      await api.refinePersona(analysis, location);
      setPhase("crm");
    } catch {
      /* stay on graph */
    } finally {
      setPushing(false);
    }
  }

  function reset() {
    setPhase("upload");
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setRows([]);
    setIcp(null);
    setAnalysis(null);
  }

  return (
    <>
      <div className="ambient drift" />

      {/* Header */}
      <header className="relative z-30 flex items-center justify-between px-6 py-4">
        <button onClick={reset} className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-white">
            <Sparkle size={15} weight="fill" />
          </span>
          <span className="text-[14px] font-medium tracking-tight text-foreground">Mécène · Patron Radar</span>
        </button>

        <div className="flex items-center gap-2">
          {phase !== "upload" && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-foreground/30"
            >
              <ArrowCounterClockwise size={13} weight="bold" /> New
            </button>
          )}
          <button
            onClick={() => setSavedOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-foreground/30"
          >
            <ClockCounterClockwise size={13} weight="bold" /> Saved
            {runs.length > 0 && (
              <span className="ml-0.5 rounded-full bg-foreground px-1.5 text-[10px] text-white">{runs.length}</span>
            )}
          </button>
        </div>
      </header>

      <main className="relative flex-1">
        <AnimatePresence mode="wait">
          {phase === "upload" && (
            <motion.div key="upload" exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <UploadHero onFile={runPipeline} />
            </motion.div>
          )}
          {phase === "thinking" && (
            <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ThinkingStream steps={steps} />
            </motion.div>
          )}
          {phase === "graph" && icp && analysis && (
            <motion.div key="graph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <GraphStage icp={icp} analysis={analysis} pushing={pushing} onPush={pushPersona} />
            </motion.div>
          )}
          {phase === "crm" && icp && analysis && (
            <motion.div key="crm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CRMStage
                icp={icp}
                analysis={analysis}
                csvFilename={filename}
                rowCount={rows.length}
                onSaved={setRuns}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <SavedRuns open={savedOpen} runs={runs} onClose={() => setSavedOpen(false)} />
    </>
  );
}
