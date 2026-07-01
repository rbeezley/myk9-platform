# ASCA Level C — seed continuation classes into the wizard template

> **Status:** Active

## Problem

Two independently-seeded registry systems disagree about ASCA Scent Detection:

1. **DB template** (`sport_templates` + `sport_class_rules`, read by `mapSportTemplateToClassTemplate`) drives the **show-creation wizard Step 3 class grid**. ASCA's row has `section_mode='none'` and **16** `sport_class_rules` rows (4 elements × 4 base levels, no Level C).
2. **RegistrySport config** (`features/registries/asca.ts`, read by `getRegistry`) drives entry blanks, premium PDFs, landing pages, legal text, move-up eligibility, and class ordering. It **declares Level C** (`kind: 'continuation'`) for all four base levels **and** a standalone `Champion` level → its generator (`generateScentWorkClasses`) emits **33** classes.

Result: ASCA's Level C continuation classes are offered by the config layer but **never appear in show-creation**, because the DB template seed is missing those rows. (UKC's A/B `ownership` sections render fine only because UKC's DB seed includes A/B rows.)

### Product decision (2026-07-01)

Raised with the user during the Phase 4 live walk:

- **Level C → own scheduled class.** Seed it. Confirmed by the ASCA rulebook: `docs/rulebooks/asca-scent-detection-rules.txt` §3.2.2/§5.2 — Level C is a real class with its own element titles (`SCNc-C`, etc.), entered by dogs that have titled at the base level and wish to *continue*.
- **Champion → titling/invitational, leave out.** Not seeded into the wizard template; the divergence is intentional and documented here.

## Root-cause facts (verified 2026-07-01)

| Fact | Evidence |
| --- | --- |
| Wizard grid renders **one card per `sport_class_rules` row**, carrying `section` straight through. | `mapSportTemplateToClassTemplate` = `rules.map(...)` — `sport-template-types.ts:128,185`; fed via `useSportTemplates.ts:30` and `templateStore.ts:378` (both pass `row.sport_class_rules`). |
| `section_mode` has **zero consumers** — it is decorative metadata. | `grep section_mode\|sectionMode src` → only the type declaration `sport-template-types.ts:22`. AKC/UKC section behavior is achieved purely by *which rows exist*. |
| Card face shows `level` + a `section` badge; `class_name` is the **identity** key (judge assignment, selection, search, dedup, aria). | `SimpleClassSelector.tsx:490-498` (visible), `:80,124-127,151,502` (identity). |
| Level C runs with **identical** judging/scoring parameters to its base level. | Rulebook §5.2.2: "The same methods and standards are used for judging and scoring the Novice Level C classes as the Novice Level classes." |
| `buildRuleMap` keys by `templateId\|element\|level` (**section-blind**), so base and C collide on one key. | `buildRuleMap.ts:27`. Harmless: §5.2.2 makes their params identical, so either wins the collision correctly. |
| Config already emits `class_name = "{Element} {Level} Level C"`, `section='C'`, and is **unit-tested**. | `asca.test.ts:40-58`; `generateScentWorkClasses.test.ts:108-130`. AKC's DB seed matches AKC's config (`"Container Novice A"`), so ASCA's DB seed should match ASCA's config. |

## Naming & shape decisions

- **`class_name` = `"{Element} {Level} Level C"`** (e.g. `Container Novice Level C`) with **`section = 'C'`**, mirroring the config-layer output exactly (the AKC precedent: DB seed name == config name). The visible card reads `Novice` + a `C` badge.
- **Parameters = clone of the base-level row** (time, hides, areas, `mrv_minutes`, `timer_mode`, `time_type`) per §5.2.2. No new rule research.
- **`display_order` 17–32**, appended element-major/level-order after the existing 16 base rows. (The grid re-sorts by a hardcoded level order and ignores `display_order`, so this is cosmetic; appending avoids renumbering existing rows.)
- **`section_mode`**: update `'none'` → `'all-levels'` — now the truthful axis descriptor (sections exist at every base level). The field is decorative (no consumer), but leaving `'none'` alongside section rows is a self-contradiction and a latent landmine if the field is ever made functional. The continuation-vs-ownership distinction (retain base vs replace base) is **not** `section_mode`'s axis — it lives in the config `kind`; documented in the migration comment. No type-union change needed (`'all-levels'` already exists).
- **Champion**: not seeded (product decision). Documented in the migration comment.

## Out of scope (flagged, not fixed here)

- **`SimpleClassSelector` level-sort bug** (`SimpleClassSelector.tsx:105`): `levelOrder = ['Novice','Advanced','Excellent','Master']` omits ASCA's `Open` (and UKC's Superior/Elite). Unlisted levels get `indexOf === -1` and sort *before* Novice, so ASCA `Open` classes already sort first today. Pre-existing; unrelated to Level C. Track separately.
- **`buildRuleMap` section-blind key**: fine today because continuation params equal base params. If a future registry adds a continuation class with *different* params than its base, add `section` to the key at `buildRuleMap.ts:27`.

## Phase 1 — Migration

`supabase/migrations/20260701130000_seed_asca_level_c_classes.sql`

1. `UPDATE sport_templates SET section_mode='all-levels' WHERE sport_code='asca-scent-detection'`.
2. `INSERT` 16 Level C rows into `sport_class_rules` — one per (element × base level), cloning each base row's parameters, with `section='C'`, `class_name='{Element} {Level} Level C'`, `display_order` 17–32.
3. Idempotent: guard the INSERT with `WHERE NOT EXISTS (... section='C' ...)` (or `ON CONFLICT` if a suitable unique index exists) so re-running the migration / re-seeding a fresh DB is safe.

## Phase 2 — Testing

A pure seed migration adds no component/hook/utility, so the automated logic guard already exists:

- **Existing config unit tests pass unchanged** — `asca.test.ts` (33-class catalog incl. 16 Level C) and `generateScentWorkClasses.test.ts` (continuation keeps base + adds C). Run: `npx vitest run src/features/registries/__tests__/asca.test.ts src/features/registries/__tests__/generateScentWorkClasses.test.ts`.
- **Post-push DB verification** (the query that surfaced the gap):
  ```sql
  SELECT st.section_mode,
         count(*)                                        AS total,
         count(*) FILTER (WHERE scr.section='C')         AS level_c,
         count(*) FILTER (WHERE scr.section IS NULL)     AS base
  FROM public.sport_templates st
  JOIN public.sport_class_rules scr ON scr.sport_template_id = st.id
  WHERE st.organization='ASCA'
  GROUP BY 1;
  -- expect: section_mode='all-levels', total=32, level_c=16, base=16
  ```
  And a params-parity check: each `section='C'` row's `(max_time_*, hide_count_*, area_count, mrv_minutes, timer_mode, time_type)` equals its base sibling's.
- **Wizard re-walk**: create an ASCA show, open Step 3 — each element now shows its base levels **plus** a Level C card (`Novice [C]`, `Open [C]`, `Advanced [C]`, `Excellent [C]`); Champion is absent.

## Phase 3 — Ship

- Feature branch → PR (code+data change; not docs-only). `supabase db push` and PR creation are shared-system writes → confirm before running.
- On merge: flip Status to `Complete`, `git mv` this file to `docs/archive/`, drop its row from `docs/README.md`.
