---
name: add-sport-registry
description: Use when adding a new sport (obedience, agility, conformation, fast CAT, Barn Hunt, etc.) or a new sanctioning registry to myK9Show. Captures the procedure, mapper-trace checklist, and decision points learned building the AKC/UKC/ASCA scent-work multi-registry layer (2026-06).
---

# Add a Sport or Registry

This skill is a **procedure and pitfall checklist**, not reusable code. The scent-work `RegistrySport` shape (levels × elements × variants rendered as a grid) was built for scent work specifically and will **not** fit conformation (single-elimination class structure, no levels), fast CAT (straight-line speed race, no levels/elements at all), or agility (jump-height + level combinations that don't map cleanly to scent work's element grid). Expect to design a new sport-family shape, not extend `scentWork.ts`.

## 1. What's reusable vs what isn't

**Reusable (the `Registry` envelope):**
- `apps/myk9show/src/features/registries/types.ts` — `Registry { id, name, shortName, licenseLanguage, memberClubLanguage?, exhibitorAgreement, registrationField, sports: Record<string, RegistrySport>, dogFields }`
- `lookup.ts` — `getRegistry`, `getSport`, `listRegistries`
- `helpers.ts` — `getTrialRegistry`, `getTrialTimezone`, `getShowStyle` (registry-agnostic selectors)
- The registry-per-trial DB model: `trials.registry_id`, one registry per show (trials within a show share it — confirmed for scent work; **re-confirm this still holds before assuming it for a new sport family**, e.g. a club running an AKC obedience trial alongside a Barn Hunt trial under one show would break this assumption)

**NOT reusable — build a new sport-family module:**
- `scentWork.ts`'s `RegistrySport.levels`/`.elements`/`.variantsByLevel`, `generateScentWorkClasses`, `scentWorkGrid` are scent-work's specific data shape. A new sport family (agility, obedience, conformation, fast CAT, Barn Hunt) needs its own derivation module mirroring scentWork.ts's *role* (levels/structure → class catalog → display grid), not its *shape*. Conformation in particular has no "level" concept at all — don't force one.

## 2. Survey every consumer BEFORE scoping the work

This is the single biggest time-saver from this session. "Make X registry-aware" sounds like a one-file change and is almost never one file. Before writing a plan or starting Phase 1:

```bash
grep -rn "getRegistry('AKC')\|getScentWorkSport('AKC')\|getRegistry(\"AKC\")" apps/myk9show/src --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v '\.test\.'
```

Every hit is a consumer that needs a decision: registry-aware now, or explicitly out of scope with a reason. In this session that grep surfaced not just the obvious landing/email/PDF surfaces but two surprises:
- `moveUpEligibility.ts` — a **write-path** rule (Entries Management, Show Map, Show Desk, the server-side mutation guard) sharing the same hardcoded level table as the display-ordering code. Found mid-implementation, not in the original plan.
- Premium PDF generation is gated to AKC/UKC only by a **DB CHECK constraint + edge-function 400** (`supabase/functions/generate-premium`), a pre-existing system separate from the registries config layer entirely — discovered only by tracing where `GeneratedPremium.org` actually gets set.

Both findings changed PR scope. Both were raised to the user via AskUserQuestion before coding, not silently absorbed or silently skipped — do the same for the new sport's surprises.

## 3. Trace every mapper hop for any new per-trial field

If the new sport/registry needs a new column or a new field threaded onto the trial (the way `registry_id` was), it has to survive **three** distinct shape-transforms, not two. Missing the third one shipped a real bug that Codex caught on review:

1. **Cold/anon path** — `apps/myk9show/src/services/mappers/trialMappers.ts` → `mapDatabaseToTrial` (raw PostgREST row → domain `Trial`)
2. **Warm/replicated path** — `apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts` (`rowToTrial`, the `ReplicatedTrial` interface) → `apps/myk9show/src/store/trial-store-helpers.ts` (`replicatedToTrial`)
3. **The replication-fallback re-serializer** — `mapReplicatedTrialToDbRow` in `trialMappers.ts`. This one is easy to miss because it looks like internal plumbing: it converts a replicated row *back* into a snake_case DB-row shape for `getTrialById`/`getTrialsByShow`'s offline fallback, which is then fed back through `mapDatabaseToTrial` a second time. A field dropped here silently resolves to the default (AKC, `America/New_York`) on the fallback path only — easy to miss in testing because the warm and cold paths both work fine.

Write a value-sensitive test for each hop (assert the field survives), plus one round-trip test (`mapReplicatedTrialToDbRow` → `mapDatabaseToTrial` produces the right value) — that round-trip test is what would have caught the miss immediately.

## 4. Schema-by-extraction for the new sport's structure

Don't design the new `RegistrySport`-equivalent shape against one registry. Build it against the **first** real rulebook, then force the **second** registry that uses the same sport through the same type before considering the shape final. Budget for ~1 type revision per additional registry — that's what happened going AKC → UKC → ASCA scent work (the `ClassVariantKind` ownership-vs-continuation distinction only became necessary once ASCA's "Level C" forced the issue).

If a sport spans multiple registries with structurally different rules (e.g., agility under AKC vs. agility under a different sanctioning body), don't assume they share a shape just because the sport name matches.

## 5. Decision points to raise explicitly, not assume

Use `AskUserQuestion` (or just ask) at these forks rather than guessing:
- Can a trial/show legitimately span two registries or two sport families with different structural models? (Confirmed "no" for scent work in `docs/design_handoff_heritage/Multi-Registry Scoping.md` §7 — re-verify per sport, don't inherit the answer.)
- Does an existing hardcoded business rule (move-up eligibility, scoring, placement) implicitly assume the old sport's structure (levels with a strict order) in a way that breaks for the new sport (e.g., conformation's class structure isn't ordered by "level" at all)?
- When a PR's scope grows mid-implementation (a write-path bug, a gated subsystem, a structural wall), should the fix bundle into the current PR or split into its own tracked item? Decide this with the user, don't silently absorb scope or silently drop the finding.

## 6. Test discipline

- **Characterization test before refactoring a shared comparator/generator.** Pin the exact current output (including any vestigial/weird cases — aliases, plural labels) before changing the implementation underneath it. If the characterization test passes unmodified against the new implementation, that's the proof the refactor is behavior-preserving.
- **Test against the real generated shape, not a plausible synthetic one.** A test asserting `{element: 'Container', level: 'Champion'}` would pass even though real generated Champion classes never carry a `level` field at all (standalone element). Before writing a regression test for a new sport's edge case, check what the actual generator function produces — don't guess the shape.
- **Source-text regression tests for legal language.** Pin paragraph count, key clauses (`toMatch` on distinctive phrases), and a ±5% character-length bound (catches silent truncation) for every registry's exhibitor agreement / identity strings. Mirror this for every new registry's legal text from day one — don't let it lag behind like AKC's identity strings did here.

## 7. Workflow rhythm

One PR per phase, through the standard 8-step workflow (implement → test → `/simplify` → `/commit` → PR → `/review` + `/codex:review` → fix → merge → cleanup). Codex review is a good default-on here — both real findings this session (a dropped mapper field, an overclaimed comment) were exactly the "real bug or overclaim Claude reviewed past" class of issue Codex catches. After merge: sync `main`, `git fetch --prune`, branch the next phase off fresh `main`, clean up the merged local branch.

## Reference

The original build-out: `docs/plan-multi-registry-scent-work.md` and `docs/design_handoff_heritage/Multi-Registry Scoping.md` (the resolved-questions section §7 and the per-registry sections §7.5/§8/§9 are good templates for scoping a new registry's rulebook extraction).
