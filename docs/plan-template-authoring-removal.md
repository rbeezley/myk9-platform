# Template Authoring Removal — keep the data model, delete the editor

> **Status:** Active

Remove the `/admin/templates` **authoring** surface (create / edit / delete / duplicate /
import-export / test / cache-maintenance) while keeping the `sport_templates` +
`sport_class_rules` + `sport_titles` data model and its read path intact.

Sport rules stay structured data in the database, changed through reviewed migrations.
The wizard, class creation, scoring defaults, and title tracking keep consuming them
through a read-only interface.

---

## 1 · The finding that shapes everything

**The authoring UI does not work, and appears never to have worked.**

- [`templateStore.ts`](../apps/myk9show/src/store/templateStore.ts) has no `supabase`
  import and performs no write anywhere in the store or
  [`templateStore.helpers.ts`](../apps/myk9show/src/store/templateStore.helpers.ts).
  `createTemplate` / `updateTemplate` / `deleteTemplate` are bare `set(state => …)` calls
  against the persisted Zustand cache.
- Canonical templates load from Supabase via `fetchAllSportTemplatesWithRules`
  ([`templateStore.ts:390`](../apps/myk9show/src/store/templateStore.ts:390)).
- `TEMPLATE_REVALIDATE_TTL_MS = 0` — revalidate on **every** load.

So an admin edit is written to local state and then overwritten by the next page load.
The editor is a write-shaped surface over a read-only pipeline. This is not a
"we over-built configurability" cleanup; it is deleting a broken feature whose absence
nobody has noticed.

Two supporting facts:

- `class_templates` was already dropped —
  [`032_drop_class_templates.sql`](../supabase/migrations/032_drop_class_templates.sql:9) —
  replaced by `sport_templates` + `sport_class_rules`. Gen 1 of this idea is already half
  retired.
- The better workflow is already in use: ASCA Level C shipped as an idempotent, documented,
  verified migration
  ([`20260701130000_seed_asca_level_c_classes.sql`](../supabase/migrations/20260701130000_seed_asca_level_c_classes.sql)).

### Why the data model stays

A malformed rule affects every future show, so migrations (history, review, rollback,
reproducibility) beat an admin form. And the tables have real runtime consumers that are
not configuration:

| Consumer | Reads | Why it is load-bearing |
| --- | --- | --- |
| [`buildRuleMap.ts`](../apps/myk9show/src/pages/secretary/ShowCreationWizard/buildRuleMap.ts) | `sport_class_rules` | Bakes max time, timer mode, odors, hide/distraction counts, MRV into class rows at creation so ringside scoring works **offline** |
| [`titleEngine.ts`](../apps/myk9show/src/services/titleEngine.ts) | `sport_titles` | Types its entire API on `SportTitleRow`; drives title tracking |
| [`useSportTemplates.ts`](../apps/myk9show/src/hooks/queries/useSportTemplates.ts) | all three | React Query read layer |
| [`templateMappers.ts`](../apps/myk9show/src/services/mappers/templateMappers.ts) | `sport_templates` | Maps DB rows → `ClassTemplate` for the wizard |

Replacing these with hardcoded TypeScript would be considerably more work and riskier,
and it would touch offline scoring — the highest-risk pre-launch surface. Out of scope.

---

## 2 · Scope

**In scope:** the authoring surface, the dead CRUD half of `templateStore`, the
versioning/inheritance services, the import/export and local-cache-maintenance dialogs,
the orphaned `template_fields` table, and the tests pinning all of it.

**Explicitly out of scope:**

- The three `sport_*` tables, their RLS, `sportTemplateService`, `useSportTemplates`,
  `titleEngine`, `buildRuleMap`, `templateMappers`.
- The secretary "save/reuse a class set" feature — `useTrialTemplates`,
  `AddClassFromTemplateDialog`, `ShowTemplateManager`, `showTemplateStore`,
  `classTemplateStore`. That is a *user convenience*, not rule configuration. Separate
  judgment, separate plan.
