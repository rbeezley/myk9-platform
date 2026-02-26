# Phase 1: Multi-Sport Templates — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move sport-specific rules from hardcoded TypeScript files into database-driven templates so the platform supports AKC, UKC, and ASCA without code changes.

**Architecture:** New `sport_templates` + `sport_class_rules` + `sport_titles` tables in Supabase. `templateStore` (Zustand) hydrates from DB instead of hardcoded TS files. Scoresheets read rules from template props. Existing wizard and hook patterns stay the same — only the data source changes.

**Tech Stack:** Supabase (Postgres), Zustand, React Query, TypeScript

**Design Doc:** `docs/plans/2026-02-24-phase1-multi-sport-templates-design.md`

---

## [ADDED] Schema Overlap Clarifications

**`classes.competition_type` vs `trials.sport_type`:** Both columns stay. `trials.sport_type` is the trial-level default (set when the secretary picks a sport in the wizard). `classes.competition_type` is the per-class value (set when classes are generated from the template). When the wizard creates classes, it copies `trial.sport_type` → `class.competition_type`. No migration needed for `competition_type`.

**`rule_sports` table (migration 004):** No conflict with `sport_templates`. `rule_sports` organizes rulebook content for the myK9Q Rules Assistant feature (actively used by edge functions). `sport_templates` stores class configuration for show creation. Different purpose, separate concern.

**`template_fields` table (migration 005):** Keep this table. It has active CRUD operations in `templateMappers.ts`. When deleting `templateQueries.ts` in Task 8, verify whether any `template_fields` operations are imported by components. If so, extract them to a separate file before deleting.

---

## Task 1: Database Migration — New Tables

Create a new Supabase migration with three tables.

**Files:**
- Create: `supabase/migrations/024_sport_templates.sql`

**Step 1: Write the migration**

