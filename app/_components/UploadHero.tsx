"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { UploadSimple, FileCsv } from "@phosphor-icons/react";

export function UploadHero({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    if (files && files.length > 0) onFile(files[0]);
  }

  return (
    <div className="relative z-10 flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-2xl"
      >
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.12em] text-muted">
          Mécène · Patron Radar
        </div>
        <h1 className="font-serif text-5xl leading-[1.05] tracking-[-0.02em] text-foreground sm:text-6xl">
          Find your next patron,
          <br />
          at their most fundable moment.
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-7 text-muted">
          Drop a list of foundation donors you already know. We study what they
          champion, let Claude build the fundable-patron archetype, and surface
          new corporate foundations the moment they open a call or a program.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className="mt-10 w-full max-w-md"
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`group flex w-full flex-col items-center gap-3 rounded-xl border border-dashed px-8 py-12 transition-all duration-200 ${
            dragging
              ? "border-accent bg-[#fbf3db]/40"
              : "border-border bg-surface hover:border-foreground/30"
          }`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-transform duration-200 group-hover:-translate-y-0.5">
            <UploadSimple size={22} weight="bold" />
          </span>
          <span className="text-[15px] font-medium text-foreground">
            Upload your donor list
          </span>
          <span className="flex items-center gap-1.5 font-mono text-xs text-muted">
            <FileCsv size={14} weight="bold" /> name · title · company · LinkedIn URL
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </motion.div>
    </div>
  );
}
