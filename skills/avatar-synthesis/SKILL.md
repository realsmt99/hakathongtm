---
name: avatar-synthesis
description: Turn real (or realistic-mock) LinkedIn activity from corporate-foundation and mécénat leaders into evidence-grounded PATRON AVATARS, then collapse them into ONE Sillage persona that surfaces new fundable moments.
---

# Avatar Synthesis — Patron Archetypes for Mécénat Fundraising

This skill documents the exact methodology implemented in `lib/avatar-engine.ts`.
It is the single source of truth for **how** we go from harvested activity to
avatars to a Sillage persona. If you change the method, change both this file and
the module together.

## Purpose

We run a cause (arts / women's empowerment / social inclusion / savoir-faire) and
want to find **new corporate foundations to approach for funding**. We already
know a handful of real patrons (the CSV donors). This skill profiles *what a
fundable patron looks like* from their real behavior, so we can recognize the
same archetype at **other** foundations at the moment they are receptive.

## Inputs

1. **`activity: ActivityItem[]`** — harvested LinkedIn posts/comments/signals from
   the seed patrons (or realistic mocks when Sillage has nothing yet). Each item:
   `{ text, type, company?, author? }`.
2. **`seedContext`** — the keyword-guessed baseline from the ICP synthesizer:
   `{ seedAvatars?: {label, dominantIndustry, seniority}[], seedIndustries?: string[] }`.

## Method (step by step)

1. **Ground only in evidence.** Never invent a patron trait that is not visible in
   the activity. Every archetype must carry at least one short verbatim quote.
2. **Cluster by cause + giving behavior**, not by job title. Two people with
   different titles who fund the same cause the same way are one archetype.
3. **Name each archetype** for the cause it champions
   (e.g. *"Arts & Culture Patron"*, *"Women's Empowerment Funder"*).
4. **Extract fundable moments as `triggers`** — short phrases that signal an
   opening to approach them: a new grant program, an open call for projects, a
   fresh appointment, a budget/prize announcement, a search for partners.
5. **Write a concrete `outreach_angle`** grounded in their activity: how a cause
   could realistically ask them for mécénat.
6. **Produce 2–4 archetypes.** Fewer if the evidence is thin; never pad.

## Avatar JSON schema

```jsonc
{
  "overview": "2-3 sentences on the dominant causes & giving themes",
  "refined_avatars": [
    {
      "label": "Arts & Culture Patron",
      "summary": "1-2 sentences: who they are and what they fund",
      "interests": ["causes and programs they support"],
      "pains": ["what they are trying to solve or fund"],
      "triggers": ["fundable moments — new program, open call, appointment, budget"],
      "tone": "formal | mission-driven | institutional | ...",
      "outreach_angle": "one concrete, evidence-grounded way to ask for funding",
      "evidence": ["short verbatim quotes from the activity that justify this"]
    }
  ],
  "recommended_persona_keywords": ["cause & mécénat terms to feed Sillage agents"],
  "recommended_industries": ["sectors these foundations belong to"]
}
```

## Quality rules

- **Evidence-first.** Empty `evidence` → the archetype is invalid.
- **Fundable-moment triggers**, not generic interests. "Open call for projects" is
  a trigger; "supports the arts" is not.
- **French mécénat vocabulary.** Prefer terms like *appel à projets, mécénat,
  fondation d'entreprise, dotation, lauréat, partenariat* in keywords/triggers.
- **No PII invention.** Do not fabricate names, emails, or amounts.

## Mapping avatars → ONE Sillage persona

We push a **single combined persona** (product decision: one persona, one keyword
agent). `deriveCombinedPersona(analysis, location)`:

- `keywords`   = de-duped `recommended_persona_keywords` (cap 20)
- `industries` = de-duped `recommended_industries` (cap 10)
- `job_title`  = dominant (first) avatar label
- `location`   = most common donor location (default `Paris, France`)
- `triggers`   = union of every avatar's `triggers` (cap 15) → the tracking
  keywords for the single `keyword_detection` agent.

The agent then surfaces **new patrons at other foundations** hitting those
fundable moments. When Sillage has no live signals yet, `lib/mock-activity.ts`
provides realistic French-foundation fallbacks so the pipeline never looks empty.