```sql
-- Sport Templates: one row per sport (AKC Scent Work, UKC Nosework, ASCA Scent Detection)
CREATE TABLE IF NOT EXISTS sport_templates (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  organization TEXT NOT NULL,          -- 'AKC', 'UKC', 'ASCA'
  sport_name TEXT NOT NULL,            -- 'Scent Work', 'Nosework', 'Scent Detection'
  sport_code TEXT NOT NULL UNIQUE,     -- 'akc-scent-work', 'ukc-nosework', 'asca-scent-detection'
  elements TEXT[] NOT NULL,            -- ['Container', 'Interior', 'Exterior', ...]
  levels TEXT[] NOT NULL,              -- ['Novice', 'Advanced', 'Excellent', 'Master']
  section_mode TEXT NOT NULL DEFAULT 'none' CHECK (section_mode IN ('none', 'novice-only', 'all-levels')),
  divisions TEXT[] DEFAULT '{}',       -- optional groupings
  operational_config JSONB DEFAULT '{}', -- size categories, equipment, ring setup
  export_config JSONB DEFAULT '{}',    -- format, required fields, recording fee
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sport Class Rules: element x level matrix, one row per combination
CREATE TABLE IF NOT EXISTS sport_class_rules (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  sport_template_id UUID NOT NULL REFERENCES sport_templates(id) ON DELETE CASCADE,
  element TEXT NOT NULL,
  level TEXT NOT NULL,
  class_name TEXT NOT NULL,            -- e.g. 'Container Novice A'
  section TEXT,                        -- 'A', 'B', or NULL
  display_order INTEGER DEFAULT 0,
  max_time_seconds_fixed INTEGER,      -- fixed time limit (NULL if judge-set)
  max_time_seconds_min INTEGER,        -- judge-set range minimum
  max_time_seconds_max INTEGER,        -- judge-set range maximum
  hide_count_fixed INTEGER,            -- fixed hide count (NULL if variable)
  hide_count_min INTEGER,              -- variable range minimum
  hide_count_max INTEGER,              -- variable range maximum
  hides_known BOOLEAN DEFAULT TRUE,    -- handler knows count?
  area_count INTEGER DEFAULT 1,        -- 1, 2, or 3 search areas
  has_blank BOOLEAN DEFAULT FALSE,     -- one area has no hides?
  distraction_count_min INTEGER DEFAULT 0,
  distraction_count_max INTEGER DEFAULT 0,
  timer_mode TEXT DEFAULT 'single' CHECK (timer_mode IN ('single', 'dual')),
  odors TEXT[] DEFAULT '{}',
  default_entry_fee DECIMAL(10,2),
  mrv_minutes DECIMAL(4,1),            -- weighted ring time per entry
  field_overrides JSONB DEFAULT '{}',  -- class-specific field visibility/behavior
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sport_template_id, element, level, section)
);

-- Sport Titles: one row per title (seeded now, tracking engine in Phase 2)
CREATE TABLE IF NOT EXISTS sport_titles (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  sport_template_id UUID NOT NULL REFERENCES sport_templates(id) ON DELETE CASCADE,
  abbreviation TEXT NOT NULL,          -- 'SCN', 'SWN', 'NWCH'
  full_name TEXT NOT NULL,             -- 'Scent Work Container Novice'
  title_type TEXT NOT NULL CHECK (title_type IN ('element', 'level', 'elite', 'champion', 'grand_champion', 'continuation')),
  required_legs INTEGER NOT NULL,
  required_elements TEXT[] DEFAULT '{}',
  prerequisite_title_id UUID REFERENCES sport_titles(id),
  supersedes_title_ids UUID[] DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sport_template_id, abbreviation)
);

-- Add sport_type to trials (defaults existing trials to AKC Scent Work)
ALTER TABLE trials ADD COLUMN IF NOT EXISTS sport_type TEXT DEFAULT 'akc-scent-work';
CREATE INDEX IF NOT EXISTS trials_sport_type_idx ON trials(sport_type);

-- Indexes
CREATE INDEX IF NOT EXISTS sport_class_rules_template_idx ON sport_class_rules(sport_template_id);
CREATE INDEX IF NOT EXISTS sport_class_rules_element_level_idx ON sport_class_rules(sport_template_id, element, level);
CREATE INDEX IF NOT EXISTS sport_titles_template_idx ON sport_titles(sport_template_id);

-- RLS (same open pattern as existing trials/classes)
ALTER TABLE sport_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sport_class_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sport_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sport_templates_select" ON sport_templates FOR SELECT USING (true);
CREATE POLICY "sport_templates_all" ON sport_templates FOR ALL TO authenticated USING (true);
CREATE POLICY "sport_class_rules_select" ON sport_class_rules FOR SELECT USING (true);
CREATE POLICY "sport_class_rules_all" ON sport_class_rules FOR ALL TO authenticated USING (true);
CREATE POLICY "sport_titles_select" ON sport_titles FOR SELECT USING (true);
CREATE POLICY "sport_titles_all" ON sport_titles FOR ALL TO authenticated USING (true);
```

**Step 2: Run migration locally**

```bash
supabase db push
```

**Step 3: Regenerate Supabase types**

```bash
supabase gen types typescript --project-id sojmvhhwsjxmfistvzbe > packages/supabase/src/database.types.ts
```

**Step 4: Commit**

```bash
git commit -m "feat(db): add sport_templates, sport_class_rules, sport_titles tables"
```

---

## Task 2: Seed AKC Scent Work Rules

Extract rules from `akcScentWorkRules.ts` and `akcScentWorkTemplate.ts` into INSERT statements.

**Files:**
- Create: `supabase/migrations/025_seed_sport_templates.sql`
- Reference: `apps/myk9show/src/data/templates/akcScentWorkRules.ts` (time/hide/area/distraction rules)
- Reference: `apps/myk9show/src/data/templates/akcScentWorkTemplate.ts` (27 class definitions)

**Step 1: Write the seed migration**

Insert the AKC Scent Work template row, then insert one `sport_class_rules` row for each of the 27 element x level combinations. Values come from the existing `getTimeLimit()`, `getSearchAreas()`, `getHideConfiguration()`, and `getDistractionCount()` functions in `akcScentWorkRules.ts`.

Key rules to encode per the existing code:

