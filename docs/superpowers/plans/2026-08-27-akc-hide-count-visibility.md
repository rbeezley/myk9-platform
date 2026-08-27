# AKC Hide-Count Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose rule-defined fixed hide counts to exhibitors without exposing actual AKC Odor Search Master or Detective counts, while correcting AKC Interior Excellent to a known total of three.

**Architecture:** Keep direct `classes.num_hides` access denied. During replication, enrich only class rows already visible to the caller from public `sport_class_rules` when the matching registry rule has both `hides_known = true` and a non-null `hide_count_fixed`; then let the existing authorized RPC override those values for officials. Correct the canonical and persisted AKC Interior Excellent rule with one narrowly scoped migration.

**Tech Stack:** TypeScript, Vitest, Supabase/PostgreSQL migrations, PostgREST, IndexedDB replication.

**Spec:** `docs/superpowers/specs/2026-08-27-akc-hide-count-visibility-design.md`

## Global Constraints

- Keep direct `anon` and `authenticated` SELECT access to `classes.num_hides` denied.
- Keep `get_show_class_hide_counts(uuid)` official-only and do not broaden its authorization.
- Derive exhibitor-visible counts only for rules with `hides_known = true` and `hide_count_fixed IS NOT NULL`.
- Match rules by trial registry, element, level, and section; never infer secrecy from a level name alone.
- Preserve UKC and ASCA rule metadata unchanged.
- AKC Handler Discrimination Master remains fixed and visible at 3.
- AKC Odor Search Master and Detective actual counts never enter an exhibitor's replica.
- Preserve offline-first class reads and existing auth-boundary cache scrubbing.
- No new UI surface or application-code path outside the existing replication flow.
- Do not apply the migration to the linked Supabase project without explicit shared-system approval.

## Verified starting inventory

The 2026-08-27 read-only linked-project inventory covered `sport_templates`,
`sport_class_rules`, `trials`, and `classes` in one pass:

- AKC `Interior / Excellent`: fixed NULL, band 1–3, `hides_known = false`.
- AKC `Interior / Master`: band 2–6, `hides_known = false`.
- AKC `Handler Discrimination / Master`: fixed 3, `hides_known = true`.
- AKC `Detective`: band 5–10, `hides_known = false`.
- UKC and ASCA retain their independent fixed/banded and known/unknown rows.
- The linked environment currently has no AKC Interior Excellent class rows to
  backfill; the migration still includes the scoped backfill for other/local
  environments and future-safe replay.

---

### Task 1: Pin the corrected AKC rule in TypeScript

**Files:**
- Modify: `apps/myk9show/src/data/templates/__tests__/akcScentWorkRules.test.ts`
- Modify: `apps/myk9show/src/data/templates/akcScentWorkRules.ts`
- Modify: `apps/myk9show/src/types/show-template-types.ts`

**Interfaces:**
- Consumes: `generateAKCScentWorkClasses(): ClassDefinition[]` and `getHideConfiguration(element, level): string`.
- Produces: Interior Excellent hide copy `Set by Rules: 3`; no type or function signature changes.

- [ ] **Step 1: Write failing value assertions**

Add tests that locate `Interior Excellent` and `Handler Discrimination Master` and assert:

```ts
expect(interiorExcellent?.fieldOverrides?.hides).toEqual({ ruleValue: 'Set by Rules: 3' });
expect(handlerDiscriminationMaster?.fieldOverrides?.hides).toEqual({
  ruleValue: 'Set by Rules: 3 per class',
});
```

- [ ] **Step 2: Run the focused test red**

Run:

```bash
pnpm --dir apps/myk9show exec vitest run src/data/templates/__tests__/akcScentWorkRules.test.ts --reporter=verbose
```

Expected: the Interior Excellent assertion fails with the existing `Set by Rules: Unknown (1-3)` value; Handler Discrimination Master remains green as a non-regression control.

- [ ] **Step 3: Correct the minimal rule copy**

Change the Interior Excellent branch in `getHideConfiguration` to return:

```ts
return 'Set by Rules: 3';
```

Correct the stale `show-template-types.ts` level description so Excellent describes complex multi-area searches without claiming an unknown total and uses the canonical `Master` label.

