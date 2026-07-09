"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  PaperPlaneTilt,
  ArrowsClockwise,
  CircleNotch,
  Check,
  Sparkle,
  EnvelopeSimple,
  Warning,
} from "@phosphor-icons/react";
import { api } from "@/app/_lib/api";
import type { RefinedAvatar } from "@/app/_lib/api";

export interface OutreachProspect {
  name: string;
  title?: string;
  company?: string;
  email?: string;
  linkedin_url?: string;
  signal_summary?: string;
  signal_type?: string;
}

export function OutreachDrawer({
  open,
  prospect,
  avatar,
  cause,
  orgName,
  senderName,
  onClose,
  onSent,
}: {
  open: boolean;
  prospect: OutreachProspect | null;
  avatar: RefinedAvatar | null;
  cause?: string;
  orgName?: string;
  senderName?: string;
  onClose: () => void;
  onSent?: (prospect: OutreachProspect) => void;
}) {
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!prospect) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await api.generateOutreach({
        prospect: {
          name: prospect.name,
          title: prospect.title,
          company: prospect.company,
          signal_summary: prospect.signal_summary,
          signal_type: prospect.signal_type,
        },
        avatar,
        sender: { cause, org_name: orgName, sender_name: senderName },
      });
      setSubject(res.email.subject);
      setBodyText(res.email.body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [prospect, avatar, cause, orgName, senderName]);

  // Auto-generate when the drawer opens for a new prospect.
  useEffect(() => {
    if (open && prospect) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setSubject("");
      setBodyText("");
      setSentId(null);
      setError(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prospect?.name, prospect?.email]);

  async function send() {
    if (!prospect?.email) {
      setError("This prospect has no email yet — enrich them first.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await api.sendOutreach({
        to: prospect.email,
        subject,
        text: bodyText,
        name: prospect.name,
      });
      setSentId(res.id);
      onSent?.(prospect);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <AnimatePresence>
      {open && prospect && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col border-l border-border bg-background shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkle size={15} weight="fill" className="text-accent" />
                  <span className="text-[13px] font-medium text-foreground">Tailored outreach</span>
                </div>
                <p className="mt-1 truncate text-[12px] text-muted">
                  To <span className="text-foreground">{prospect.name}</span>
                  {prospect.title ? ` · ${prospect.title}` : ""}
                </p>
                {prospect.email ? (
                  <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted">
                    <EnvelopeSimple size={12} weight="bold" /> {prospect.email}
                  </p>
                ) : (
                  <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-[#c2410c]">
                    <Warning size={12} weight="bold" /> no email — enrich first
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
                aria-label="Close"
              >
                <X size={15} weight="bold" />
              </button>
            </div>

            {/* Avatar context chip */}
            {avatar && (
              <div className="border-b border-border bg-surface px-5 py-2.5">
                <p className="text-[11px] text-muted">
                  Tailored to <span className="font-medium text-foreground">{avatar.label}</span>
                  {avatar.tone ? ` · ${avatar.tone}` : ""}
                </p>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {generating && !bodyText ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <CircleNotch size={22} weight="bold" className="animate-spin text-accent" />
                  <p className="text-[13px] text-muted">Writing a personal email based on their signal…</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Subject</span>
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      disabled={!!sentId}
                      className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] text-foreground outline-none transition-colors focus:border-foreground/40 disabled:opacity-60"
                      placeholder="Subject line"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Message</span>
                    <textarea
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                      disabled={!!sentId}
                      rows={16}
                      className="resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] leading-6 text-foreground outline-none transition-colors focus:border-foreground/40 disabled:opacity-60"
                      placeholder="Email body"
                    />
                  </label>
                  <p className="text-[11px] text-muted">
                    Edit anything above, or regenerate for a fresh take. This email is grounded in their recent signal.
                  </p>
                </div>
              )}

              {error && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#e7c9b8] bg-[#fbf0ea] px-3 py-2.5 text-[12px] text-[#c2410c]">
                  <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
                  <span className="font-mono">{error}</span>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center gap-2 border-t border-border px-5 py-4">
              <button
                onClick={generate}
                disabled={generating || sending || !!sentId}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/30 disabled:opacity-50"
              >
                {generating ? (
                  <CircleNotch size={14} weight="bold" className="animate-spin" />
                ) : (
                  <ArrowsClockwise size={14} weight="bold" />
                )}
                Regenerate
              </button>
              <button
                onClick={send}
                disabled={sending || generating || !!sentId || !prospect.email || !subject || !bodyText}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-[13px] font-medium text-white transition-all duration-200 hover:bg-[#1f2325] active:scale-[0.98] disabled:opacity-50"
              >
                {sending ? (
                  <CircleNotch size={15} weight="bold" className="animate-spin" />
                ) : sentId ? (
                  <Check size={15} weight="bold" />
                ) : (
                  <PaperPlaneTilt size={15} weight="fill" />
                )}
                {sentId ? "Sent" : "Send email"}
              </button>
            </div>
            {sentId && (
              <p className="px-5 pb-4 -mt-2 text-center font-mono text-[10px] text-muted">
                delivered via Resend · id {sentId.slice(0, 12)}
              </p>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
