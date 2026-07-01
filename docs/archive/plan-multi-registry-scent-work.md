# Multi-Registry Scent Work — AKC + UKC + ASCA (Day-One Launch)

> **Status:** Complete
>
> All phases shipped (config layer → UKC → ASCA → publishing surfaces). Read side registry-aware (5a #1054, 5b #1056); write side derives + persists `registry_id` ([`plan-registry-write-path.md`](plan-registry-write-path.md), #1061/#1062); ASCA Level C continuation classes seeded into the wizard template (#1066). 5c live walk verified UKC + ASCA end-to-end on 2026-07-01. Follow-ups tracked separately: ASCA premium-document generation (epic), the AKC `'masters'`-alias/scoring-island cleanup, and the org-dropdown tightening (secretaries can still pick bodies with no rulebook config).

Implementation plan for the day-one launch commitment: the **scent sport** publishes correctly for **AKC, UKC, and ASCA** (decided 2026-06-29). This plan executes §6 ("Implementation plan") of the scoping doc against the real myK9Show codebase, targeting the §10 cross-registry schema synthesis.

- **Spec / source of truth:** [`docs/design_handoff_heritage/Multi-Registry Scoping.md`](design_handoff_heritage/Multi-Registry%20Scoping.md) — §7.5 (AKC), §8 (UKC), §9 (ASCA), §10 (schema synthesis), §10.1 (odor, out of scope).
- **Prior art:** the registry abstraction already exists (`apps/myk9show/src/features/registries/`), introduced by [`docs/plans/2026-05-07-heritage-trial-pages-plan.md`](plans/2026-05-07-heritage-trial-pages-plan.md). This plan extends it from AKC-only to three registries.
- **Backlog item:** OPEN-TODOS.md → "Multi-registry config layer — scent work, AKC + UKC + ASCA".

---

## 1 · The key finding that shapes everything

**The database is already registry-agnostic — this is a TypeScript/config refactor, not a schema migration project.**

- `classes.level`, `classes.element`, `classes.section` are free-text `TEXT` columns (migration `002_shows_and_events.sql`) with **no CHECK constraints and no enums**.
- The replication layer (`ReplicatedClassesTable`) treats level/element/section as **opaque strings** — no validation, no AKC assumptions.
- Entries link to classes by `class_id`; scoring reads class config fields by id.

**Consequences:**
- **Zero migrations** for the core class structure. UKC's "Elite", ASCA's "Open"/"Champion", and ASCA's "Level C" are just different strings in existing columns.
- **No replication / offline changes.**
- All AKC-only assumptions live in **TypeScript** (union types, the class generator, the rules module, scattered constant arrays) plus a `RegistrySport` type too flat for §10.

This is a contained, well-bounded refactor — roughly a week of methodical extraction with tests at each step.

---

## 2 · Scope

### In scope (day one)
- Extend `RegistryId` to `'AKC' | 'UKC' | 'ASCA'`; register UKC + ASCA in the lookup map.
- Evolve `RegistrySport` to the §10 shape (per-element levels, typed class variants, optional grouping).
- Populate `ukcRegistry` (§8) and `ascaRegistry` (§9) — identity/legal, class structure, registration field.
- Make the **class generator registry-driven** so a secretary can create a UKC or ASCA scent trial and get the right class catalog.
- Wire the surfaces that still hardcode AKC structure to read from the registry: `buildEntryBlankProps`, premium `classOrder`, `entryFormTypes` consumers.
- Confirm the data-driven surfaces (landing, confirmation email, wizard) render the new registries correctly.

### Out of scope (explicitly deferred)
- **Title tracking / awards surface** (UKC §8.4, ASCA §9.4, AKC Elite/Detective titles). Captured in the spec; not built.
- **Odor enforcement** (§10.1) — required-per-level vs. permitted-ceiling vs. chosen-line. Display of odor names is fine; enforcement is post-MVP.
- **Scoring-rule enforcement fidelity** beyond sensible defaults — exact per-class time limits / hide counts for UKC/ASCA may ship as judge-set defaults (see §6 risk).
- **Other sports** (obedience, conformation, Total Dog award).
- **Other registries** (CKC, NACSW, CPE, …) — the `Organization`/`ORG_MAP` stubs stay stubs.

---

## 3 · Target architecture

### 3.1 · Evolve `RegistrySport` (the §10 shape)

The current flat shape (`levels` / `elements` / `special` / `elementColumnHeaders`) cannot express the real divergence (UKC HD uses "Excellent" + has no Elite; AKC Detective is a single-level no-section element; ASCA Level C is a continuation variant). Proposed target (refine during Phase 0 by forcing AKC through it — schema-by-extraction, per scoping §6):

```ts
interface ClassVariant {
  key: string;                 // 'A' | 'B' | 'C' | ''
  label: string;               // 'A' | 'B' | 'Level C'
  kind: 'ownership' | 'continuation';
}

interface LevelSpec {
  key: string;                 // 'novice' | 'open' | 'superior' | ...
  label: string;               // 'Novice' | 'Open' | 'Superior'
  order: number;               // progression rank (replaces hardcoded LEVEL_ORDER)
}

interface ElementSpec {
  key: string;                 // 'container' | 'hd' | 'detective' | ...
  label: string;               // 'Container' | 'Handler Discrimination'
  columnHeader?: string;       // 'Cont.' (grid display)
  grid: boolean;               // true = main element grid; false = rendered separately
  levels: string[];            // level keys this element offers (per-element! Detective = ['detective'])
  variantsByLevel?: Record<string, ClassVariant[]>;  // e.g. { novice: [A,B] } (AKC) or all levels (UKC)
}

interface RegistrySport {
  levels: LevelSpec[];                 // canonical ladder for this sport
  elements: ElementSpec[];             // each declares its own levels + variants
  division?: Record<string, string>;   // optional: element key → division (AKC Odor Search / HD / Detective)
}
```

Notes:
- **Per-element levels** satisfy §10 req #1–2 (AKC Detective = one level, no variants; UKC HD = 4 levels incl. "Excellent").
- **`variantsByLevel`** replaces the A/B-only assumption with typed variants (AKC Novice = A/B ownership; UKC = A/B every level; ASCA = base + "C" continuation). §10 req #3.
- **`order` on `LevelSpec`** replaces the hardcoded `LEVEL_ORDER` in `premium/pdf/.../classOrder.ts`.
- Scoring model (§10 req #4) and odor (§10.1) are **NOT** added now — out of scope. Leave the type open to extension.

### 3.2 · Registry-driven class generator

Replace the hardcoded `types/akc-scent-work-generator.ts` (produces 27 AKC classes) with a **generic generator** `generateScentWorkClasses(registry, sportId)` that walks `sport.elements × element.levels × variantsByLevel` to emit `GeneratedClass[]`. AKC becomes data, not code; UKC/ASCA fall out for free once populated. AKC's per-class rule detail (time limits, areas, hides from `akcScentWorkRules.ts`) stays AKC-specific, dispatched by registry id — UKC/ASCA get their own rules module or judge-set defaults.

### 3.3 · Wire the hardcoded surfaces

| File | Current | Change |
|---|---|---|
| `features/heritage/entry-blank/buildEntryBlankProps.ts:92–96` | `AKC_LEVELS/ELEMENTS/SPECIAL` consts + hardcoded `getRegistry('AKC')` | Read `getRegistry(trials[0]?.registry_id ?? 'AKC')`; derive grid from `sport.elements`. (The breadcrumb comment already says to.) |
| `features/premium/pdf/.../classOrder.ts:3–25` | hardcoded `LEVEL_ORDER` | Derive ordering from `sport.levels[].order` for the trial's registry |
| `lib/reports/entryFormTypes.ts:80–105` | `AKC_SCENT_WORK_ELEMENTS/LEVELS/HEADERS` consts | Keep as AKC data feeding `akcRegistry`; consumers read from registry, not the consts directly |
| `types/scent-work-types.ts:106–201` | AKC union types + `SCENT_WORK_TIME_LIMITS` | Widen unions to `string`; move time limits behind the per-registry rules dispatch |
| `types/class-template-types.ts:39–49` | `AKCScentWorkClass` literal unions | Generalize to a registry-agnostic `ClassSpec`; AKC validation becomes one validator among three |

---

## 4 · Phases

Each phase is independently shippable, behavior-preserving where noted, and **not complete until its tests are written and passing** (project rule). Phases 0–2 keep AKC output byte-identical; 3–4 add registries; 5 wires surfaces; 6 is QA.

### Phase 0 — Evolve the `RegistrySport` type (AKC-only, behavior-preserving)
- Add `LevelSpec` / `ElementSpec` / `ClassVariant` to `features/registries/types.ts`; migrate `akcRegistry` to the new shape (Container/Interior/Exterior/Buried grid + HD/Detective elements; Novice A/B variants; Detective single-level).
- Keep every existing consumer green by deriving the old flat fields from the new shape where needed (temporary adapters), or update consumers in lockstep.
- **Tests:** unit tests asserting `akcRegistry` round-trips to the exact prior level/element/special/header sets; typecheck + lint clean.

### Phase 1 — Consolidate scattered AKC constants behind the registry
- Make `entryFormTypes.ts`, `scent-work-types.ts`, `classOrder.ts` consumers read AKC structure from `getRegistry('AKC')` rather than their own const copies (keep the consts as the *data feeding* `akcRegistry`, delete duplicate copies).
- **Tests:** **assertion-first regression** — snapshot the current premium class ordering and entry-blank grid for a known AKC trial fixture *before* the change; assert identical after. Source-text regression tests pinning AKC legal phrases.

### Phase 2 — Registry-driven class generator
- Implement `generateScentWorkClasses(registry, sportId)`; re-point AKC trial setup to it; keep `akcScentWorkRules` dispatched by registry id.
- **Tests:** assert the generic generator produces the **exact 27-class AKC catalog** (same names, sections, field overrides) the old `generateAKCScentWorkClasses()` did. This is the proof the abstraction is behavior-preserving.

### Phase 3 — Populate UKC Nosework (§8)
- Add `ukcRegistry` (`features/registries/ukc.ts`): identity/legal, registration field (reg# / PL / LP / TL), `scent-work` sport with 5 levels, elements Container/Interior/Exterior/Vehicle + HD (4 levels, "Excellent", no Elite), A/B variants every level.
- Extend `RegistryId` union + register in `lookup.ts`.
- UKC rules: judge-set time defaults where the rulebook says "announced at handlers' meeting"; element/level data from §8.
- **Tests:** snapshot the generated UKC class catalog; assert level set, HD's divergent labels, A/B-on-every-level; assert `getRegistry('UKC')` resolves and an unknown id still throws.

### Phase 4 — Populate ASCA Scent Detection (§9)
- Add `ascaRegistry` (`features/registries/asca.ts`): identity/legal, QTracker registration field, 5 levels (Novice/Open/Advanced/Excellent/Champion), 4 elements, **"Level C" continuation variant** on the four base levels (`kind: 'continuation'`), Champion as a single-level no-variant tier.
- ASCA time limits from the §9 per-level charts (2.5 min Novice, 3 min Open, …).
- **Tests:** snapshot ASCA catalog; assert Level-C variant kind, "Open"/"Champion" levels, Champion has no Level C; QTracker label renders.

### Phase 5 — Wire publishing surfaces end-to-end
Split into three independently-shippable PRs once the consumer surfaces were surveyed.

- **5a — Landing pages + confirmation emails registry-aware. ✅ DONE (#1054).** `buildEntryBlankProps` already read the trial registry (Phase 1b). 5a threaded `registryId` through the full trial-mapper chain (warm `replicatedToTrial`, cold `mapDatabaseToTrial`, **and** the replication-fallback re-serializer `mapReplicatedTrialToDbRow` — Codex P2 catch), widened `getTrialRegistry` to accept snake **or** camel casing, then pointed the 7 landing hooks (8 styles — Headline reuses Heritage) and both `buildConfirmationProps` builders at `getTrialRegistry(trial)`. Tests pin every mapper hop + UKC/ASCA copy. **Found + queued separately:** the same mappers also dropped `timezone` (every landing silently showed Eastern) — fixed independently in [#1055](https://github.com/rbeezley/myk9-platform/pull/1055).
- **5b — Premium `classOrder` registry-aware. ✅ DONE (#1056).** Refactored `classOrder.ts`'s four exports to take an optional `registryId` (default AKC, backward compatible) plus a `makeClassComparator(registryId)` factory; wired all 6 premium PDF bodies from `GeneratedPremium.org`. This was a **live bug fix, not just multi-registry prep** — UKC premium generation already ships, and UKC's Superior/Elite weren't in AKC's hardcoded ladder, so they sorted to the bottom. Scope grew once during implementation (both confirmed with the user before coding): (1) the same hardcoded ladder also gated `moveUpEligibility.ts` for **every** registry, silently rejecting UKC Superior/Elite and ASCA Open move-ups everywhere (Entries Management, Show Map, Show Desk, the server-side mutation guard) — fixed in the same PR; (2) discovered premium-document generation is gated to AKC/UKC only by a DB CHECK constraint + edge-function 400 (`supabase/functions/generate-premium`), predating the registries system, with dedicated `AKCPremiumTemplate`/`UKCPremiumTemplate` components — **ASCA premium documents are unsupported today**, tracked as a separate epic, not attempted here. Codex review caught a real overclaim: ASCA's Champion is a standalone terminal class with no `level` field on real generated classes, so it's structurally unreachable via move-up regardless of registry — narrowed docs/tests to match (Open only). The `'masters'` alias stays AKC-scoped; retiring it means touching the AKC scoring island (`scent-work-types.ts`/`TimerIntegration.tsx`), deliberately deferred.
- **5c — Live walk. ✅ DONE (2026-07-01).** Unblocked once the write path landed ([`plan-registry-write-path.md`](plan-registry-write-path.md)). Drove both a UKC (Nosework) and an ASCA (Scent Detection) show through the full show-creation wizard against the merged code + shared dev DB, and verified live: registration wizard **class-selection** renders per-registry levels/elements (UKC Superior/Elite × A/B; ASCA Open/Novice/Advanced/Excellent), `trial_type` defaults per registry (Nosework vs Scent Detection), and the **public landing** shows the correct org badge + class vocabulary with zero wrong-registry terms. Entry blank, confirmation email, and premium PDF registry copy remain covered by the 5a/5b unit + source-text regression tests (not re-driven live; ASCA premium docs are the separately-tracked unsupported epic). Persistent UKC + ASCA fixtures left in the dev DB for future testing.
- **Tracked separately, not part of this plan's Phase 5/6:** ASCA premium-document generation (DB constraint + edge fn + new `ASCAPremiumTemplate` + narrative-prompt work); the AKC `'masters'`-alias / scoring-island cleanup. (The dropped-`timezone` mapper gap found in 5a is already fixed — [#1055](https://github.com/rbeezley/myk9-platform/pull/1055).)
- **Tests:** component tests for entry-blank + premium across all three registries; the walk is evidence, not a substitute for tests.

### Phase 6 — QA, regression, scorecard ✅ DONE
- Source-text regression tests for each registry's legal language. Full `pnpm typecheck` + `pnpm lint` + app `vitest`. ✅
- Flip this plan's status to Complete; `git mv` to `docs/archive/` and drop the README row. ✅ (2026-07-01)

---

## 5 · Parallelization

Per [[feedback_parallelize_plans_by_file_not_pr]], fan by **file set**, not logical PR. Phases 0→1→2 are sequential (each depends on the prior's type/shape). Once Phase 2 lands, **Phase 3 (UKC) and Phase 4 (ASCA) are independent** — different new files (`ukc.ts` vs `asca.ts`), parallelizable. Phase 5 depends on 3+4. Keep each phase a single PR through the standard 8-step workflow ([[feedback_workflow]]); this touches class generation + entry rendering, so **Codex review is default-ON** ([[feedback_codex_review_default_on]]).

---

## 6 · Risks & dependencies

1. **CONTENT GAP — RESOLVED 2026-06-29.** The verbatim UKC + ASCA exhibitor-agreement text is now captured in scoping doc **§11** (from the official UKC Performance Entry Form FO135FBL and the ASCA Scent Detection Entry Form). Two follow-ups remain, neither a blocker: (a) UKC's text comes from the *generic Performance* form whose rule-set parenthetical omits Nosework — substitute "(Nosework)" or source the Nosework-specific form; (b) the ASCA agreement is COVID-19-era and should pass the attorney review gate ([[project_legal_content]]) before customer launch. UKC uses "host club" framing (no `memberClubLanguage` field needed). ASCA registration field refined to accept LEP/QT/REGULAR.
2. **Scoring-rule fidelity.** AKC has rich per-(element,level) time/hide/area rules. UKC is largely judge-set; ASCA has per-level max times. Day-one ships ASCA's documented times + judge-set defaults elsewhere; full fidelity is a fast-follow tied to the (out-of-scope) scoring surface.
3. **`RegistrySport` shape churn.** The §3.1 target type is a proposal; expect to refine it in Phase 0 as AKC is forced through it, and again in Phases 3–4 as UKC/ASCA stress it. That is the intended schema-by-extraction loop (scoping §6) — budget for one type revision per registry.
4. **Free-text columns = no DB guardrail.** Because level/element/section are unconstrained text, a typo'd registry config silently produces wrong class names with no DB error. Mitigate with the per-registry catalog snapshot tests (Phases 2–4) as the guardrail the schema doesn't provide.

---

## 7 · Definition of done

- A secretary can create an AKC, UKC, or ASCA scent trial and the correct class catalog is generated.
- Premium PDF, heritage landing, entry blank, confirmation email, and the registration wizard all render correct levels/elements/variants and registry-correct identity language for all three registries.
- AKC output is provably unchanged (catalog + ordering + legal-text snapshots green).
- UKC/ASCA entry-blank legal text rendered from the verbatim agreements in scoping §11 (sourced 2026-06-29).
- `pnpm typecheck` + `pnpm lint` + app vitest green; new unit tests cover each registry's catalog and the generic generator.