- [ ] **Step 4: Run the focused test green**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the TypeScript rule correction**

```bash
git add apps/myk9show/src/data/templates/akcScentWorkRules.ts apps/myk9show/src/data/templates/__tests__/akcScentWorkRules.test.ts apps/myk9show/src/types/show-template-types.ts
git commit -m "fix(rules): correct AKC Interior Excellent hide total"
```

### Task 2: Correct and backfill the database rule

**Files:**
- Create: `supabase/migrations/20260827120000_fix_akc_interior_excellent_hide_count.sql`
- Modify: `apps/myk9show/src/test/database/registryDbParityContract.test.ts`

**Interfaces:**
- Consumes: `sport_templates.organization`, `sport_templates.sport_code`, `sport_class_rules` hide columns, `trials.registry_id`, and class identity columns.
- Produces: exactly one AKC Scent Work Interior Excellent rule with `hide_count_fixed = 3`, null min/max, and `hides_known = true`; matching persisted classes receive `num_hides = 3` and `hides_known = true`.

- [ ] **Step 1: Add the failing migration contract**

Add an `AKC` entry to `CLASS_RULE_DELTAS` whose `proves` callback reads `20260827120000_fix_akc_interior_excellent_hide_count.sql` and requires executable SQL matching:

```ts
expect(sql).toMatch(/UPDATE public\.sport_class_rules/i);
expect(sql).toMatch(/hide_count_fixed = 3/i);
expect(sql).toMatch(/hide_count_min = NULL/i);
expect(sql).toMatch(/hide_count_max = NULL/i);
expect(sql).toMatch(/hides_known = TRUE/i);
expect(sql).toMatch(/organization = 'AKC'/i);
expect(sql).toMatch(/sport_code = 'akc-scent-work'/i);
expect(sql).toMatch(/element = 'Interior'/i);
expect(sql).toMatch(/level = 'Excellent'/i);
expect(sql).toMatch(/UPDATE public\.classes/i);
```

Use `apply: tuples => tuples` because the migration changes rule values, not the class set.

- [ ] **Step 2: Run the migration contract red**

Run:

```bash
pnpm --dir apps/myk9show exec vitest run src/test/database/registryDbParityContract.test.ts --reporter=verbose
```

Expected: FAIL because the named migration does not exist.

- [ ] **Step 3: Write the narrow migration**

Create the migration with:

```sql
DO $$
DECLARE
  v_rule_count integer;
BEGIN
  SELECT count(*)
    INTO v_rule_count
    FROM public.sport_class_rules r
    JOIN public.sport_templates st ON st.id = r.sport_template_id
   WHERE st.organization = 'AKC'
     AND st.sport_code = 'akc-scent-work'
     AND r.element = 'Interior'
     AND r.level = 'Excellent'
     AND r.section IS NULL;

  IF v_rule_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one AKC Interior Excellent rule, found %', v_rule_count;
  END IF;
END;
$$;

UPDATE public.sport_class_rules AS r
   SET hide_count_fixed = 3,
       hide_count_min = NULL,
       hide_count_max = NULL,
       hides_known = TRUE,
       updated_at = now()
  FROM public.sport_templates AS st
 WHERE st.id = r.sport_template_id
   AND st.organization = 'AKC'
   AND st.sport_code = 'akc-scent-work'
   AND r.element = 'Interior'
   AND r.level = 'Excellent'
   AND r.section IS NULL;

UPDATE public.classes AS c
   SET num_hides = 3,
       hides_known = TRUE,
       updated_at = now()
  FROM public.trials AS t
 WHERE t.id = c.trial_id
   AND t.registry_id = 'AKC'
   AND c.element = 'Interior'
   AND c.level = 'Excellent';
```

Include rationale explaining that the total is fixed while its two-area distribution remains undisclosed. Do not edit migration `030`; migrations are immutable history.

- [ ] **Step 4: Run the migration contract green**

Run the Step 2 command. Expected: PASS, including the exhaustive mutation-accounting guard.

- [ ] **Step 5: Commit the migration and contract**

```bash
git add supabase/migrations/20260827120000_fix_akc_interior_excellent_hide_count.sql apps/myk9show/src/test/database/registryDbParityContract.test.ts
git commit -m "fix(db): correct AKC Interior Excellent hide rule"
```

