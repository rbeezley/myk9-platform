# Phase 1: Multi-Sport Templates — Design Document

**Date:** February 24, 2026
**Updated:** February 26, 2026
**Status:** Data Layer Complete — Scoresheet Refactoring Remaining
**Depends on:** Nothing (foundational phase)
**Enables:** Phase 2 (Exhibitor Platform & Premium)

---

## Overview

Phase 1 introduces a sport template system that separates the universal platform layer from sport-specific rules. The platform knows how to run a trial. The template tells it which sport's rules to apply.

Three scent-based sports from three organizations serve as the initial templates:
- **AKC Scent Work** (primary customer base)
- **UKC Nosework** (second largest customer base)
- **ASCA Scent Detection**

The architecture must support structurally different sports (obedience, agility, conformation) in the future without platform code changes.

---

## Three-Sport Comparison

| Dimension | AKC Scent Work | UKC Nosework | ASCA Scent Detection |
|-----------|---------------|--------------|---------------------|
| **Elements** | Container, Interior, Exterior, Buried, HD, Detective | Container, Interior, Exterior, Vehicle, HD | Container, Interior, Exterior, Vehicle |
| **Levels** | Novice, Advanced, Excellent, Master | Novice, Advanced, Superior, Master, Elite | Novice, Open, Advanced, Excellent |
| **Sections** | A/B at Novice only | A/B at every level | None |
| **Timer** | Single (stop on Alert/Finish) | Single (Nov/Adv), Dual search+element (Sup/Mas/Elite) | Single |
| **Multi-area** | Interior Excellent (2), Interior Master (3), HD Master (2) | No multi-area | Open (2), Advanced (2), Excellent (3) |
| **Odors** | Birch, Anise, Clove, Cypress | Birch, Anise, Clove, Myrrh, Vetiver (one per level) | Regional lines: US/Canada/Europe |
| **Q criteria** | Find all hides in time, no disqualifying errors | Find all hides in time, no disqualifying errors | Find all hides in time, no disqualifying errors |
| **Faults** | Affect placement only, no max | Affect placement only | Affect placement only |
| **Title legs** | 3 Qs (basic), 10 Qs (elite) | 2 Qs per element title | 3 Qs (basic), 10 total (Level C) |
| **Title tiers** | Element > Level > Elite Element > Elite Level > Detective | Element > Level > Champion > Grand Champion > NWCH/NWGC | Element > Level C > Combined |
| **Export** | AKC marked catalog format | UKC judge's book | ASCA paperwork |

Core mechanic is identical across all three: pass/fail on finding hides within time, with faults affecting placement only.

---

## Sport Template Schema

A sport template is a configuration object answering four questions: identity, scoring rules, operational requirements, and export format.

```
SportTemplate {
  // IDENTITY
  organization        — "AKC" | "UKC" | "ASCA"
  sportName           — "Scent Work" | "Nosework" | "Scent Detection"
  sportCode           — "akc-scent-work" | "ukc-nosework" | "asca-scent-detection"

  // STRUCTURE
  elements[]          — list of elements (Container, Interior, etc.)
  levels[]            — ordered list of levels (Novice > Master, etc.)
  sections            — "novice-only" | "all-levels" | "none"
  divisions[]         — optional groupings (AKC: "Odor Search" + "HD" + "Detective")

  // PER-CLASS RULES (element x level matrix)
  classRules[element][level] {
    maxTimeSeconds     — fixed or { min, max } range (judge-set)
    hideCount          — fixed or { min, max } range
    hidesKnown         — boolean (handler knows count?)
    areaCount          — 1, 2, or 3
    distractions       — { count, types[] }
    timerMode          — "single" | "dual"
    odors[]            — which odors are in play
  }

  // TITLE DEFINITIONS
  titles[] {
    abbreviation       — "SCN", "SWN", "NWCH", etc.
    fullName           — "Scent Work Container Novice"
    type               — "element" | "level" | "elite" | "champion" | "continuation"
    requirements       — { qualifyingLegs, elements[], prerequisiteTitle? }
    supersedes[]       — which lower titles it replaces
  }

  // OPERATIONAL REQUIREMENTS [ADDED]
  operationalConfig {
    sizeCategories[]   — optional dog size groups (S/M/L for container prep)
    ringSetup          — sport-specific ring/search area configuration notes
    equipmentNeeded[]  — containers, barriers, hides, distraction items
    mrvMinutesPerEntry — weighted ring time for capacity calculations (from classRules)
  }

  // EXPORT FORMAT
  exportConfig {
    format             — "akc-catalog" | "ukc-judges-book" | "asca-paperwork"
    requiredFields[]   — what must appear in the submission
    recordingFee       — per-entry fee to the organization
  }
}
```