- Namesakes: `notification_templates`, `club_premium_templates`,
  `organizationFormTemplates`, `print-templates`, `PermissionTemplateSelector`,
  `workflowTemplates`.

### Decision: keep one read-only page

`/admin/templates` survives as a **read-only viewer** of the sport rules currently live in
the database. Rationale: it is the natural way to verify a seed migration landed — the gap
that made ASCA Level C verification a manual SQL exercise. It costs almost nothing once
CRUD is gone, and it preserves the route, the nav entry, the route-health test, and the
admin-help entry.

`/admin/templates/new`, `/:templateId/edit`, and `/:templateId/test` are deleted.

---

## 3 · Verified delete list

Every path below was confirmed by grep against the working tree. Line counts are current.

### 3.1 Pages and routes

| Path | Lines | Action |
| --- | --- | --- |
| [`pages/admin/TemplateEditorPage.tsx`](../apps/myk9show/src/pages/admin/TemplateEditorPage.tsx) | 565 | delete |
| [`pages/admin/TemplateTestingPage.tsx`](../apps/myk9show/src/pages/admin/TemplateTestingPage.tsx) | 410 | delete |
| [`pages/admin/TemplateManagementPage.tsx`](../apps/myk9show/src/pages/admin/TemplateManagementPage.tsx) | 680 | **reduce** to read-only list + detail; strip "reload defaults", "reset local templates", "clean duplicates", import/export, and all row actions |
| [`routes/routeRegistry.ts:32-35`](../apps/myk9show/src/routes/routeRegistry.ts:32) | — | remove `new` / `edit` / `test` entries; keep `'/admin/templates'` |
| [`routes/routeRegistry.ts:182`](../apps/myk9show/src/routes/routeRegistry.ts:182) | — | `templateManagement` prefetch group references `/admin/templates/new` — drop that entry |
| [`routes/adminRoutes.tsx:40-47, 202-229`](../apps/myk9show/src/routes/adminRoutes.tsx:202) | — | remove the three lazy imports + three `<Route>` blocks |

### 3.2 Authoring components

| Path | Lines | Action |
| --- | --- | --- |
| [`components/templates/admin/TemplateForm.tsx`](../apps/myk9show/src/components/templates/admin/TemplateForm.tsx) | 262 | delete |
| [`components/templates/admin/TemplateActions.tsx`](../apps/myk9show/src/components/templates/admin/TemplateActions.tsx) | 182 | delete |
| [`components/templates/admin/TemplateList.tsx`](../apps/myk9show/src/components/templates/admin/TemplateList.tsx) | 256 | **reduce** — strip action props/callbacks |
| [`components/templates/admin/TemplatePreview.tsx`](../apps/myk9show/src/components/templates/admin/TemplatePreview.tsx) | 465 | **reduce and move** — see §4.0 Q1. Props are read-only (`{ template }`); keep the Classes/Fields/Rules tabs, delete the `test` tab (lines 386+) and its `testValues` state. Move out of `admin/` |

### 3.3 Import/export and local-cache maintenance

| Path | Lines | Action |
| --- | --- | --- |
| [`components/templates/ExportTemplatesDialog.tsx`](../apps/myk9show/src/components/templates/ExportTemplatesDialog.tsx) | 160 | delete |
| [`components/templates/AutoSaveTemplatesDialog.tsx`](../apps/myk9show/src/components/templates/AutoSaveTemplatesDialog.tsx) | 160 | delete |
| [`components/templates/DirectSaveTemplatesDialog.tsx`](../apps/myk9show/src/components/templates/DirectSaveTemplatesDialog.tsx) | 182 | delete |
| [`utils/autoSaveTemplates.ts`](../apps/myk9show/src/utils/autoSaveTemplates.ts) | 143 | delete |
| [`utils/cleanup-duplicate-templates.ts`](../apps/myk9show/src/utils/cleanup-duplicate-templates.ts) | ~50 | delete — dedup is now structural via `upsertTemplates` (replace-by-id) |