| Element | Level | Time (sec) | Hides | Areas | Distractions | Timer |
|---------|-------|-----------|-------|-------|--------------|-------|
| Container | Novice | 120 | 1 | 1 | 0 | single |
| Container | Advanced | 150 | 1-2 | 1 | 1 | single |
| Container | Excellent | 150-180 | 2-3 | 1 | 1-2 | single |
| Container | Master | 180-210 | 3-5 | 1 | 1-3 | single |
| Interior | Novice | 120 | 1 | 1 | 0 | single |
| Interior | Advanced | 150 | 1-2 | 1 | 1 | single |
| Interior | Excellent | 150-210 | 2-3 | 2 | 1-2 | single |
| Interior | Master | 180-300 | 3-5 | 3 | 1-3 | single |
| Exterior | Novice | 120-150 | 1 | 1 | 0 | single |
| Exterior | Advanced | 150-180 | 1-2 | 1 | 1 | single |
| Exterior | Excellent | 180-240 | 2-3 | 1 | 1-2 | single |
| Exterior | Master | 210-300 | 3-5 | 1 | 1-3 | single |
| Buried | Novice | 120 | 1 | 1 | 0 | single |
| Buried | Advanced | 150 | 1-2 | 1 | 1 | single |
| Buried | Excellent | 150-180 | 2-3 | 1 | 1-2 | single |
| Buried | Master | 180-240 | 3-5 | 1 | 1-3 | single |
| Handler Discrimination | Novice | 120 | 1 | 1 | 0 | single |
| Handler Discrimination | Advanced | 150 | 1-2 | 1 | 1 | single |
| Handler Discrimination | Excellent | 180 | 2-3 | 1 | 1-2 | single |
| Handler Discrimination | Master | 210 | 3-5 | 2 | 1-3 | single |
| Detective | — | 600 | 5-10 | 1 | 4-6 | single |

Note: Novice classes have A/B sections (section_mode = 'novice-only'). Detective has no level or sections.

Include Novice A and Novice B as separate rows for each element (except Detective).

Cross-reference values against `akcScentWorkRules.ts` before inserting — the table above is approximate. Use the actual function return values.

**[ADDED] Seed `operational_config` and `export_config` JSONB on each sport_templates row:**

```json
// AKC operational_config
{ "equipmentNeeded": ["containers", "barriers", "hides", "distraction items"],
  "requiredPersonnel": ["Judge", "Gate Steward", "Table Steward", "Timer"] }

// AKC export_config
{ "format": "akc-catalog", "recordingFee": 3.00 }
```

Similar for UKC (`"ukc-judges-book"`) and ASCA (`"asca-paperwork"`). Exact values from existing `akcScentWorkTemplate.ts` defaults.

**[EXPANDED] Step 2: Seed UKC Nosework rules**

Elements: Container, Interior, Exterior, Vehicle, Handler Discrimination
Levels: Novice, Advanced, Superior, Master, Elite
Sections: A/B at every level (section_mode = 'all-levels')
Source: `UKCNoseworkScoresheet.tsx` → `isDualTimerLevel()` function

