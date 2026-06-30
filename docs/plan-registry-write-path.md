# Registry Write Path — populate `trials.registry_id` from the show's organization

> **Status:** Active

## Problem

The multi-registry scent-work work ([`plan-multi-registry-scent-work.md`](plan-multi-registry-scent-work.md), PRs #1040–#1059) made the whole app registry-**aware** — ~15 surfaces *read* `trials.registry_id`. But nothing ever *writes* it. The live trial-create path (`TrialInput → trialStore.addTrial → ReplicatedTrialsTable.toSupabaseRow`) never sets the column, so every trial created through the product gets the DB default `'AKC'` (migration 192) regardless of the show's organization.

**Consequence:** a secretary cannot create a UKC or ASCA trial through the UI. The day-one "AKC + UKC + ASCA" commitment is not actually achievable, and Phase 5c (the live walk) is blocked — there is no non-AKC trial to look at. This was surfaced by Phase 5c itself, before any browser walk.

## Design decision (settled with the user, 2026-06-30)

**`registry_id` is derived from `shows.organization`** — not set via a separate per-trial picker.

Rationale:
- **They are the same axis (the sanctioning body).** `organization` is the user-entered source of truth (show level, broad list); `registry_id` is the validated, config-backed projection (only the configured registries: AKC/UKC/ASCA). A secretary picking "UKC" as the show's organization *is* choosing the registry.
- **Per scoping §7, a show's trials all share one registry** — so a per-trial registry picker would only introduce inconsistency, not useful flexibility.
- **This is the codebase's offline-first pattern.** Storing a denormalized, validated projection of a parent value on the child row (so reads work offline without a join) is exactly the `Denormalize at Sync` convention. `registry_id` on the trial is the denormalized cache of the show's organization. This is why we keep the column rather than deriving on read (which would force a trial→show join at every read site and fight the offline-first model).

Mapping: `registry_id = organization` when `organization ∈ {AKC, UKC, ASCA}` (the configured registries), else `'AKC'` (the existing NOT-NULL default — harmless for sports that never read registry). No migration to the column or its default is needed.

## Phases

### Phase 1 — Derive + thread `registryId` through the live create path
- Add `deriveRegistryId(organization: string | null): RegistryId` to `features/registries/helpers.ts` (next to `getTrialRegistry`): trim, return the org when `listRegistries()` includes it, else `'AKC'`. This is the single source of the org→registry rule.
- Add `registryId?: string` to `TrialInput` (`store/trial-store-types.ts`).
- Set `registryId: deriveRegistryId(showOrganization)` in `createTrials` (`pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts` — `showOrganization` is already a parameter, already used for the `trialType` fallback).
- Thread it through the two remaining write hops (mirror of the read-side 3-hop the `add-sport-registry` skill warns about):
  1. `trialStore.addTrial` — set `registryId: trialData.registryId` on the constructed `ReplicatedTrial`.
  2. `ReplicatedTrialsTable.toSupabaseRow` — write `registry_id: trial.registryId ?? 'AKC'` (the final DB-row serializer used by both INSERT and UPDATE mutations).
- Also handle the `ShowCloneDialog` create path (`components/shows/cloning/ShowCloneDialog.tsx` `addTrial`) — clone should inherit the source show's derived registry.
- **Tests:** unit-test `deriveRegistryId` (AKC/UKC/ASCA pass through; NACSW/Other/null → AKC; trim/case). Value-sensitive test that `toSupabaseRow` emits `registry_id` from `registryId`. Test that `createTrials` builds a `TrialInput` with the derived registry for a UKC/ASCA organization. (The legacy `mapTrialInputToInsert` is unused — do not wire it; note it in the test as intentionally skipped.)

### Phase 2 — Backfill existing trials
- Migration: for trials whose show's `organization ∈ {UKC, ASCA}` but whose `registry_id` is still the default `'AKC'`, set `registry_id = shows.organization`. AKC→AKC is a no-op; non-registry orgs (NACSW/Other) stay AKC.
  ```sql
  UPDATE public.trials t
     SET registry_id = s.organization
    FROM public.shows s
   WHERE t.show_id = s.id
     AND s.organization IN ('UKC','ASCA')
     AND t.registry_id = 'AKC';
  ```
- Shared-DB push — confirm before running (`supabase db push`).
- **Pre-flight:** query the target rows first (count of UKC/ASCA-org shows with AKC-default trials) so the backfill's blast radius is known before pushing. Pre-launch with AKC-only seed data, this may legitimately be a no-op today; the migration still belongs in history for correctness going forward.

### Phase 3 — Keep `registry_id` in sync when a show's organization changes
- The invariant is "every trial's `registry_id` = `deriveRegistryId(show.organization)`." If a secretary edits a show's organization after trials exist, re-derive and update those trials' `registry_id` (the UPDATE path already goes through `toSupabaseRow`, so it carries `registryId` once set on the `ReplicatedTrial`).
- Hook point: `showStore.updateShow` (`store/showStore.ts`) — when `organization` is among the changed fields, resync the show's trials.
- **Tests:** changing a show org from AKC→UKC updates its trials' `registryId`; a non-org edit leaves them untouched.

### Phase 4 — Live verification (unblocks Phase 5c)
- With the write path landed, create one UKC and one ASCA scent trial **through the registration wizard** on the shared dev environment (the user-chosen method), then walk the registry-aware surfaces: premium PDF (AKC/UKC only — see scent-work plan), heritage landing, entry blank, confirmation email, registration wizard class-selection. Confirm levels/elements/variants/legal language render per registry.
- Creating those trials writes to the shared dev DB — one up-front confirmation covers the sequence.

## Out of scope / future (deliberately not in this plan)

- **Sport-key wiring.** Registry and sport are orthogonal axes; the rulebook is `registry × sport`. Today every registry config only has the `'scent-work'` sport and the code hardcodes that key (`getScentWorkSport`). Adding a second sport (obedience/agility/…) requires a `trial_type → sport-key` mapping so the right `RegistrySport` is selected. That is the main structural task for going multi-sport; see the `add-sport-registry` skill.
- **Tightening the organization dropdown.** It currently lists aspirational bodies with no rulebook config (NADAC/USDAA/etc.). Secretaries shouldn't be able to pick a body the app can't run. Separate cleanup.
- **Collapse vs keep the two fields.** We chose keep+derive (offline-first denormalization). The longer-term "should `organization` and `registry_id` be one field" question is best revisited when the second sport forces the FastCAT-style "event needs no rulebook config" case into the open.
- **Foundation note for non-scent sports (anticipated, NOT yet validated — validate when building sport #2):** Scent work conflates "the competitive/titling category" with "the scheduled group that runs together" into one `class` row. Other sports split them — e.g. **FastCAT** uses time **blocks** (block 1 @ 9:00, block 2 @ 9:30) that are pure scheduling subdivisions, distinct from the single "FastCAT" titling category; **conformation** partitions by breed/sex/age. The DB is already flexible enough to add this additively (nullable free-text class fields, `class.start_time`, `entry.run_order`, no CHECK constraints — a block is a `class`-as-scheduled-group, or a lightweight new heat layer). The protection against rework is: (1) keep sport-specifics behind the `RegistrySport` config, never leaking "class = element×level×section" or "scoring = qualify/fault" into shared scheduling/reporting code; (2) treat the scheduling layer as separate from the competitive-category layer. Do NOT pre-build a universal block engine — design it against real requirements when FastCAT lands.

## Reference

- Read side: [`plan-multi-registry-scent-work.md`](plan-multi-registry-scent-work.md) (registry-aware surfaces, the trial-mapper read hops).
- Scoping §7 (one registry per show): [`design_handoff_heritage/Multi-Registry Scoping.md`](design_handoff_heritage/Multi-Registry%20Scoping.md).
- Procedure for the next sport/registry: the `add-sport-registry` skill.