### 3.4 Services

| Path | Lines | Action |
| --- | --- | --- |
| [`services/templates/templateVersioning.ts`](../apps/myk9show/src/services/templates/templateVersioning.ts) | 527 | delete — only reachable through the editor |
| [`services/templates/templateInheritance.ts`](../apps/myk9show/src/services/templates/templateInheritance.ts) | 430 | delete — same |
| [`lib/templateValidation.ts`](../apps/myk9show/src/lib/templateValidation.ts) | 283 | delete — unreachable from runtime code, see §4.0 Q2 |
| [`lib/classGeneration.ts`](../apps/myk9show/src/lib/classGeneration.ts) | — | delete — its only importers are two test files, see §4.0 Q2 |

### 3.5 Store surgery — `templateStore`

**Delete these actions** (all local-only writes, from
[`templateStore.types.ts`](../apps/myk9show/src/store/templateStore.types.ts)):
`createTemplate`, `updateTemplate`, `deleteTemplate`, `duplicateTemplate`,
`createEditableCopy`, `promoteToOfficial`, `deprecateTemplate`, `createNewVersion`,
`clearCorruptedData`, and the import/export actions.

**Keep — every non-admin consumer depends on these:**

| Consumer | Uses |
| --- | --- |
| [`hooks/useTemplates.ts`](../apps/myk9show/src/hooks/useTemplates.ts) | `templates`, `isInitialized`, `ensureTemplatesLoaded` |
| [`store/classCreationStore.ts:88`](../apps/myk9show/src/store/classCreationStore.ts:88) | `getTemplate` |
| [`components/panels/edit/ShowEditForm.tsx:31`](../apps/myk9show/src/components/panels/edit/ShowEditForm.tsx:31) | `templates` |
| [`components/templates/secretary/OrganizationSelector.tsx:36`](../apps/myk9show/src/components/templates/secretary/OrganizationSelector.tsx:36) | `templates` |
| [`components/trials/TrialDetail/TrialManagementDialogs.tsx:62`](../apps/myk9show/src/components/trials/TrialDetail/TrialManagementDialogs.tsx:62) | `templates`, `initializeDefaultTemplates` |

Also keep: `activeTemplate`, `getOfficialTemplates`, `getCustomTemplates`, search/filter
state, `refreshTemplatesFromDB`, `upsertTemplates`.

> **Trap:** `initializeDefaultTemplates`
> ([`templateStore.ts:381`](../apps/myk9show/src/store/templateStore.ts:381)) sounds like a
> seed/write action. It is the **DB load path** — it calls
> `fetchAllSportTemplatesWithRules`. Do not delete it. Rename it to
> `loadTemplatesFromDB` as part of this work so the next person does not make that mistake.

### 3.6 Styles

Resolved — see §4.0 Q3.

| Path | Lines | Action |
| --- | --- | --- |
| [`styles/template-management.css`](../apps/myk9show/src/styles/template-management.css) | 207 | **delete** — zero importers. Orphan using a `.template-*` class prefix nothing emits |
| [`styles/myk9-template-management.css`](../apps/myk9show/src/styles/myk9-template-management.css) | 582 | **keep, reduce** — the live one (`.myk9-*` prefix). Triple-imported: [`index.css:8`](../apps/myk9show/src/index.css:8) globally, plus [`TemplateList.tsx:37`](../apps/myk9show/src/components/templates/admin/TemplateList.tsx:37) and [`TemplateManagementPage.tsx:34`](../apps/myk9show/src/pages/admin/TemplateManagementPage.tsx:34). Drop the two component-level imports (the global one already covers them) and prune rules for deleted affordances |

### 3.7 Navigation, help, and lazy-load config