| Element | Level | Time (sec) | Hides | Areas | Timer | MRV (min) |
|---------|-------|-----------|-------|-------|-------|-----------|
| Container | Novice | 60-150 | 1 | 1 | single | 1.5 |
| Container | Advanced | 60-180 | 1 | 1 | single | 2.0 |
| Container | Superior | 120-180 | 2-3 | 1 | dual | 2.5 |
| Container | Master | 120-240 | 3-4 | 1 | dual | 3.0 |
| Container | Elite | 150-270 | 4-5 | 1 | dual | 3.5 |
| Interior | Novice | 60-150 | 1 | 1 | single | 1.5 |
| Interior | Advanced | 60-180 | 1 | 1 | single | 2.0 |
| Interior | Superior | 120-180 | 2-3 | 1 | dual | 2.5 |
| Interior | Master | 120-240 | 3-4 | 1 | dual | 3.5 |
| Interior | Elite | 150-270 | 4-5 | 1 | dual | 4.0 |
| Exterior | Novice | 60-150 | 1 | 1 | single | 2.0 |
| Exterior | Advanced | 60-180 | 1 | 1 | single | 2.5 |
| Exterior | Superior | 120-180 | 2-3 | 1 | dual | 3.0 |
| Exterior | Master | 120-240 | 3-4 | 1 | dual | 3.5 |
| Exterior | Elite | 150-270 | 4-5 | 1 | dual | 4.5 |
| Vehicle | Novice | 60-150 | 1 | 1 | single | 2.0 |
| Vehicle | Advanced | 60-180 | 1 | 1 | single | 2.5 |
| Vehicle | Superior | 120-180 | 2-3 | 1 | dual | 3.0 |
| Vehicle | Master | 120-240 | 3-4 | 1 | dual | 3.5 |
| Vehicle | Elite | 150-270 | 4-5 | 1 | dual | 4.5 |
| Handler Discrimination | Novice | 60-150 | 1 | 1 | single | 2.0 |
| Handler Discrimination | Advanced | 60-180 | 1 | 1 | single | 2.5 |
| Handler Discrimination | Superior | 120-180 | 2-3 | 1 | dual | 3.0 |
| Handler Discrimination | Master | 120-240 | 3-4 | 1 | dual | 3.5 |
| Handler Discrimination | Elite | 150-270 | 4-5 | 1 | dual | 4.0 |

Each element x level gets A and B section rows (50 rows total).

Cross-reference against UKC Nosework Rulebook before inserting — values above are approximate from scoresheet code.

**[EXPANDED] Step 3: Seed ASCA Scent Detection rules**

Elements: Container, Interior, Exterior, Vehicle
Levels: Novice, Open, Advanced, Excellent
Sections: none (section_mode = 'none')
Source: `ASCAScentDetectionScoresheet.tsx` → `getAreaCount()` function

| Element | Level | Time (sec) | Hides | Areas | Timer | MRV (min) |
|---------|-------|-----------|-------|-------|-------|-----------|
| Container | Novice | 150 | 1 | 1 | single | 2.5 |
| Container | Open | 180 | 1-2 | 2 | single | 3.0 |
| Container | Advanced | 180-300 | 2-3 | 2 | single | 4.0 |
| Container | Excellent | 240-360 | 3-5 | 3 | single | 5.0 |
| Interior | Novice | 150 | 1 | 1 | single | 2.5 |
| Interior | Open | 180 | 1-2 | 2 | single | 3.0 |
| Interior | Advanced | 180-300 | 2-3 | 2 | single | 4.5 |
| Interior | Excellent | 240-360 | 3-5 | 3 | single | 6.0 |
| Exterior | Novice | 150 | 1 | 1 | single | 2.5 |
| Exterior | Open | 180 | 1-2 | 2 | single | 3.0 |
| Exterior | Advanced | 180-300 | 2-3 | 2 | single | 4.5 |
| Exterior | Excellent | 240-360 | 3-5 | 3 | single | 6.0 |
| Vehicle | Novice | 150 | 1 | 1 | single | 2.5 |
| Vehicle | Open | 180 | 1-2 | 2 | single | 3.0 |
| Vehicle | Advanced | 180-300 | 2-3 | 2 | single | 4.5 |
| Vehicle | Excellent | 240-360 | 3-5 | 3 | single | 5.5 |

16 rows total. No sections. Cross-reference against ASCA Scent Detection Rulebook.

**Step 4: Commit**

```bash
git commit -m "feat(db): seed AKC, UKC, ASCA sport templates and class rules"
```

---

## Task 3: Seed Title Definitions

**Files:**
- Modify: `supabase/migrations/025_seed_sport_templates.sql` (append to same migration)
- Reference: AKC Scent Work Regulations (title structure)
- Reference: UKC Nosework Rules
- Reference: ASCA Scent Detection Rules

**Step 1: Seed AKC titles**

