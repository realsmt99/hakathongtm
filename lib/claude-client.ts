/**
 * Backwards-compatibility layer.
 *
 * The avatar-generation logic now lives in `lib/avatar-engine.ts` (the executable
 * implementation of skills/avatar-synthesis/SKILL.md). This module re-exports the
 * types and exposes `analyzeInterests` as an alias of `synthesizeAvatars` so
 * existing API routes keep working without changes.
 */
export type {
  RefinedAvatar,
  ClaudeAnalysis,
  ActivityItem,
  SeedContext,
  CombinedPersona,
} from "@/lib/avatar-engine";

export {
  synthesizeAvatars,
  synthesizeAvatars as analyzeInterests,
  deriveCombinedPersona,
  buildSystemPrompt,
  buildUserPrompt,
  extractJSON,
} from "@/lib/avatar-engine";