### Task 3: Enrich visible class rows with public fixed counts

**Files:**
- Modify: `apps/myk9show/src/services/replication/resolveClassHideCounts.test.ts`
- Modify: `apps/myk9show/src/services/replication/resolveClassHideCounts.ts`
- Modify: `apps/myk9show/src/services/replication/ReplicatedClassesTable.ts`

**Interfaces:**
- Consumes rows shaped as `{ id, trial_id, element, level, section }`; trial rows shaped as `{ id, show_id, registry_id }`; public rule rows shaped as `{ element, level, section, hide_count_fixed, hides_known, sport_templates: { organization } }`.
- Produces `resolveHideCountsForClassRows(rows): Promise<Map<string, number>>`, containing public fixed rule values plus authorized RPC values, with RPC values taking precedence.

- [ ] **Step 1: Replace the resolver test with a complete red matrix**

Build a Supabase chain mock keyed by table and assert these rows:

```ts
const rows = [
  { id: 'akc-excellent', trial_id: 'akc-trial', element: 'Interior', level: 'Excellent', section: null },
  { id: 'akc-master', trial_id: 'akc-trial', element: 'Buried', level: 'Master', section: null },
  { id: 'akc-detective', trial_id: 'akc-trial', element: 'Detective', level: null, section: null },
  { id: 'akc-hd-master', trial_id: 'akc-trial', element: 'Handler Discrimination', level: 'Master', section: null },
  { id: 'ukc-hd-master', trial_id: 'ukc-trial', element: 'Handler Discrimination', level: 'Master', section: 'A' },
  { id: 'asca-excellent', trial_id: 'asca-trial', element: 'Interior', level: 'Excellent', section: null },
];
```

Mock public rules so AKC Interior Excellent=3 known/fixed, AKC HD Master=3 known/fixed, UKC HD Master=1 known/fixed, AKC Master/Detective and ASCA Excellent are unknown/banded. With an empty official RPC, assert the result is exactly:

```ts
new Map([
  ['akc-excellent', 3],
  ['akc-hd-master', 3],
  ['ukc-hd-master', 1],
])
```

Add a second test where the RPC returns `akc-master=4` and `akc-excellent=99`; assert both RPC values override the public map. Add error-path assertions showing a public-rule lookup failure does not block official RPC values and an RPC failure does not remove public fixed values.

- [ ] **Step 2: Run the resolver test red**

Run:

```bash
pnpm --dir apps/myk9show exec vitest run src/services/replication/resolveClassHideCounts.test.ts --reporter=verbose
```

Expected: FAIL because the current resolver only returns RPC values and does not request registry or public-rule data.

- [ ] **Step 3: Implement registry-rule matching**

In `resolveClassHideCounts.ts`:

1. Extend the trial select to `id, show_id, registry_id`.
2. Query `sport_class_rules` with the public columns plus
   `sport_templates!inner(organization)`, restricted to the registry IDs in the
   already-visible trials, `hides_known = true`, and non-null
   `hide_count_fixed`.
3. Build keys with a pure helper so nulls cannot collide:

```ts
const ruleKey = (
  registryId: string,
  element: string | null | undefined,
  level: string | null | undefined,
  section: string | null | undefined
) => JSON.stringify([registryId, element ?? null, level ?? null, section ?? null]);
```

4. Seed `byClassId` only when the matching rule is known and fixed.
5. Call `get_show_class_hide_counts` for each visible show and overwrite matching map entries.
6. Treat public-rule and RPC failures independently; log and return whichever safe enrichment succeeded.

Update comments in both resolver and `ReplicatedClassesTable.ts` to describe public fixed counts plus official protected counts. Do not change `CLASS_AUTHENTICATED_COLUMN_SELECT`, `CLASS_OFFICIAL_ONLY_COLUMNS`, or `clearCachedHideCounts()`.

- [ ] **Step 4: Run the resolver and replication tests green**

Run:

```bash
pnpm --dir apps/myk9show exec vitest run src/services/replication/resolveClassHideCounts.test.ts src/services/replication/__tests__/ReplicatedClassesTable.test.ts --reporter=verbose
```

Expected: PASS.

- [ ] **Step 5: Commit the replication behavior**