| Path | Action |
| --- | --- |
| [`store/navigationStore.ts:76`](../apps/myk9show/src/store/navigationStore.ts:76) | keep `'/admin/templates'`; retitle "Template Management" → **"Sport Rules"** (it no longer manages anything) |
| [`components/layout/AccountMenuContent.tsx:167`](../apps/myk9show/src/components/layout/AccountMenuContent.tsx:167) | keep the link; update the label to match |
| [`features/admin-help/utils/resolveExamplePath.ts:73-79`](../apps/myk9show/src/features/admin-help/utils/resolveExamplePath.ts:73) | remove the `edit` and `test` resolvers |
| [`features/admin-help/data/pageDirectory.ts:118,140,163`](../apps/myk9show/src/features/admin-help/data/pageDirectory.ts:118) | rewrite the entry as read-only; verify `linksTo` still resolves |
| [`hooks/useLazyStore.ts:93,126`](../apps/myk9show/src/hooks/useLazyStore.ts:93) | `admin-templates` group drops `classTemplateStore`/`showTemplateStore` if unused by the read-only page |
| [`components/layout/sidebar/unifiedSidebarConfig.ts`](../apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts) | confirm whether a sidebar entry exists; no `/admin/templates` match was found, so likely nothing to change |

### 3.8 Orphaned table — `template_fields`

Its FK parent `class_templates` was dropped in migration 032, which kept `template_fields`
on a "may be used by other features" hunch. Grep says nothing reads it at runtime — only:

- type aliases in [`types/database-mappings.ts:51-53,245`](../apps/myk9show/src/types/database-mappings.ts:51)
- anon-grant fixtures ([`anonGrantChecks.ts:65`](../apps/myk9show/supabase/functions/_shared/anonGrantChecks.ts:65),
  `anonGrantTestFixtures.ts:21`)
- legacy scripts (`backup-templates.sql`, `document-current-state.ts`,
  `migrate-to-singular-tables.ts`)

**Action:** `DROP TABLE public.template_fields` in its own migration, then remove the type
aliases and the anon-grant fixture entries. The anon-grant contract test reads the whole
migrations directory, so the fixture and the migration must land together or that test
fails. Do this as a **separate PR after** the code removal merges.

---

## 4 · Phases

### Phase 1 — Verify the three open questions ✅ DONE

See §4.0 below. All three resolved; one produced a bonus deletion.

### 4.0 · Phase 1 findings

#### Q1 — `TemplatePreview.tsx`: reusable, after amputation

Its prop interface is `{ template: ClassTemplate }` — **read-only, no callbacks**. Its only
importer is `TemplateEditorPage.tsx:447`. It renders four tabs:

| Tab | Lines | Verdict |
| --- | --- | --- |
| Classes | 200–298 | keep |
| Fields | 299–334 | keep |
| Rules | 335–385 | keep — this is the rules matrix the read-only viewer needs |
| **Test** | 386+ | **delete** — this is the "Test Template" harness, along with the `testValues` and `selectedClass` state that backs it |

**Action:** keep it, delete the `test` tab and its state, and move it out of
`components/templates/admin/` — after this change nothing about it is admin-authoring.
Suggested home: `components/templates/SportRulesDetail.tsx`. Expect ~465 → ~300 lines.

#### Q2 — `lib/templateValidation.ts` is dead code, and it drags a second file with it

Stronger than expected. Full importer graph:

- `lib/templateValidation.ts` — non-test importers: **exactly one**,
  [`lib/classGeneration.ts:2`](../apps/myk9show/src/lib/classGeneration.ts:2) (`generateClassName`).
- `lib/classGeneration.ts` — importers: **only two test files**
  (`test/lib/classGeneration.test.ts`, `test/performance/templatePerformance.test.ts`).

So the chain terminates in tests. **Neither file is reachable from runtime code.** Both
delete, and the 414-line `templateValidation.test.ts` plus 440-line
`templatePerformance.test.ts` go with them — roughly **1,137 lines that were only ever
testing each other.**

Two near-misses that made this look reachable, worth recording so nobody re-derives them:

- `TemplateEditorPage.tsx:125` defines a **local** `validateTemplate` function. It does not
  import the lib.