Title tiers (from design doc):
- Element titles: SCN, SCA, SCE, SCM (for each of 6 elements = 24 element titles)
- Level titles: SWN, SWA, SWE, SWM (earned after completing all elements at a level)
- Elite element titles: SHDN, SHDA, SHDE, SHDM (10 Qs instead of 3)
- Elite level titles: SWN-E, SWA-E, SWE-E, SWM-E
- Detective: DET

Seed the most common titles first. Use `prerequisite_title_id` for progression and `supersedes_title_ids` for replacement chains.

**Step 2: Seed UKC titles**

- Element titles per level (2 Qs each)
- Level titles: earned after all elements at a level
- Champion/Grand Champion progression
- NWCH, NWGC (combined championship)

**Step 3: Seed ASCA titles**

- Element titles (3 Qs basic)
- Level C titles (10 total Qs)
- Combined titles

**Step 4: Commit**

```bash
git commit -m "feat(db): seed title definitions for AKC, UKC, ASCA"
```

---

## Task 4: TypeScript Types for New Tables

**Files:**
- Create: `apps/myk9show/src/types/sport-template-types.ts`
- Modify: `packages/supabase/src/index.ts` (re-export new types if needed)

**Step 1: Write TypeScript interfaces**

Define `SportTemplate`, `SportClassRule`, and `SportTitle` types that map to the DB schema. Include a `toClassTemplate()` mapper function type that converts DB rows into the existing `ClassTemplate` interface — this keeps the store and wizard working without changes.

**Step 2: Write the mapper function**

`mapSportTemplateToClassTemplate(template: SportTemplate, rules: SportClassRule[]): ClassTemplate`

This function:
1. Maps `sport_templates` row → `ClassTemplate` identity/metadata fields
2. Maps `sport_class_rules` rows → `ClassDefinition[]` array
3. Generates `fieldSpecifications[]` from the class rules (time fields, hide fields, area fields)
4. Sets `isActive: true`, `status: 'active'`, `type: 'official'`

The wizard only reads `classDefinitions[]` from the template — if the mapper populates that correctly, everything works.

**Step 3: Commit**

```bash
git commit -m "feat(types): add sport template types and DB-to-store mapper"
```

---

## Task 5: Service Layer — Fetch Templates from DB

**Files:**
- Create: `apps/myk9show/src/services/sportTemplateService.ts`
- Create: `apps/myk9show/src/hooks/queries/useSportTemplates.ts`

**Step 1: Write the service**

```typescript
// sportTemplateService.ts
export async function fetchAllSportTemplates(): Promise<ClassTemplate[]>
```

Queries `sport_templates` + `sport_class_rules` (joined), maps results to `ClassTemplate[]` using the mapper from Task 4.

**Step 2: Write the React Query hook**

```typescript
// useSportTemplates.ts
export function useSportTemplates()
```

Uses React Query with `cacheStrategies.static` (30 min) since templates rarely change. Returns `{ data: ClassTemplate[], isLoading, error }`.

**Step 3: Commit**

```bash
git commit -m "feat(services): add sportTemplateService and React Query hook"
```

---

## Task 6: Rewire templateStore to Hydrate from DB

**Files:**
- Modify: `apps/myk9show/src/store/templateStore.ts`
- Modify: `apps/myk9show/src/hooks/useTemplates.ts`

**Step 1: Update `initializeDefaultTemplates()`**

Change from:
```
import AKC_SCENT_WORK_TEMPLATE → push to templates[]
```

To:
```
call fetchAllSportTemplates() → push results to templates[]
fallback to hardcoded files if DB fetch fails (offline/error case)
```

Keep the `requestIdleCallback` pattern for non-blocking init. The async nature already exists via `ensureTemplatesLoaded()`.

**Step 2: Update `ensureTemplatesLoaded()`**

Make it await the DB fetch. Set `isInitialized: true` only after templates are in the store (the bug we fixed earlier already handles this).

**Step 3: Test**

- Run `pnpm dev:show`
- Navigate to Create Show wizard
- Verify AKC templates load from DB
- Check browser DevTools Network tab for the Supabase query

**Step 4: Commit**

```bash
git commit -m "feat(templates): hydrate templateStore from sport_templates DB"
```