The class rules are a matrix, not a flat list. Each element x level combination has its own configuration. This supports AKC Interior Master (3 areas) while Container Master has 1, and UKC dual timers only at Superior+.

---

## Show/Trial Relationship

`sport_type` belongs on the **trial**, not the show. A show is an event (club, venue, dates). A trial is a competition governed by a specific sport's rules.

Example: A UKC "Total Dog" weekend:
```
Show: "Heartland Dog Club Spring Classic"
  |-- Trial: UKC Nosework (Saturday)
  |-- Trial: UKC Nosework (Sunday)
  |-- Trial: UKC Obedience (Saturday)
  |-- Trial: UKC Obedience (Sunday)
  |-- Trial: UKC Conformation (Saturday)
```

One exhibitor enters one show, across multiple trials. Entry, payment, and armband management at the show level. Classes, scoring, and results at the trial level.

---

## Template-Driven Workflow

**Step 1: Secretary picks the organization and sport when creating a trial.** Sets `sport_type` on the trial record, loads the corresponding template.

**Step 2: Template drives class generation.** Secretary selects which elements and levels to offer. System generates classes with correct time limits, hide counts, area counts, and distraction requirements pre-filled. Judge-set values left within allowed ranges.

**Step 3: Template drives the scoresheet.** System reads `sport_type`, element, and level to load correct scoresheet configuration — timer mode, input fields, NQ reasons, multi-area handling.

**Step 4: Template drives title tracking.** (Phase 2 feature, but schema supports it from day one.) Title engine reads title definitions to compute progress.

---

## Database Changes

### Changes to existing tables

**`trials`** — Add `sport_type` column (text, not null, default 'akc-scent-work'). Existing trials default to AKC Scent Work.

**`classes`** — No structural changes. Existing columns (element, level, section, time limits, area counts) support all three sports. Template pre-fills them.

### New tables

**`sport_templates`** — Template identity: organization, sport_name, sport_code, elements (array), levels (array), section_mode, divisions (array). One row per sport.

**`sport_class_rules`** — Element x level matrix. One row per combination: sport_template_id, element, level, max_time_seconds (or min/max range), hide_count (or min/max), hides_known, area_count, distraction_count, distraction_types, timer_mode, odors. Class creation wizard reads this to pre-fill defaults.

**`sport_titles`** — Title definitions. One row per title: sport_template_id, abbreviation, full_name, title_type, required_legs, required_elements, prerequisite_title_id, supersedes_title_ids. Title tracking engine (Phase 2) reads this table.

### Drop `class_templates` table

Migration 005 created a `class_templates` table with CRUD functions (`templateQueries.ts`) and React Query hooks (`useTemplatesDatabase.ts`). None of these are imported or called anywhere in the app. The table stores rules as an unstructured JSONB blob — the new normalized tables replace it.

**Action:** Add a migration that drops `class_templates`. Delete the dead code:
- `services/database/queries/templateQueries.ts`
- `hooks/queries/useTemplatesDatabase.ts`

### Data migration

Migration script creates three sport templates and populates class rules from existing hardcoded values in `akcScentWorkRules.ts`, UKC scoresheet logic, and ASCA configurations. Rules already exist in code; they move into the database.

---

## Existing Template System — Migration Strategy

The app currently has two template systems. Phase 1 replaces both with the new database tables.

### Current state

| System | Location | Status |
|--------|----------|--------|
| `templateStore` (Zustand) | `store/templateStore.ts` | **Active.** Drives the Create Show wizard. Loads from hardcoded TS files, persists to localStorage. |
| `class_templates` (DB) | Migration 005 | **Dead code.** Table exists but no app code queries it. |

### Target state

`sport_templates` + `sport_class_rules` become the source of truth. `templateStore` remains as a runtime cache but hydrates from the database instead of hardcoded files.

```
Before:  hardcoded TS files → templateStore (Zustand) → wizard
After:   sport_templates DB  → templateStore (Zustand) → wizard
```

### Migration steps

1. Create `sport_templates`, `sport_class_rules`, `sport_titles` tables
2. Seed from existing hardcoded rules (AKC, UKC, ASCA)
3. Add a service that fetches templates from DB on app load
4. Wire `templateStore.initializeDefaultTemplates()` to call that service instead of importing TS files
5. Drop `class_templates` table and delete dead query/hook code
6. Keep hardcoded TS files as fallback until DB seeding is verified in staging

---

## Files with Hardcoded Rules (Extraction Targets)

Phase 1 extracts sport-specific rules from these files into `sport_class_rules` rows.

### AKC Scent Work (6 files)