```bash
git add apps/myk9show/src/services/replication/resolveClassHideCounts.ts apps/myk9show/src/services/replication/resolveClassHideCounts.test.ts apps/myk9show/src/services/replication/ReplicatedClassesTable.ts
git commit -m "fix(replication): expose public fixed hide counts"
```

### Task 4: Expand closure evidence for the corrected boundary

**Files:**
- Modify: `supabase/tests/class_hide_count_gating_test.sql`

**Interfaces:**
- Consumes: raw column ACL, `get_show_class_hide_counts(uuid)`, and applied `sport_class_rules`.
- Produces: behavioral evidence for known AKC counts, protected Master/Detective counts, official access, and non-AKC preservation.

- [ ] **Step 1: Expand fixtures and assertions**

Add AKC fixtures for Interior Excellent (3/known), Handler Discrimination Master (3/known), Buried Master (3/unknown), Exterior Master (4/unknown), and Detective (7/unknown). Add a UKC unknown-count fixture under a UKC trial.

As the exhibitor, retain the direct read and predicate denial assertions, assert the official RPC returns zero rows, and query public rules to assert:

```sql
-- AKC Interior Excellent is publicly fixed at 3.
-- AKC Handler Discrimination Master is publicly fixed at 3.
-- AKC Buried Master and Detective remain unknown/banded.
-- The selected UKC rule retains its original hides_known/fixed-band values.
```

As manager, assert the RPC returns every AKC class and its persisted values. As assigned judge, assert only the assigned Buried Master row is returned. Keep all fixtures inside the existing transaction and rollback.

- [ ] **Step 2: Run the focused SQL file against local migrated Supabase**

After applying migrations locally, run:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/class_hide_count_gating_test.sql
```

Expected: the final `PASS` notice and transaction rollback. If local Supabase is unavailable, record this as an explicit PR verification limitation; do not run the behavioral harness against a shared project.

- [ ] **Step 3: Commit the closure matrix**

```bash
git add supabase/tests/class_hide_count_gating_test.sql
git commit -m "test(security): cover corrected hide-count boundary"
```

### Task 5: Verify, review, and prepare delivery

**Files:**
- Review all files changed since `2ccb7dc69`.
- Update: MYK9-127 after verification through the existing Linear issue; create no duplicate.

**Interfaces:**
- Consumes: completed tasks 1–4.
- Produces: a reviewable branch and PR with explicit migration deployment follow-up.

- [ ] **Step 1: Run focused unit and contract verification**

```bash
pnpm --dir apps/myk9show exec vitest run src/data/templates/__tests__/akcScentWorkRules.test.ts src/services/replication/resolveClassHideCounts.test.ts src/services/replication/__tests__/ReplicatedClassesTable.test.ts src/test/database/registryDbParityContract.test.ts --reporter=verbose
pnpm exec vitest run scripts/qa/run-behavioral-sql-tests.test.ts --reporter=verbose
```

Expected: PASS.

- [ ] **Step 2: Run type and lint checks proportionate to auth/offline risk**

```bash
pnpm --filter @myk9/show typecheck
pnpm --filter @myk9/show lint
```

Expected: PASS. Stop any hanging test/check after 60 seconds and report it rather than retrying indefinitely.

- [ ] **Step 3: Review the complete diff**

```bash
git diff --check
git diff --stat main...HEAD
git diff main...HEAD
git status --short
```

Confirm no raw-column grant was restored, no RPC authorization changed, no UKC/ASCA rule row changed, and no unrelated file is present.

- [ ] **Step 4: Update the canonical issue and QA evidence**

Reopen MYK9-127 if its status is still Done, then comment with:

- corrected AKC scope and implementation summary;
- tests/checks run and their results;
- branch/PR link;
- migration deployment state;
- whether each acceptance criterion passed;
- any remaining linked-environment evidence needed for SA-2026-07-29-01.

Do not close MYK9-127 until the migration is applied to the linked environment and the closure matrix is evidenced there.

- [ ] **Step 5: Push and open the PR after the shared-system confirmation gate**

Use the repository `ship-pr` workflow. The PR must link MYK9-127, include the checked acceptance criteria, identify the migration as requiring deployment, explain the raw-column/RPC non-goals, and state material agent involvement.