- `FieldOverrideForm.tsx:131` defines a **local** `shouldShowField`. The live
  `generateClassName` used by `DynamicClassForm` comes from
  [`lib/fieldUtils.ts:218`](../apps/myk9show/src/lib/fieldUtils.ts:218), a different function with a
  different signature.

Name collisions, not call sites. `validateTemplateStructure` in
[`templateMappers.ts:489`](../apps/myk9show/src/services/mappers/templateMappers.ts:489) is separate,
is used by `templateInheritance` (deleted), and stays — `templateMappers` is out of scope.

> This deletion is **independent of the authoring removal** and carries no risk. If the rest
> of this plan stalls, land Q2 on its own.

#### Q3 — `template-management.css` is the orphan

`myk9-template-management.css` (582 lines, `.myk9-*`) is live and imported three times.
`template-management.css` (207 lines, `.template-*`) has **zero importers** — delete outright.
Details in §3.6.

#### Bonus — a broken e2e assertion

[`test/e2e/cross-browser/functionality.spec.ts:178`](../apps/myk9show/src/test/e2e/cross-browser/functionality.spec.ts:178)
navigates to `/admin/template-management`. That route has never existed; the real path is
`/admin/templates`. The spec is either passing vacuously or asserting against a 404. Fix or
delete it in Phase 6 — and check whether the surrounding cross-browser spec has other
stale paths.

### Phase 2 — Delete the authoring routes and components

3.1 (routes + Editor/Testing pages), 3.2, 3.3, 3.4. Purely subtractive.
`pnpm typecheck` is the guide — every break should point at a file on the delete list. A
break pointing anywhere else means the delete list is wrong; stop and update this doc.

### Phase 3 — Reduce the store to read-only

3.5. Delete the CRUD actions, rename `initializeDefaultTemplates` → `loadTemplatesFromDB`,
update the five non-admin consumers' imports if the rename touches them.

### Phase 4 — Rebuild `/admin/templates` as a read-only viewer

Reduce `TemplateManagementPage` to: organization filter, template list, rules-matrix
detail. No mutations, no cache-maintenance controls. Add a plain-language note that rules
are changed by migration, with a pointer to `docs/plan-asca-level-c-classes.md` as the
worked example.

### Phase 5 — Navigation, help, and labels

3.7. Retitle to "Sport Rules" across `navigationStore`, `AccountMenuContent`, and
`pageDirectory`.

### Phase 6 — Testing (a phase is not complete until its tests pass)

**Rewrite:**

- [`test/e2e/admin/templateManagement.spec.ts`](../apps/myk9show/src/test/e2e/admin/templateManagement.spec.ts) —
  230 lines, 13 `goToTemplateManagement()` calls. Rewrite as read-only assertions:
  page renders, rules visible, **no** create/edit/delete affordances present.
- [`test/store/templateStore.test.ts`](../apps/myk9show/src/test/store/templateStore.test.ts) —
  357 lines; strip CRUD cases, keep load/revalidate/filter coverage.
- [`test/stores/phase4-template-system.test.ts`](../apps/myk9show/src/test/stores/phase4-template-system.test.ts) —
  404 lines; audit, likely mostly CRUD, delete what is dead.
- [`pages/admin/__tests__/TemplateManagementPage.test.tsx`](../apps/myk9show/src/pages/admin/__tests__/TemplateManagementPage.test.tsx) —
  rewrite against the read-only page.
- [`features/admin-help/__tests__/resolveExamplePath.test.ts:68-72`](../apps/myk9show/src/features/admin-help/__tests__/resolveExamplePath.test.ts:68) —
  drop the edit/test expectations.

**Delete outright** (§4.0 Q2 — they test only each other):

- [`test/lib/templateValidation.test.ts`](../apps/myk9show/src/test/lib/templateValidation.test.ts) — 414 lines
- [`test/lib/classGeneration.test.ts`](../apps/myk9show/src/test/lib/classGeneration.test.ts)
- [`test/performance/templatePerformance.test.ts`](../apps/myk9show/src/test/performance/templatePerformance.test.ts) — 440 lines

