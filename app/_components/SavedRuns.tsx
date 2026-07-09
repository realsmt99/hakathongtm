"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ClockCounterClockwise, CaretDown, CaretRight } from "@phosphor-icons/react";
import type { RunRecord } from "@/app/_lib/api";

interface CrmDetail {
  run_id: string;
  created_at: string;
  overview: string;
  selected_leads: {
    name: string;
    title?: string;
    company?: string;
    email?: string;
    phone?: string;
    signal_type?: string;
  }[];
  signals: unknown[];
}

export function SavedRuns({
  open,
  runs,
  onClose,
}: {
  open: boolean;
  runs: RunRecord[];
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CrmDetail>>({});

  useEffect(() => {
    if (!expanded || details[expanded]) return;
    fetch(`/api/save-run?id=${expanded}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.detail) setDetails((prev) => ({ ...prev, [expanded]: d.detail }));
      })
      .catch(() => {});
  }, [expanded, details]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-background"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <ClockCounterClockwise size={18} weight="bold" className="text-foreground" />
                <span className="text-[14px] font-medium text-foreground">Saved pipelines</span>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:text-foreground"
              >
                <X size={15} weight="bold" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {runs.length === 0 ? (
                <p className="px-2 py-10 text-center text-[13px] text-muted">
                  No saved pipelines yet. Save one from the live view.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {runs.map((r) => {
                    const isOpen = expanded === r.run_id;
                    const detail = details[r.run_id];
                    return (
                      <div key={r.run_id} className="rounded-xl border border-border bg-surface">
                        <button
                          onClick={() => setExpanded(isOpen ? null : r.run_id)}
                          className="flex w-full items-center justify-between px-4 py-3 text-left"
                        >
                          <div>
                            <p className="text-[13px] font-medium text-foreground">{r.csv_filename}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-muted">
                              {new Date(r.created_at).toLocaleString()} · {r.signal_count} signals · {r.avatar_count} avatars
                            </p>
                          </div>
                          {isOpen ? (
                            <CaretDown size={14} weight="bold" className="text-muted" />
                          ) : (
                            <CaretRight size={14} weight="bold" className="text-muted" />
                          )}
                        </button>

                        <AnimatePresence>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden border-t border-border"
                            >
                              <div className="p-4">
                                {detail?.overview && (
                                  <p className="mb-3 text-[12px] leading-5 text-muted">{detail.overview}</p>
                                )}
                                {detail ? (
                                  detail.selected_leads.length > 0 ? (
                                    <div className="flex flex-col gap-2">
                                      {detail.selected_leads.map((l, i) => (
                                        <div key={i} className="rounded-lg border border-border bg-background px-3 py-2">
                                          <p className="text-[12px] font-medium text-foreground">{l.name}</p>
                                          <p className="truncate text-[10px] text-muted">{l.title || l.company}</p>
                                          {l.email && (
                                            <p className="mt-0.5 truncate font-mono text-[10px] text-muted">{l.email}</p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[12px] text-muted">No leads saved in this run.</p>
                                  )
                                ) : (
                                  <p className="text-[12px] text-muted">Loading…</p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