| File | Contains |
|------|----------|
| `data/templates/akcScentWorkTemplate.ts` | 27 class definitions, 6 elements, entry fees, personnel |
| `data/templates/akcScentWorkRules.ts` | Time limits, hide counts, area counts, distractions by element/level |
| `data/templates/akcScentWorkFields.ts` | 28 field specs with conditional visibility rules |
| `pages/scoring/scoresheets/AKC/AKCScentWorkScoresheet.tsx` | Single vs multi-area timer UI |
| `pages/scoring/scoresheets/AKC/AKCNationalsScoresheet.tsx` | 5-area override, 10/-5 points formula |
| `pages/scoring/scoresheets/AKC/AKCNationalsScoresheetHelpers.ts` | Element mapping, timer warnings |

### UKC (3 files)

| File | Contains |
|------|----------|
| `pages/scoring/scoresheets/UKC/UKCNoseworkScoresheet.tsx` | `isDualTimerLevel()` — dual timer at Superior/Master/Elite |
| `pages/scoring/scoresheets/UKC/UKCObedienceScoresheet.tsx` | 170/200 qualifying threshold |
| `pages/scoring/scoresheets/UKC/UKCRallyScoresheet.tsx` | 70/100 qualifying threshold |

### ASCA (1 file)

| File | Contains |
|------|----------|
| `pages/scoring/scoresheets/ASCA/ASCAScentDetectionScoresheet.tsx` | `getAreaCount()` — 1/2/3 areas by level |

### Cross-sport (2 files)

| File | Contains |
|------|----------|
| `services/scoresheets/areaInitialization.ts` | Area rules for AKC, Nationals, and ASCA in one place |
| `pages/scoring/hooks/useElementTimer.ts` | UKC element time tracking for dual-timer levels |

All paths relative to `apps/myk9show/src/`.

### Extraction approach

The rule functions (`getTimeLimit()`, `getSearchAreas()`, `isDualTimerLevel()`, `getAreaCount()`) stay as functions but read from the template instead of hardcoded switch statements. Scoresheet components receive rules via props from the template, not internal logic.

---

## Title Definitions — Phase 1 Scope

Create the `sport_titles` table and seed title definitions for all three sports in Phase 1. The title *tracking engine* (computing a dog's progress toward titles) is Phase 2. Seeding the data now keeps template data consistent and avoids a second migration pass.

---

## Additional Features (from Competitive Analysis)

### MRV-Based Capacity Limits

Weighted ring time calculation per sport. Instead of counting raw entries, capacity uses minutes-per-entry by class level:

- AKC: Novice 2.5 min, Advanced 3 min, Excellent 4-6.5 min, Master 5-8 min, Detective 10 min
- UKC: Novice 1-2.5 min, Advanced 1-3 min, Superior 2-3 min, Master 2-4 min, Elite 2.5-4.5 min
- ASCA: Novice 2.5 min, Open 3 min, Advanced 3-5 min, Excellent 4-6 min

These values come from the rulebooks and are stored in `sport_class_rules`. The system computes total judging time per judge and warns when approaching the 8-hour limit.

### Dog Sizes Screen

Sport-driven size categories where applicable. Stored in the template as optional operational configuration.

---

## What Already Exists

- Scoresheets for all three sports (AKC, UKC, ASCA) with sport-specific fields
- `akcScentWorkRules.ts` — time limits, hide counts, area counts, distractions by element/level
- `akcScentWorkFields.ts` — 28 field specifications with conditional visibility
- `akcScentWorkTemplate.ts` — 27 AKC Scent Work class definitions
- UKC dual timer logic (`isDualTimerLevel()` in UKCNoseworkScoresheet)
- ASCA multi-area handling (`getAreaCount()` in ASCAScentDetectionScoresheet)
- Cross-sport area initialization (`areaInitialization.ts`)
- `class_requirements` table in Supabase
- Result statuses (Q, NQ, ABS, EX, WD) and fault tracking
- `templateStore.ts` (Zustand) — drives Create Show wizard, will become runtime cache for DB-backed templates
- `class_templates` DB table — unused, to be dropped (see Migration Strategy above)

The bulk of Phase 1 is extracting hardcoded rules from 12 files (listed above) into `sport_class_rules` rows, then refactoring class creation and scoresheets to read from the template.

---

## Validation Test

After Phase 1, a secretary should be able to create a single show with a UKC Nosework trial and an AKC Scent Work trial side by side, each with correctly configured classes, time limits, and scoresheet behavior — without manually entering any sport-specific rules.

---

## Future Sports (Not Phase 1)

Next in queue: AKC Obedience, UKC Obedience. These stress-test the template with fundamentally different scoring (point deductions vs. pass/fail, exercises vs. search areas). The template schema is designed to accommodate them without platform code changes.

---

*Source: Brainstorming session 2026-02-24. Gap resolution audit 2026-02-26. Rulebooks: AKC Scent Work Regulations, UKC Nosework Rules, ASCA Scent Detection Rules.*
