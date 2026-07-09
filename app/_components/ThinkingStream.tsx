"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, CircleNotch, Warning } from "@phosphor-icons/react";

export type StepStatus = "pending" | "active" | "done" | "error";

export interface ThinkStep {
  key: string;
  label: string;
  detail?: string;
  status: StepStatus;
}

export function ThinkingStream({ steps }: { steps: ThinkStep[] }) {
  return (
    <div className="relative z-10 mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center px-6">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-8 font-serif text-3xl tracking-[-0.02em] text-foreground"
      >
        Thinking through your list
        <span className="blink">…</span>
      </motion.p>

      <div className="flex flex-col">
        {steps.map((s) => (
          <div
            key={s.key}
            className="flex items-start gap-3.5 border-b border-border py-4 last:border-b-0"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {s.status === "done" && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#edf3ec] text-[#346538]">
                  <Check size={12} weight="bold" />
                </span>
              )}
              {s.status === "active" && (
                <CircleNotch size={18} weight="bold" className="animate-spin text-accent" />
              )}
              {s.status === "error" && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#fdebec] text-[#9f2f2d]">
                  <Warning size={12} weight="bold" />
                </span>
              )}
              {s.status === "pending" && (
                <span className="h-2 w-2 rounded-full bg-border" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={`text-[14px] transition-colors ${
                  s.status === "pending" ? "text-muted/60" : "text-foreground"
                }`}
              >
                {s.label}
              </p>
              <AnimatePresence mode="wait">
                {s.detail && (s.status === "active" || s.status === "done" || s.status === "error") && (
                  <motion.p
                    key={s.detail}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mt-1 font-mono text-xs leading-5 text-muted"
                  >
                    {s.detail}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