---

## Task 7: Wire Trial sport_type in Create Show Wizard

**Files:**
- Modify: `apps/myk9show/src/components/shows/wizard/steps/ClassSelectionStep.tsx`
- Modify: wizard store/state (wherever trial data is managed)

**Step 1: Set `sport_type` on trial creation**

When the secretary selects an organization type in Step 1 of the wizard, set `sport_type` on the trial record. Map the organization selection to sport_code:
- "AKC" → "akc-scent-work"
- "UKC" → "ukc-nosework"
- "ASCA" → "asca-scent-detection"

**Step 2: Filter templates by sport_type**

In ClassSelectionStep, filter templates using `sport_type` from the trial instead of fuzzy string matching on `show.type`. This replaces the complex normalization logic (~lines 98-161) with a direct match.

**Step 3: Commit**

```bash
git commit -m "feat(wizard): wire trial sport_type to template selection"
```

---

## Task 8: Drop class_templates and Dead Code

**Files:**
- Create: `supabase/migrations/026_drop_class_templates.sql`
- Delete: `apps/myk9show/src/services/database/queries/templateQueries.ts`
- Delete: `apps/myk9show/src/hooks/queries/useTemplatesDatabase.ts`
- Modify: any file that imports from deleted files (verify with grep)

**Step 1: Write drop migration**

```sql
DROP TABLE IF EXISTS class_templates CASCADE;
-- Keep template_fields for now (used by other features)
```

**Step 2: Delete dead code files**

Remove `templateQueries.ts` and `useTemplatesDatabase.ts`. Before deleting, grep for imports to verify nothing references them.

**[ADDED] Step 2a: Check `template_fields` operations**

`templateQueries.ts` contains both `class_templates` AND `template_fields` CRUD operations. Before deleting the file, check if any component imports the `template_fields` functions (e.g., `getTemplateFields`, `createTemplateField`). If so, extract them to a new file `services/database/queries/templateFieldQueries.ts` before deleting. The `template_fields` table stays — do NOT drop it.

**Step 3: Run typecheck**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git commit -m "chore(cleanup): drop unused class_templates table and dead code"
```

---

## Task 9: Verification

**Step 1: Full typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

**Step 2: Validation test (from design doc)**

Create a show with an AKC Scent Work trial. Verify:
- [ ] Wizard Step 3 shows AKC classes from DB templates (not hardcoded)
- [ ] Time limits, hide counts, area counts match rulebook values
- [ ] Selecting classes populates trial correctly

Create a show with a UKC Nosework trial. Verify:
- [ ] UKC classes appear with correct dual-timer configuration
- [ ] Class rules differ from AKC (different elements, levels, section mode)

**Step 3: Commit any fixes, push**

```bash
git push
```

---

## Out of Scope (Phase 1b / Phase 2)

These items are documented but not in this sprint:

- **Scoresheet refactoring** — Making scoresheet components read rules from template props instead of hardcoded switch statements. Scoresheets work today; this is a refactor for maintainability.
- **Title tracking engine** — Computing a dog's progress toward titles. Tables are seeded, engine is Phase 2.
- **Template admin UI** — Managing templates via the app. For now, templates are managed via DB migrations.
- **AKC Nationals / FastCAT templates** — Specialty formats that need additional schema work.
- **UKC Obedience / Rally templates** — Different scoring model (points vs pass/fail), needs schema additions for `qualifying_score`, `max_points`, `exercise_list`.

---

## Dependencies

```
Task 1 (DB tables) → Task 2 (seed data) → Task 3 (titles)
Task 1 → Task 4 (TS types) → Task 5 (service) → Task 6 (store rewire) → Task 7 (wizard)
Task 6 → Task 8 (cleanup)
All → Task 9 (verification)
```

```
1 ─→ 2 ─→ 3
│
├─→ 4 ─→ 5 ─→ 6 ─→ 7
│              │
│              └─→ 8
└─────────────────→ 9
```

Tasks 2-3 (seed data) and 4-5 (types/service) can run in parallel after Task 1.