**Fix or delete:**

- `test/e2e/cross-browser/functionality.spec.ts:178` — navigates to the nonexistent
  `/admin/template-management` (§4.0 Bonus). Audit the surrounding spec for other stale paths.

**Keep, must stay green — these prove the read path survived:**

- [`store/templateStore.revalidate.test.ts`](../apps/myk9show/src/store/templateStore.revalidate.test.ts)
- [`services/__tests__/sportTemplateService.test.ts`](../apps/myk9show/src/services/__tests__/sportTemplateService.test.ts)
- [`test/hooks/useTrialTemplates.test.ts`](../apps/myk9show/src/test/hooks/useTrialTemplates.test.ts)
- `test/e2e/route-health-by-role.spec.ts:110` — `/admin/templates` must still resolve
- `test/e2e/helpers/testSetup.ts:82` — `goToTemplateManagement()` stays

**New test — close the two-sources-of-truth gap:**

`sport_templates.levels` / `.elements` and
[`features/registries/`](../apps/myk9show/src/features/registries/) both define AKC scent-work
levels and elements. Both are live; nothing asserts they agree. Add a test that loads the
seeded rows and asserts they match the registry for AKC, UKC, and ASCA. This converts a
silent drift risk into a red CI run and costs no migration.

**Full gate:** `pnpm typecheck`, `pnpm lint`, `cd apps/myk9show && pnpm test`, plus the
show-creation wizard e2e path (it consumes `buildRuleMap`, the highest-risk consumer).

---

## 5 · Risks

| Risk | Mitigation |
| --- | --- |
| Deleting a store action a secretary flow uses | The five non-admin consumers and their exact reads are enumerated in §3.5; `pnpm typecheck` catches the rest |
| `initializeDefaultTemplates` deleted because the name reads like a write | Called out as a trap in §3.5; rename in Phase 3 |
| Offline scoring regression via `buildRuleMap` | `buildRuleMap`, `sportTemplateService`, and the three tables are explicitly out of scope; wizard e2e in the Phase 6 gate |
| `template_fields` drop breaks the anon-grant contract test | Migration + fixture removal land in the same PR, in a separate PR after code removal |
| Someone made real edits in the editor believing they persisted | They did not persist — writes were local-only and overwritten on reload. Staging-only, pre-launch, no real users. No data recovery needed. Confirm no one is relying on a locally-cached edit before shipping |

## 6 · Definition of done

- `/admin/templates` renders read-only; `/new`, `/:id/edit`, `/:id/test` return 404.
- No write path to `sport_templates` / `sport_class_rules` / `sport_titles` exists outside a migration.
- `templateStore` exposes no mutation actions; `loadTemplatesFromDB` is the only load entry point.
- Registry↔DB parity test green for AKC, UKC, ASCA.
- Show-creation wizard creates classes with scoring fields baked in, unchanged.
- Full gate green.
- `template_fields` dropped (follow-up PR).

## 7 · Estimate

Roughly **1–2 focused sessions** for Phases 2–6, plus a small follow-up PR for
`template_fields`. Lower than a comparable refactor because the write half of the store is
already dead code sitting beside a working read path — this is closer to `git rm` than to
surgery.

Expected net after Phase 1: **~4,600–5,600 lines deleted**, revised up from the pre-Phase-1
estimate because §4.0 Q2 found ~1,137 lines of mutually-referential dead code and Q3 found a
207-line orphaned stylesheet.

Suggested PR split:

| PR | Contents | Risk |
| --- | --- | --- |
| 1 | §4.0 Q2 deletions + Q3 orphan stylesheet | **none** — nothing reachable is touched; land independently |
| 2 | Phases 2–5 (routes, components, store surgery, read-only page, labels) | low — typecheck-guided |
| 3 | Phase 6 test rewrites + registry↔DB parity test | low |
| 4 | `template_fields` DROP migration + fixture removal | low — must land after PR 2 |
