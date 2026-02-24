# Phase 1: Multi-Sport Templates — Design Document

**Date:** February 24, 2026
**Status:** Design Complete — Ready for Implementation Planning
**Depends on:** Nothing (foundational phase)
**Enables:** Phase 2 (Exhibitor Platform & Premium)

---

## Overview

Phase 1 introduces a sport template system that separates the universal platform layer from sport-specific rules. The platform knows how to run a trial. The template tells it which sport's rules to apply.

Three scent-based sports from three organizations serve as the initial templates:
- **AKC Scent Work** (primary customer base)
- **UKC Nosework** (second largest customer base)
- **ASCA Scent Detection**

The architecture must be flexible enough to support structurally different sports (obedience, agility, conformation) in the future without platform code changes.

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

### Data migration

Migration script creates three sport templates and populates class rules from existing hardcoded values in `akcScentWorkRules.ts`, UKC scoresheet logic, and ASCA configurations. Rules already exist in code; they move into the database.

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
- `akcScentWorkFields.ts` and `akcScentWorkRules.ts` — class rules already encoded
- UKC dual timer logic (`isDualTimerLevel()`)
- ASCA multi-area handling (1/2/3 areas by level)
- `class_requirements` table in Supabase
- Result statuses (Q, NQ, ABS, EX, WD) and fault tracking
- Template store (`templateStore.ts`) for reusing show setups (not sport rule templates)

A significant portion of Phase 1 is extracting hardcoded rules from existing scoresheet components into template config objects, then refactoring class creation and scoresheets to read from the template.

---

## Validation Test

After Phase 1, a secretary should be able to create a single show with a UKC Nosework trial and an AKC Scent Work trial side by side, each with correctly configured classes, time limits, and scoresheet behavior — without manually entering any sport-specific rules.

---

## Future Sports (Not Phase 1)

Next in queue: AKC Obedience, UKC Obedience. These stress-test the template with fundamentally different scoring (point deductions vs. pass/fail, exercises vs. search areas). The template schema is designed to accommodate them without platform code changes.

---

*Source: Brainstorming session 2026-02-24. Rulebooks: AKC Scent Work Regulations, UKC Nosework Rules, ASCA Scent Detection Rules.*
