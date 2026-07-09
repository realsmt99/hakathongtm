"use client";

import { motion } from "framer-motion";
import { ArrowRight, CircleNotch, Quotes } from "@phosphor-icons/react";
import { AvatarGraph } from "./AvatarGraph";
import type { ICPOutput, ClaudeAnalysis } from "@/app/_lib/api";

const LEGEND = [
  { label: "Patron", color: "#2f3437" },
  { label: "Sector", color: "#1f6c9f" },
  { label: "Role", color: "#346538" },
  { label: "Fundable moment", color: "#956400" },
];

export function GraphStage({
  icp,
  analysis,
  pushing,
  onPush,
}: {
  icp: ICPOutput;
  analysis: ClaudeAnalysis;
  pushing: boolean;
  onPush: () => void;
}) {
  return (
    <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mb-10 max-w-2xl"
      >
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.12em] text-muted">
          Patron archetypes synthesized from real activity
        </p>
        <h2 className="font-serif text-4xl leading-[1.1] tracking-[-0.02em] text-foreground">
          Here&apos;s the patron who funds causes like yours.
        </h2>
        <p className="mt-3 text-[15px] leading-7 text-muted">{analysis.overview}</p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* Graph */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="rounded-xl border border-border bg-surface"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="text-[13px] font-medium text-foreground">Patron graph</span>
            <div className="flex gap-3">
              {LEGEND.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: l.color }}
                  />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
          <div className="h-[440px] w-full">
            <AvatarGraph graph={icp.graph_network} />
          </div>
        </motion.div>

        {/* Refined avatars */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18 }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-4 overflow-y-auto pr-1" style={{ maxHeight: 440 }}>
            {analysis.refined_avatars.map((a, i) => (
              <div
                key={a.label}
                className="rounded-xl border border-border bg-surface p-5"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground font-mono text-xs text-white">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <div>
                    <p className="text-[14px] font-medium text-foreground">{a.label}</p>
                    <p className="text-[11px] text-muted">{a.tone}</p>
                  </div>
                </div>
                <p className="mt-3 text-[13px] leading-6 text-foreground/80">{a.summary}</p>

                {a.triggers?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {a.triggers.slice(0, 5).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-[#fbf3db] px-2 py-0.5 text-[10px] uppercase tracking-[0.04em] text-[#956400]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {a.evidence?.length > 0 && (
                  <div className="mt-3 flex items-start gap-2 border-t border-border pt-3">
                    <Quotes size={14} weight="fill" className="mt-0.5 shrink-0 text-muted" />
                    <p className="text-[12px] italic leading-5 text-muted">
                      {a.evidence[0]}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={onPush}
            disabled={pushing}
            className="group flex items-center justify-center gap-2 rounded-lg bg-foreground px-6 py-3.5 text-[14px] font-medium text-white transition-all duration-200 hover:bg-[#1f2325] active:scale-[0.98] disabled:opacity-60"
          >
            {pushing ? (
              <>
                <CircleNotch size={16} weight="bold" className="animate-spin" />
                Pushing persona to Sillage…
              </>
            ) : (
              <>
Push persona to Sillage &amp; go live
                <ArrowRight
                  size={16}
                  weight="bold"
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </>
            )}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
