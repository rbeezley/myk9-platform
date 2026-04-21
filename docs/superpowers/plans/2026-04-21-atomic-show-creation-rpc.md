# Atomic Show Creation (create_show_with_children RPC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-step show/trial/class creation with an atomic Postgres RPC so any partial failure leaves no orphaned rows.

**Architecture:** A `SECURITY DEFINER` Postgres function (`create_show_with_children`) wraps the show + trial + class + judge_assignment INSERTs in a single implicit PL/pgSQL transaction. The frontend calls this RPC on the **online + new-show** path, then seeds the local IndexedDB replication tables as already-synced rows. The **offline path** (when `!isOnline`) and the **edit mode** path remain entirely unchanged.

**Tech Stack:** Postgres PL/pgSQL, TypeScript, `@myk9/replication` IndexedDB layer, `@tanstack/react-query`, Supabase JS SDK.

---

## File Map

| File | Action | Why |
|------|--------|-----|
| `supabase/migrations/145_create_show_with_children_rpc.sql` | **Create** | Atomic INSERT function |
| `apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardTransformers.ts` | **Modify** | Export `WizardShowData`; add `trialType?` to `WizardTrial` |
| `apps/myk9show/src/pages/secretary/ShowCreationWizard/buildCreateShowPayload.ts` | **Create** | Pure payload-builder (testable, RPC-call-agnostic) |
| `apps/myk9show/src/pages/secretary/ShowCreationWizard/__tests__/buildCreateShowPayload.test.ts` | **Create** | Unit tests for the payload builder |
| `apps/myk9show/src/pages/secretary/ShowCreationWizard/saveShowAtomicOnline.ts` | **Create** | Extracted RPC branch helper (keeps the hook under 500 lines per CLAUDE.md) |
| `apps/myk9show/src/pages/secretary/ShowCreationWizard/__tests__/saveShowAtomicOnline.test.ts` | **Create** | Integration test for the RPC branch (mocks `supabase.rpc` + replication `set`) |
| `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts` | **Modify** | Call `saveShowAtomicOnline` on the online new-show path |

---

## Background: how the replication layer works

`ReplicatedTable.set(id, data, isDirty = false)` is a **public** method (confirmed in `packages/replication/dist/index.d.ts`). When called with `isDirty=false`:
- Writes the row to IndexedDB with `syncStatus: 'synced'`, `isDirty: false`.
- Calls `notifyListeners()` → Zustand store subscriptions fire asynchronously, updating the show/trial/class stores.
- Does **not** queue a mutation → no re-upload to Supabase.

This is exactly the right primitive for seeding local cache after a server-side atomic write.

---

## Task 1 — Write migration 145

**Files:**
- Create: `supabase/migrations/145_create_show_with_children_rpc.sql`

### Authorization design

Mirrors the `shows_insert` RLS policy (migration 135): caller must be `is_site_admin()` **OR** `is_club_admin(club_id)` **OR** `is_trial_secretary(club_id)`. The `club_id` comes from `p_show->>'club_id'`.

### Column notes

- Shows: `id`, `name`, `organization`, `start_date`, `end_date`, `location`, `status`, `club_id`, `entry_open_date`, `entry_close_date`, `pre_entry_fee`, `day_of_show_fee`, `accept_check_payments`, `accept_cash_payments` — exactly what `ReplicatedShowsTable.toSupabaseRow()` writes.
- Trials: `id`, `show_id`, `name`, `date`, `trial_number`, `status`, `trial_type`, `planned_start_time`, `event_number`, `display_order`, `category` — from `ReplicatedTrialsTable.toSupabaseRow()`.
- Classes: `id`, `trial_id`, `name`, `level`, `element`, `section`, `entry_fee`, `max_entries`, `status`, `start_time`, `num_areas` (not `area_count` — that's the alias), `time_limit_seconds`, `timer_mode`, `hides_known`, `distraction_count` — from `ReplicatedClassesTable.toSupabaseRow()`.
- `judge_assignments`: `person_id`, `show_id`, `status`, `confirmed_at`.

JSONB boolean fields must be extracted with `->` (not `->>`), then cast: `(v_class->'hides_known')::boolean`. Text/numeric/uuid fields use `->>` + explicit cast.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/145_create_show_with_children_rpc.sql` with exactly this content:

```sql
-- =============================================================================
-- Migration 145: create_show_with_children RPC
--
-- Context:
-- saveShow in useShowCreationWizardActions.ts writes to shows, trials,
-- classes, and judge_assignments across multiple round-trips with no
-- transaction guard. A partial failure (e.g. trials INSERT succeeds,
-- classes INSERT fails) leaves orphaned rows and a half-built show.
--
-- Fix: Introduce a SECURITY DEFINER RPC that accepts the full show payload
-- as JSON arrays and inserts all rows in a single implicit PL/pgSQL
-- transaction. Any exception rolls back the entire batch.
--
-- Authorization mirrors the shows_insert RLS policy (migration 135):
-- caller must be a site admin, club admin, or trial secretary for the
-- target club.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_show_with_children(
  p_show      jsonb,
  p_trials    jsonb,
  p_classes   jsonb,
  p_judge_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_auth uuid;
  v_club_id     uuid;
  v_show_id     uuid;
  v_trial       jsonb;
  v_class       jsonb;
  v_judge_id    uuid;
BEGIN
  v_caller_auth := auth.uid();
  IF v_caller_auth IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_club_id := (p_show->>'club_id')::uuid;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'p_show must include a non-null club_id'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(v_club_id)
    OR public.is_trial_secretary(v_club_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to create shows for club %', v_club_id
      USING ERRCODE = '42501';
  END IF;

  v_show_id := (p_show->>'id')::uuid;
  IF v_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show must include a non-null id'
      USING ERRCODE = '22023';
  END IF;

  -- Insert show
  INSERT INTO public.shows (
    id, name, organization, start_date, end_date, location, status,
    club_id, entry_open_date, entry_close_date, pre_entry_fee,
    day_of_show_fee, accept_check_payments, accept_cash_payments,
    updated_at
  ) VALUES (
    v_show_id,
    p_show->>'name',
    p_show->>'organization',
    (p_show->>'start_date')::date,
    (p_show->>'end_date')::date,
    NULLIF(p_show->>'location', ''),
    COALESCE(NULLIF(p_show->>'status', ''), 'draft'),
    v_club_id,
    NULLIF(p_show->>'entry_open_date', '')::date,
    NULLIF(p_show->>'entry_close_date', '')::date,
    NULLIF(p_show->>'pre_entry_fee', '')::numeric,
    NULLIF(p_show->>'day_of_show_fee', '')::numeric,
    (p_show->'accept_check_payments')::boolean,
    (p_show->'accept_cash_payments')::boolean,
    NOW()
  );

  -- Insert trials
  FOR v_trial IN SELECT value FROM jsonb_array_elements(COALESCE(p_trials, '[]'::jsonb))
  LOOP
    INSERT INTO public.trials (
      id, show_id, name, date, trial_number, status, trial_type,
      planned_start_time, event_number, display_order, category, updated_at
    ) VALUES (
      (v_trial->>'id')::uuid,
      v_show_id,
      v_trial->>'name',
      (v_trial->>'date')::date,
      NULLIF(v_trial->>'trial_number', ''),
      COALESCE(NULLIF(v_trial->>'status', ''), 'upcoming'),
      NULLIF(v_trial->>'trial_type', ''),
      NULLIF(v_trial->>'planned_start_time', ''),
      NULLIF(v_trial->>'event_number', ''),
      NULLIF(v_trial->>'display_order', '')::integer,
      NULLIF(v_trial->>'category', ''),
      NOW()
    );
  END LOOP;

  -- Insert classes
  FOR v_class IN SELECT value FROM jsonb_array_elements(COALESCE(p_classes, '[]'::jsonb))
  LOOP
    INSERT INTO public.classes (
      id, trial_id, name, level, element, section,
      entry_fee, max_entries, status, start_time,
      num_areas, time_limit_seconds, timer_mode,
      hides_known, distraction_count, updated_at
    ) VALUES (
      (v_class->>'id')::uuid,
      (v_class->>'trial_id')::uuid,
      v_class->>'name',
      NULLIF(v_class->>'level', ''),
      NULLIF(v_class->>'element', ''),
      NULLIF(v_class->>'section', ''),
      NULLIF(v_class->>'entry_fee', '')::numeric,
      NULLIF(v_class->>'max_entries', '')::integer,
      COALESCE(NULLIF(v_class->>'status', ''), 'upcoming'),
      NULLIF(v_class->>'start_time', ''),
      NULLIF(v_class->>'num_areas', '')::integer,
      NULLIF(v_class->>'time_limit_seconds', '')::integer,
      NULLIF(v_class->>'timer_mode', ''),
      (v_class->'hides_known')::boolean,
      NULLIF(v_class->>'distraction_count', '')::integer,
      NOW()
    );
  END LOOP;

  -- Insert judge assignments
  FOREACH v_judge_id IN ARRAY COALESCE(p_judge_ids, ARRAY[]::uuid[])
  LOOP
    INSERT INTO public.judge_assignments (
      person_id, show_id, status, confirmed_at
    ) VALUES (
      v_judge_id,
      v_show_id,
      'confirmed',
      NOW()
    );
  END LOOP;

  RETURN v_show_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) IS
  'Atomically creates a show with its trials, classes, and judge assignments in a single transaction. Any failure rolls back the whole batch. Authorization mirrors shows_insert RLS (migration 135): caller must be site admin, club admin, or trial secretary for the target club.';
```

- [ ] **Step 2: Spot-check the file**

Run: `head -10 supabase/migrations/145_create_show_with_children_rpc.sql`
Expected: First line is `-- =============================================================================`.

---

## Task 2 — Export WizardShowData and add trialType to WizardTrial

**Files:**
- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardTransformers.ts`

- [ ] **Step 1: Export WizardShowData**

In `showCreationWizardTransformers.ts` line 10, change:
```typescript
interface WizardShowData {
```
to:
```typescript
export interface WizardShowData {
```

- [ ] **Step 2: Add trialType to WizardTrial**

The `WizardTrial` interface is missing `trialType` relative to the wizard store's trial shape. Add it so the types align when `trials` from `useWizardStore()` is passed to the payload builder.

Find in `showCreationWizardTransformers.ts`:
```typescript
export interface WizardTrial {
  id: string;
  name: string;
  dateTime: string;
  eventNumber: string;
  classes: Array<{
```
Replace with:
```typescript
export interface WizardTrial {
  id: string;
  name: string;
  dateTime: string;
  eventNumber: string;
  trialType?: string | undefined;
  classes: Array<{
```

---

## Task 3 — Create buildCreateShowPayload.ts

**Files:**
- Create: `apps/myk9show/src/pages/secretary/ShowCreationWizard/buildCreateShowPayload.ts`

This is a **pure function** — no Supabase calls, no hooks. All side-effectful work (rule-fetching, RPC call, IndexedDB writes) stays in the hook.

- [ ] **Step 1: Write the file**

Create `apps/myk9show/src/pages/secretary/ShowCreationWizard/buildCreateShowPayload.ts`:

```typescript
import { format } from 'date-fns';
import type { SportClassRuleRow } from '@/types/sport-template-types';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { JudgeDetailsMap } from './show-creation-wizard-types';
import { createClassDataFromWizard } from './showCreationWizardTransformers';
import type { WizardShowData, WizardTrial } from './showCreationWizardTransformers';

// ── RPC payload shapes (snake_case matches Postgres column names) ─────────────

export interface ShowRpcPayload {
  id: string;
  name: string;
  organization: string;
  start_date: string;
  end_date: string;
  location: string | null;
  status: string;
  club_id: string;
  entry_open_date: string | null;
  entry_close_date: string | null;
  pre_entry_fee: number | null;
  day_of_show_fee: number | null;
  accept_check_payments: boolean | null;
  accept_cash_payments: boolean | null;
}

export interface TrialRpcPayload {
  id: string;
  name: string;
  date: string;
  trial_number: string | null;
  status: string;
  trial_type: string | null;
  planned_start_time: string | null;
  event_number: string | null;
  display_order: number | null;
  category: string | null;
}

export interface ClassRpcPayload {
  id: string;
  trial_id: string;
  name: string;
  level: string | null;
  element: string | null;
  section: string | null;
  entry_fee: number | null;
  max_entries: number | null;
  status: string;
  start_time: string | null;
  timer_mode: string | null;
  hides_known: boolean | null;
  distraction_count: number | null;
  num_areas: number | null;
  time_limit_seconds: number | null;
}

export interface CreateShowRpcInput {
  p_show: ShowRpcPayload;
  p_trials: TrialRpcPayload[];
  p_classes: ClassRpcPayload[];
  p_judge_ids: string[];
}

export interface CreateShowPayloadResult {
  rpcInput: CreateShowRpcInput;
  localEntities: {
    show: ReplicatedShow;
    trials: ReplicatedTrial[];
    classes: ReplicatedClass[];
  };
  showId: string;
  trialIdMap: Record<string, string>;
}

// ── Status mapping (mirrors ReplicatedShowsTable.mapShowStatusToDb) ───────────

function mapShowStatus(status: string): string {
  switch (status) {
    case 'published':
      return 'published';
    case 'accepting_entries':
      return 'accepting_entries';
    case 'closed':
      return 'closed';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'unpublished':
    case 'draft':
    default:
      return 'draft';
  }
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Pure function: transform wizard state into the payload for the
 * create_show_with_children RPC plus the local IndexedDB entities to write
 * after the RPC succeeds (with _syncStatus: 'synced' so no re-upload is queued).
 *
 * Only valid for new shows (no edit mode). The ruleMap must be pre-fetched
 * by the caller so this function stays synchronous and easily testable.
 */
export function buildCreateShowPayload(
  show: WizardShowData,
  trials: WizardTrial[],
  judgeDetails: JudgeDetailsMap,
  ruleMap: Map<string, SportClassRuleRow>,
  status: string
): CreateShowPayloadResult {
  const showId = crypto.randomUUID();
  const dbStatus = mapShowStatus(status);

  // Build trial payloads and wizard-ID → real-UUID mapping
  const trialIdMap: Record<string, string> = {};
  const trialPayloads: TrialRpcPayload[] = trials.map((wizardTrial, index) => {
    const trialId = crypto.randomUUID();
    trialIdMap[wizardTrial.id] = trialId;
    const trialName = wizardTrial.name || `Trial ${index + 1}`;
    return {
      id: trialId,
      name: trialName,
      date: wizardTrial.dateTime
        ? new Date(wizardTrial.dateTime).toISOString().split('T')[0]!
        : new Date().toISOString().split('T')[0]!,
      trial_number: trialName,
      status: 'upcoming',
      trial_type: wizardTrial.trialType || show.organization || null,
      planned_start_time: wizardTrial.dateTime
        ? format(new Date(wizardTrial.dateTime), 'h:mm a')
        : '09:00 AM',
      event_number: wizardTrial.eventNumber || null,
      display_order: index + 1,
      category: trialName,
    };
  });

  // Build class payloads via the shared createClassDataFromWizard transformer.
  // Pass empty existingTrials + no editMode so all classes are created fresh.
  const allClassData = createClassDataFromWizard(
    trials,
    trialIdMap,
    judgeDetails,
    showId,
    [],
    undefined
  );

  const classPayloads: ClassRpcPayload[] = allClassData.map(cls => {
    const rule = cls.templateId
      ? ruleMap.get(`${cls.templateId}|${cls.element ?? ''}|${cls.level ?? ''}`)
      : undefined;
    return {
      id: cls.id || crypto.randomUUID(),
      trial_id: cls.trialId,
      name: cls.className || cls.element || 'Class',
      level: cls.level || null,
      element: cls.element || null,
      section: cls.section || null,
      entry_fee: cls.preEntryFee ?? cls.entryFee ?? null,
      max_entries: cls.maxEntries ?? null,
      status: 'upcoming',
      start_time: cls.startTime || null,
      timer_mode: rule?.timer_mode ?? null,
      hides_known: rule?.hides_known ?? null,
      distraction_count: rule?.distraction_count_min ?? null,
      num_areas: rule?.area_count ?? null,
      time_limit_seconds: rule?.max_time_seconds_fixed ?? null,
    };
  });

  // Local entities for IndexedDB writes after RPC success.
  // _syncStatus: 'synced' + _localOnly: false → no mutation queued on set().
  const localShow: ReplicatedShow = {
    id: showId,
    name: show.name,
    organization: show.organization,
    startDate: show.startDate,
    endDate: show.endDate,
    location: show.location || undefined,
    status: dbStatus,
    clubId: show.clubId,
    entryOpenDate: show.entryOpenDate || undefined,
    entryCloseDate: show.entryCloseDate || undefined,
    preEntryFee: show.preEntryFee || undefined,
    dayOfShowFee: show.dayOfShowFee || undefined,
    acceptCheckPayments: show.acceptCheckPayments,
    acceptCashPayments: show.acceptCashPayments,
    _version: 1,
    _lastModified: new Date(),
    _syncStatus: 'synced',
    _localOnly: false,
  };

  const localTrials: ReplicatedTrial[] = trialPayloads.map(t => ({
    id: t.id,
    showId,
    name: t.name,
    date: t.date,
    trialNumber: t.trial_number || undefined,
    status: t.status,
    trialType: t.trial_type || undefined,
    plannedStartTime: t.planned_start_time || undefined,
    eventNumber: t.event_number || undefined,
    displayOrder: t.display_order || undefined,
    category: t.category || undefined,
    _version: 1,
    _lastModified: new Date(),
    _syncStatus: 'synced',
    _localOnly: false,
  }));

  const localClasses: ReplicatedClass[] = classPayloads.map(c => ({
    id: c.id,
    trialId: c.trial_id,
    trial_id: c.trial_id,
    name: c.name,
    level: c.level || undefined,
    element: c.element || undefined,
    section: c.section || undefined,
    entryFee: c.entry_fee ?? undefined,
    maxEntries: c.max_entries ?? undefined,
    classStatus: c.status,
    startTime: c.start_time || undefined,
    timerMode: c.timer_mode || undefined,
    hidesKnown: c.hides_known ?? undefined,
    distractionCount: c.distraction_count ?? undefined,
    areaCount: c.num_areas ?? undefined,
    timeLimitSeconds: c.time_limit_seconds ?? undefined,
    _version: 1,
    _lastModified: new Date(),
    _syncStatus: 'synced',
    _localOnly: false,
  }));

  return {
    rpcInput: {
      p_show: {
        id: showId,
        name: show.name,
        organization: show.organization,
        start_date: show.startDate,
        end_date: show.endDate,
        location: show.location || null,
        status: dbStatus,
        club_id: show.clubId,
        entry_open_date: show.entryOpenDate || null,
        entry_close_date: show.entryCloseDate || null,
        pre_entry_fee: show.preEntryFee || null,
        day_of_show_fee: show.dayOfShowFee || null,
        accept_check_payments: show.acceptCheckPayments,
        accept_cash_payments: show.acceptCashPayments,
      },
      p_trials: trialPayloads,
      p_classes: classPayloads,
      p_judge_ids: show.judgeIds,
    },
    localEntities: { show: localShow, trials: localTrials, classes: localClasses },
    showId,
    trialIdMap,
  };
}
```

---

## Task 4 — Write unit tests for buildCreateShowPayload

**Files:**
- Create: `apps/myk9show/src/pages/secretary/ShowCreationWizard/__tests__/buildCreateShowPayload.test.ts`

- [ ] **Step 1: Run the test file first to confirm it fails (TDD red)**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/ShowCreationWizard/__tests__/buildCreateShowPayload.test.ts 2>&1 | head -10`
Expected: Error about missing module — confirms tests are red before implementation.

- [ ] **Step 2: Write the test file**

Create `apps/myk9show/src/pages/secretary/ShowCreationWizard/__tests__/buildCreateShowPayload.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildCreateShowPayload } from '../buildCreateShowPayload';
import type { WizardShowData, WizardTrial } from '../showCreationWizardTransformers';
import type { SportClassRuleRow } from '@/types/sport-template-types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const baseShow: WizardShowData = {
  name: 'Spring Scent Work',
  organization: 'AKC',
  startDate: '2026-06-01',
  endDate: '2026-06-02',
  location: 'Roseville, CA',
  clubId: 'aaaaaaaa-0000-4000-8000-000000000001',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-05-15',
  preEntryFee: 30,
  dayOfShowFee: 35,
  startingArmbandNumber: 100,
  officials: { secretary: ['sec-uuid'], chairman: [], steward: [] },
  judgeIds: ['judge-uuid-a', 'judge-uuid-b'],
  acceptCheckPayments: true,
  acceptCashPayments: false,
};

const baseTrial: WizardTrial = {
  id: 'wizard-trial-1',
  name: 'Saturday Trial',
  dateTime: '2026-06-01T09:00:00',
  eventNumber: 'EVT-001',
  trialType: 'Scent Work',
  classes: [],
};

function makeRuleMap(
  key: string,
  rule: Partial<SportClassRuleRow>
): Map<string, SportClassRuleRow> {
  return new Map([[key, rule as SportClassRuleRow]]);
}

describe('buildCreateShowPayload', () => {
  it('generates a unique show UUID on each call', () => {
    const r1 = buildCreateShowPayload(baseShow, [], {}, new Map(), 'unpublished');
    const r2 = buildCreateShowPayload(baseShow, [], {}, new Map(), 'unpublished');
    expect(r1.showId).not.toBe(r2.showId);
    expect(r1.showId).toMatch(UUID_PATTERN);
  });

  it('maps "unpublished" status to "draft" in rpcInput', () => {
    const { rpcInput } = buildCreateShowPayload(baseShow, [], {}, new Map(), 'unpublished');
    expect(rpcInput.p_show.status).toBe('draft');
  });

  it('maps "draft" status to "draft" in rpcInput', () => {
    const { rpcInput } = buildCreateShowPayload(baseShow, [], {}, new Map(), 'draft');
    expect(rpcInput.p_show.status).toBe('draft');
  });

  it('maps "published" status to "published" in rpcInput', () => {
    const { rpcInput } = buildCreateShowPayload(baseShow, [], {}, new Map(), 'published');
    expect(rpcInput.p_show.status).toBe('published');
  });

  it('passes judgeIds straight through to p_judge_ids', () => {
    const { rpcInput } = buildCreateShowPayload(baseShow, [], {}, new Map(), 'unpublished');
    expect(rpcInput.p_judge_ids).toEqual(['judge-uuid-a', 'judge-uuid-b']);
  });

  it('generates a UUID for each trial and maps wizard IDs in trialIdMap', () => {
    const { rpcInput, trialIdMap } = buildCreateShowPayload(
      baseShow,
      [baseTrial],
      {},
      new Map(),
      'unpublished'
    );
    expect(rpcInput.p_trials).toHaveLength(1);
    const trialId = rpcInput.p_trials[0]!.id;
    expect(trialId).toMatch(UUID_PATTERN);
    expect(trialIdMap['wizard-trial-1']).toBe(trialId);
  });

  it('sets trial status to "upcoming"', () => {
    const { rpcInput } = buildCreateShowPayload(
      baseShow,
      [baseTrial],
      {},
      new Map(),
      'unpublished'
    );
    expect(rpcInput.p_trials[0]!.status).toBe('upcoming');
  });

  it('localEntities.show has _syncStatus synced and _localOnly false', () => {
    const { localEntities } = buildCreateShowPayload(baseShow, [], {}, new Map(), 'unpublished');
    expect(localEntities.show._syncStatus).toBe('synced');
    expect(localEntities.show._localOnly).toBe(false);
  });

  it('localEntities.trials have _syncStatus synced and _localOnly false', () => {
    const { localEntities } = buildCreateShowPayload(
      baseShow,
      [baseTrial],
      {},
      new Map(),
      'unpublished'
    );
    expect(localEntities.trials[0]!._syncStatus).toBe('synced');
    expect(localEntities.trials[0]!._localOnly).toBe(false);
  });

  it('class trial_id matches the real UUID from trialIdMap', () => {
    const trialWithClass: WizardTrial = {
      ...baseTrial,
      classes: [
        {
          templateId: 'tmpl-1',
          customizations: {
            element: 'Container',
            level: 'Novice',
            className: 'NW1 Containers',
          },
          judgeId: 'judge-uuid-a',
        },
      ],
    };
    const { rpcInput, trialIdMap } = buildCreateShowPayload(
      baseShow,
      [trialWithClass],
      { 'judge-uuid-a': { name: 'Jane Smith', email: '', phone: '' } },
      new Map(),
      'unpublished'
    );
    expect(rpcInput.p_classes).toHaveLength(1);
    expect(rpcInput.p_classes[0]!.trial_id).toBe(trialIdMap['wizard-trial-1']);
  });

  it('bakes timer_mode, hides_known, distraction_count, num_areas, time_limit_seconds from ruleMap', () => {
    const trialWithClass: WizardTrial = {
      ...baseTrial,
      classes: [
        {
          templateId: 'tmpl-1',
          customizations: { element: 'Container', level: 'Novice', className: 'NW1 Containers' },
        },
      ],
    };
    const ruleMap = makeRuleMap('tmpl-1|Container|Novice', {
      timer_mode: 'stop',
      hides_known: true,
      distraction_count_min: 2,
      area_count: 1,
      max_time_seconds_fixed: 180,
    });
    const { rpcInput } = buildCreateShowPayload(
      baseShow,
      [trialWithClass],
      {},
      ruleMap,
      'unpublished'
    );
    const cls = rpcInput.p_classes[0]!;
    expect(cls.timer_mode).toBe('stop');
    expect(cls.hides_known).toBe(true);
    expect(cls.distraction_count).toBe(2);
    expect(cls.num_areas).toBe(1);
    expect(cls.time_limit_seconds).toBe(180);
  });

  it('uses null for rule fields when ruleMap has no matching entry', () => {
    const trialWithClass: WizardTrial = {
      ...baseTrial,
      classes: [
        {
          templateId: 'tmpl-unknown',
          customizations: { element: 'Container', level: 'Novice', className: 'NW1' },
        },
      ],
    };
    const { rpcInput } = buildCreateShowPayload(
      baseShow,
      [trialWithClass],
      {},
      new Map(),
      'unpublished'
    );
    const cls = rpcInput.p_classes[0]!;
    expect(cls.timer_mode).toBeNull();
    expect(cls.hides_known).toBeNull();
    expect(cls.distraction_count).toBeNull();
  });

  it('produces an empty p_trials and p_classes array when no trials are passed', () => {
    const { rpcInput } = buildCreateShowPayload(baseShow, [], {}, new Map(), 'unpublished');
    expect(rpcInput.p_trials).toHaveLength(0);
    expect(rpcInput.p_classes).toHaveLength(0);
  });

  it('localEntities.classes have _syncStatus synced', () => {
    const trialWithClass: WizardTrial = {
      ...baseTrial,
      classes: [
        {
          templateId: 'tmpl-1',
          customizations: { element: 'Container', level: 'Novice', className: 'NW1' },
        },
      ],
    };
    const { localEntities } = buildCreateShowPayload(
      baseShow,
      [trialWithClass],
      {},
      new Map(),
      'unpublished'
    );
    expect(localEntities.classes[0]!._syncStatus).toBe('synced');
  });
});
```

- [ ] **Step 3: Run the tests — expect all to pass**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/ShowCreationWizard/__tests__/buildCreateShowPayload.test.ts`
Expected: 12 tests pass.

- [ ] **Step 4: Run existing wizard tests for regression**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/ShowCreationWizard/__tests__/verifyShowCreatedOnServer.test.ts`
Expected: 3 tests pass.

---

## Task 5 — Extract saveShowAtomicOnline helper and wire it in

**Files:**
- Create: `apps/myk9show/src/pages/secretary/ShowCreationWizard/saveShowAtomicOnline.ts`
- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`

### [EXPANDED] Why a separate helper

`useShowCreationWizardActions.ts` is already 506 lines. Per CLAUDE.md's "keep files under 500 lines" rule, we extract the RPC branch into a sibling helper. The hook retains the orchestration (state, navigation, error handling); the helper owns the RPC call + IndexedDB seeding + React Query seeding.

### What changes

1. Create `saveShowAtomicOnline.ts` with a function `saveShowAtomicOnline(args)` that: pre-fetches rules, calls `buildCreateShowPayload`, invokes `supabase.rpc`, seeds IndexedDB (with try/catch fallback), seeds React Query, fires official grants. Returns `{ showId, savedShow }`.
2. In `saveShow`, add an **early-exit RPC path** before the existing `addShow` call: when `!editMode?.showId && isOnline`, call `saveShowAtomicOnline(...)`, then handle navigation / notifications / wizard-reset using the returned data.
3. The **existing code path** (the `addShow`/`updateShow` multi-step logic) is kept **entirely intact** for offline and edit-mode scenarios — only the initial `if (!editMode?.showId && isOnline)` block that called `triggerSync` + `verifyShowCreatedOnServer` is removed (it becomes dead code in the fallback path since that block only ever ran when `!editMode?.showId && isOnline`, which is now handled by the RPC path).

### [EXPANDED] Post-RPC IndexedDB failure handling

After the RPC succeeds, the show + trials + classes are guaranteed to be in Postgres. The local IndexedDB `set()` writes are best-effort cache-warming. Wrap them in try/catch; on failure, log a warning and call `triggerSync()` so the replication layer pulls the rows from Postgres on its next cycle. Do **not** surface a user-facing error — the show exists server-side, the user's next navigation will fetch it.

### [EXPANDED] Club address shape

`useClubStore().clubs` returns `Club[]` (from `@/types/club-types`), **not** `ReplicatedClub[]`. The `ClubStore` adapter converts between them. `Club.address` is a structured `ClubAddress` object (`street/city/state/zipCode/country`). Denormalize by joining parts with ", " — matches the existing `transformWizardDataToShow` behavior.

### Dependencies to add to the `saveShow` useCallback dep array

`saveShowAtomicOnline` is a module-level import (not a hook), so no new entries needed. The `clubs` ref is already in scope via the existing closure.

- [ ] **Step 1: Create the saveShowAtomicOnline helper**

Create `apps/myk9show/src/pages/secretary/ShowCreationWizard/saveShowAtomicOnline.ts`:

```typescript
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabase';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { useShowStore } from '@/store/useShowStore';
import { showQueryKeys } from '@/hooks/queries/useShowsQuery';
import { fetchClassRulesForTemplate } from '@/services/sport-template-service';
import { logger } from '@/services/logger';
import { UserRole } from '@/types/user-types';
import type { Show } from '@/types/show-types';
import type { ReplicatedClub } from '@/services/replication/ReplicatedClubsTable';
import type { SportClassRuleRow } from '@/types/sport-template-types';
import type { JudgeDetailsMap } from './show-creation-wizard-types';
import { buildCreateShowPayload } from './buildCreateShowPayload';
import type { WizardShowData, WizardTrial } from './showCreationWizardTransformers';

export interface SaveShowAtomicOnlineArgs {
  show: WizardShowData;
  trials: WizardTrial[];
  judgeDetails: JudgeDetailsMap;
  clubs: ReplicatedClub[];
  status: string;
  queryClient: QueryClient;
  triggerSync: () => Promise<void>;
}

export interface SaveShowAtomicOnlineResult {
  showId: string;
  savedShow: Show;
  officialGrantsPromise: Promise<void>;
}

/**
 * Online new-show path: atomic RPC create_show_with_children + local cache seed.
 * Throws on RPC failure (caller handles toast + rollback via `throw`).
 * Post-RPC IndexedDB writes are best-effort — failures trigger a sync instead
 * of surfacing to the user, because the show already exists server-side.
 */
export async function saveShowAtomicOnline(
  args: SaveShowAtomicOnlineArgs
): Promise<SaveShowAtomicOnlineResult> {
  const { show, trials, judgeDetails, clubs, status, queryClient, triggerSync } = args;

  // Pre-fetch sport_class_rules so rule fields bake into class rows at creation time.
  const ruleMap = new Map<string, SportClassRuleRow>();
  const templateIds = new Set(
    trials.flatMap(t => t.classes.map(c => c.templateId)).filter(Boolean)
  );
  await Promise.all(
    [...templateIds].map(async templateId => {
      try {
        const rules = await fetchClassRulesForTemplate(templateId);
        for (const rule of rules) {
          const key = `${templateId}|${rule.element}|${rule.level ?? ''}`;
          ruleMap.set(key, rule);
        }
      } catch (err) {
        logger.warn('Failed to fetch rules for template', 'wizard', {
          templateId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })
  );

  const { rpcInput, localEntities, showId } = buildCreateShowPayload(
    show,
    trials,
    judgeDetails,
    ruleMap,
    status
  );

  // Atomic RPC: any failure rolls back show + trials + classes + judge_assignments.
  const { error: rpcError } = await supabase.rpc(
    'create_show_with_children',
    rpcInput as unknown as Record<string, unknown>
  );
  if (rpcError) {
    throw new Error(rpcError.message);
  }

  // Seed local IndexedDB as already-synced (best-effort). Failure here does
  // NOT fail the user action — the rows are in Postgres; a sync will pull them.
  try {
    await replicatedShowsTable.set(showId, localEntities.show, false);
    await Promise.all(
      localEntities.trials.map(t => replicatedTrialsTable.set(t.id, t, false))
    );
    await Promise.all(
      localEntities.classes.map(c => replicatedClassesTable.set(c.id, c, false))
    );
  } catch (cacheError) {
    logger.warn('Post-RPC IndexedDB seed failed — triggering sync', 'wizard', {
      showId,
      error: cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
    triggerSync().catch(() => {
      /* best-effort */
    });
  }

  // Denormalize club for the Show object (matches existing non-RPC shape).
  const selectedClub = clubs.find(c => c.id === show.clubId);
  const savedShow: Show = {
    ...localEntities.show,
    events: [],
    source: 'myK9Show' as const,
    clubName: selectedClub?.name || '',
    clubAddress: selectedClub?.address || '',
    clubEmail: selectedClub?.email || '',
    logoUrl: selectedClub?.logoUrl || '',
    coverImageUrl: '',
    accentColor: '',
    assignedJudges: show.judgeIds.map(judgeId => ({
      judgeId,
      judgeName: judgeDetails[judgeId]?.name || 'Unknown Judge',
      assignedDate: new Date().toISOString().split('T')[0]!,
    })),
    trials: [],
    stats: [],
  } as Show;

  // Immediate Zustand update (subscription will also fire asynchronously).
  useShowStore.getState().addShowLegacy(savedShow);

  queryClient.setQueryData<Show>(showQueryKeys.detail(showId), savedShow);
  queryClient.setQueryData<Show[]>(showQueryKeys.lists(), old => {
    if (!old) return [savedShow];
    return old.some(s => s.id === showId)
      ? old.map(s => (s.id === showId ? savedShow : s))
      : [savedShow, ...old];
  });

  // Fire-and-forget official role grants.
  const officialGrants = [
    ...show.officials.secretary.map(id => ({ id, role: UserRole.SECRETARY })),
    ...show.officials.chairman.map(id => ({ id, role: UserRole.CHAIRMAN })),
    ...show.officials.steward.map(id => ({ id, role: UserRole.STEWARD })),
  ];
  const officialGrantsPromise = Promise.allSettled(
    officialGrants.map(async grant => {
      const { error } = await supabase.rpc('grant_show_official', {
        p_person_id: grant.id,
        p_role_name: grant.role,
        p_show_id: showId,
      });
      if (error) throw error;
    })
  ).then(results => {
    const failures = results.filter(r => r.status === 'rejected');
    failures.forEach(r => {
      const err = (r as PromiseRejectedResult).reason;
      logger.warn('Failed to auto-grant official role', 'wizard', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    queryClient.invalidateQueries({ queryKey: ['shows', showId, 'officials'] });
  });

  queryClient.invalidateQueries({ queryKey: ['shows', showId, 'schedule-timeline'] });

  return { showId, savedShow, officialGrantsPromise };
}
```

- [ ] **Step 2: Add the import to the hook**

In `useShowCreationWizardActions.ts`, add with the existing local imports:

```typescript
import { saveShowAtomicOnline } from './saveShowAtomicOnline';
```

No other new imports are needed (the helper owns `replicatedTrialsTable`, `replicatedShowsTable`, `buildCreateShowPayload`, etc.).

- [ ] **Step 3: Replace the saveShow useCallback with the new version**

Find the entire `const saveShow = useCallback(` block (lines ~273–461) and replace with:

```typescript
const saveShow = useCallback(
  async (status: ShowStatus, shouldResetWizard: boolean) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    try {
      setIsLoading(true);

      // ── Online new-show path: atomic RPC via saveShowAtomicOnline helper ──
      if (!editMode?.showId && isOnline) {
        const { showId: realShowId, savedShow } = await saveShowAtomicOnline({
          show,
          trials,
          judgeDetails,
          clubs,
          status,
          queryClient,
          triggerSync,
        });

        loadTrialClasses().catch(() => {
          /* non-critical */
        });

        if (status === 'draft') {
          saveProgress();
        } else if (shouldResetWizard) {
          resetWizard();
        }

        if (status === 'draft') {
          navigate(`/shows/${realShowId}`);
        } else if (onCreatedRef.current) {
          onCreatedRef.current(realShowId, savedShow.name);
        } else {
          navigate('/secretary/dashboard');
        }

        if (status === 'draft') {
          notifications.success(`"${savedShow.name}" saved as draft`);
        } else if (!onCreatedRef.current) {
          notifications.success(`"${savedShow.name}" created successfully`);
        }

        logger.info(`Show saved successfully (${status}) via RPC`, 'wizard', {
          showId: realShowId,
          showName: savedShow.name,
        });
        return;
      }

      // ── Offline path or edit mode: existing multi-step logic ─────────────
      const wizardShow = transformWizardDataToShow(show, trials, judgeDetails, clubs, status, editMode);

      let savedShow: Show;
      if (editMode?.showId) {
        const updated = await updateShow(editMode.showId, showToShowInput(wizardShow));
        savedShow = updated || wizardShow;
      } else {
        savedShow = await addShow(showToShowInput(wizardShow));
      }

      const realShowId = savedShow.id;

      queryClient.setQueryData<Show>(showQueryKeys.detail(realShowId), savedShow);
      queryClient.setQueryData<Show[]>(showQueryKeys.lists(), old => {
        if (!old) return [savedShow];
        const exists = old.some(s => s.id === realShowId);
        return exists ? old.map(s => (s.id === realShowId ? savedShow : s)) : [savedShow, ...old];
      });

      const trialIdMap = await createTrials(realShowId, savedShow.name, savedShow.organization);
      await createClasses(realShowId, trialIdMap);

      const judges = wizardShow.assignedJudges || [];
      if (judges.length > 0) {
        try {
          await persistShowJudgeAssignments(realShowId, judges, {
            skipDelete: !editMode?.showId,
          });
        } catch (judgeError) {
          logger.warn('Failed to persist judge assignments', 'wizard', {
            error: judgeError instanceof Error ? judgeError.message : String(judgeError),
          });
        }
      }

      const officialGrants = [
        ...show.officials.secretary.map(id => ({ id, role: UserRole.SECRETARY })),
        ...show.officials.chairman.map(id => ({ id, role: UserRole.CHAIRMAN })),
        ...show.officials.steward.map(id => ({ id, role: UserRole.STEWARD })),
      ];
      Promise.allSettled(
        officialGrants.map(async grant => {
          const { error } = await supabase.rpc('grant_show_official', {
            p_person_id: grant.id,
            p_role_name: grant.role,
            p_show_id: realShowId,
          });
          if (error) throw error;
        })
      ).then(results => {
        const failures = results.filter(r => r.status === 'rejected');
        failures.forEach(r => {
          const err = (r as PromiseRejectedResult).reason;
          logger.warn('Failed to auto-grant official role', 'wizard', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
        if (failures.length > 0) {
          notifications.warning(
            `Show created, but ${failures.length} official role ${failures.length === 1 ? 'grant' : 'grants'} failed. Check console for details.`
          );
        }
        queryClient.invalidateQueries({ queryKey: ['shows', realShowId, 'officials'] });
      });

      triggerSync().catch(syncError => {
        logger.warn('Post-create child sync failed', 'wizard', {
          error: syncError instanceof Error ? syncError.message : String(syncError),
        });
      });

      loadTrialClasses().catch(() => {
        /* non-critical */
      });

      queryClient.invalidateQueries({ queryKey: ['shows', realShowId, 'schedule-timeline'] });

      if (status === 'draft') {
        saveProgress();
      } else if (shouldResetWizard) {
        resetWizard();
      }

      if (status === 'draft') {
        navigate(`/shows/${realShowId}`);
      } else if (onCreatedRef.current) {
        onCreatedRef.current(realShowId, savedShow.name);
      } else {
        navigate('/secretary/dashboard');
      }

      if (status === 'draft') {
        notifications.success(`"${savedShow.name}" saved as draft`);
      } else if (!onCreatedRef.current) {
        notifications.success(`"${savedShow.name}" created successfully`);
      }

      logger.info(`Show saved successfully (${status})`, 'wizard', {
        showId: realShowId,
        showName: savedShow.name,
      });
    } catch (error) {
      logger.error('Error saving show', 'wizard', {}, error as Error);
      notifications.error(
        error instanceof Error
          ? `Failed to create show: ${error.message}`
          : 'Failed to create show. Please try again.'
      );
    } finally {
      setIsLoading(false);
      isSavingRef.current = false;
    }
  },
  [
    show,
    trials,
    judgeDetails,
    clubs,
    editMode,
    addShow,
    updateShow,
    createTrials,
    createClasses,
    saveProgress,
    resetWizard,
    navigate,
    queryClient,
    triggerSync,
    isOnline,
    setIsLoading,
    loadTrialClasses,
  ]
);
```

**Note on `clubs` type**: `ReplicatedClub.address` is a flat `string | undefined`. The helper uses `selectedClub?.address || ''` — do not introduce `.street` / `.city` accessors.

---

## Task 5b — Integration test for saveShowAtomicOnline [ADDED]

**Files:**
- Create: `apps/myk9show/src/pages/secretary/ShowCreationWizard/__tests__/saveShowAtomicOnline.test.ts`

This is a lightweight integration test that mocks the Supabase client and replication tables. It verifies:
- The RPC is called with exactly the shape produced by `buildCreateShowPayload`.
- All three `set(id, data, false)` calls (shows/trials/classes) fire after a successful RPC.
- An RPC error is rethrown (caller handles the toast).
- An IndexedDB failure after a successful RPC does **not** throw (best-effort cache).

- [ ] **Step 1: Write the integration test**

Create the test file:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveShowAtomicOnline } from '../saveShowAtomicOnline';
import type { WizardShowData, WizardTrial } from '../showCreationWizardTransformers';

// Mock all Supabase + replication modules before import.
const rpcMock = vi.fn();
vi.mock('@/services/database/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const showsSetMock = vi.fn();
const trialsSetMock = vi.fn();
const classesSetMock = vi.fn();
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { set: (...a: unknown[]) => showsSetMock(...a) },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { set: (...a: unknown[]) => trialsSetMock(...a) },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { set: (...a: unknown[]) => classesSetMock(...a) },
}));

vi.mock('@/services/sport-template-service', () => ({
  fetchClassRulesForTemplate: vi.fn().mockResolvedValue([]),
}));

const addShowLegacyMock = vi.fn();
vi.mock('@/store/useShowStore', () => ({
  useShowStore: { getState: () => ({ addShowLegacy: addShowLegacyMock }) },
}));

vi.mock('@/hooks/queries/useShowsQuery', () => ({
  showQueryKeys: {
    detail: (id: string) => ['shows', id],
    lists: () => ['shows', 'list'],
  },
}));

vi.mock('@/services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const baseShow: WizardShowData = {
  name: 'Test Show',
  organization: 'AKC',
  startDate: '2026-06-01',
  endDate: '2026-06-02',
  location: 'Somewhere',
  clubId: 'aaaaaaaa-0000-4000-8000-000000000001',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-05-15',
  preEntryFee: 30,
  dayOfShowFee: 35,
  startingArmbandNumber: 100,
  officials: { secretary: [], chairman: [], steward: [] },
  judgeIds: [],
  acceptCheckPayments: true,
  acceptCashPayments: false,
};

const baseTrials: WizardTrial[] = [];

function makeQueryClient() {
  return {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  } as unknown as import('@tanstack/react-query').QueryClient;
}

describe('saveShowAtomicOnline', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    showsSetMock.mockReset();
    trialsSetMock.mockReset();
    classesSetMock.mockReset();
    addShowLegacyMock.mockReset();
  });

  it('calls supabase.rpc with create_show_with_children and the built payload', async () => {
    rpcMock.mockResolvedValue({ error: null });
    const qc = makeQueryClient();

    await saveShowAtomicOnline({
      show: baseShow,
      trials: baseTrials,
      judgeDetails: {},
      clubs: [],
      status: 'unpublished',
      queryClient: qc,
      triggerSync: vi.fn().mockResolvedValue(undefined),
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'create_show_with_children',
      expect.objectContaining({
        p_show: expect.objectContaining({
          name: 'Test Show',
          club_id: baseShow.clubId,
          status: 'draft',
        }),
        p_trials: [],
        p_classes: [],
        p_judge_ids: [],
      })
    );
  });

  it('seeds IndexedDB with set(id, data, false) after a successful RPC', async () => {
    rpcMock.mockResolvedValue({ error: null });

    await saveShowAtomicOnline({
      show: baseShow,
      trials: baseTrials,
      judgeDetails: {},
      clubs: [],
      status: 'unpublished',
      queryClient: makeQueryClient(),
      triggerSync: vi.fn().mockResolvedValue(undefined),
    });

    expect(showsSetMock).toHaveBeenCalledTimes(1);
    expect(showsSetMock.mock.calls[0]![2]).toBe(false);
  });

  it('rethrows RPC errors so the caller can surface them', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'boom' } });

    await expect(
      saveShowAtomicOnline({
        show: baseShow,
        trials: baseTrials,
        judgeDetails: {},
        clubs: [],
        status: 'unpublished',
        queryClient: makeQueryClient(),
        triggerSync: vi.fn().mockResolvedValue(undefined),
      })
    ).rejects.toThrow('boom');

    expect(showsSetMock).not.toHaveBeenCalled();
  });

  it('does not throw when IndexedDB seeding fails after a successful RPC', async () => {
    rpcMock.mockResolvedValue({ error: null });
    showsSetMock.mockRejectedValueOnce(new Error('indexeddb-down'));
    const triggerSync = vi.fn().mockResolvedValue(undefined);

    await expect(
      saveShowAtomicOnline({
        show: baseShow,
        trials: baseTrials,
        judgeDetails: {},
        clubs: [],
        status: 'unpublished',
        queryClient: makeQueryClient(),
        triggerSync,
      })
    ).resolves.toBeDefined();

    expect(triggerSync).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/ShowCreationWizard/__tests__/saveShowAtomicOnline.test.ts`
Expected: 4 tests pass.

---

## Task 6 — Typecheck and test

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck 2>&1 | grep -E "error TS|ShowCreationWizard|buildCreate" | head -30`
Expected: Zero TypeScript errors in the files touched.

If errors appear, fix them before proceeding. Common issues:
- `clubs` type from `useClubStore()` — check actual type and adjust address access.
- `selectedClub.address` may be a string (not an object) in the club store — inspect `ReplicatedClub` and adapt accordingly.
- `show.preEntryFee || null` — `preEntryFee` is `number`, so use `show.preEntryFee !== 0 ? show.preEntryFee : null` or just `show.preEntryFee`.

- [ ] **Step 2: Run all wizard tests**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/ShowCreationWizard/`
Expected: All tests pass (buildCreateShowPayload × 12, verifyShowCreatedOnServer × 3).

- [ ] **Step 3: Run full myk9show test suite**

Run: `cd apps/myk9show && pnpm test 2>&1 | tail -20`
Expected: All tests pass or only pre-existing failures.

---

## Task 7 — Push migration (requires confirmation)

> **Auto mode note:** This pushes to the shared staging database. Per CLAUDE.md Auto Mode rules, pause and confirm before running `supabase db push`.

- [ ] **Step 1: Check current migration state**

Run: `supabase migration list 2>&1 | tail -10`
Confirm migration 144 is the last applied migration.

- [ ] **Step 2: Confirm with user, then push**

After user confirms:
```bash
supabase db push --password "$(grep -E '^DB_PASSWORD' supabase/.env | cut -d= -f2)"
```
Expected output includes: `Applying migration 145_create_show_with_children_rpc.sql`

- [ ] **Step 3 [ADDED]: Verify the function exists remotely**

```bash
supabase db execute --password "$(grep -E '^DB_PASSWORD' supabase/.env | cut -d= -f2)" \
  "SELECT proname FROM pg_proc WHERE proname = 'create_show_with_children';"
```
Expected: one row returned.

---

## Task 7.5 — Post-deploy smoke test [ADDED]

- [ ] **Step 1: Create a show via the UI**

On `localhost:5173` logged in as a trial secretary:
1. Open the Show Creation Wizard.
2. Fill the minimum required fields, add one trial with one class, pick a judge.
3. Publish.

- [ ] **Step 2: Verify all four tables populated**

Either via the UI's Show detail page (show name, trial card, class row, judge chip all visible) or via `supabase db execute`:
```sql
SELECT
  (SELECT COUNT(*) FROM shows WHERE id = '<show_id>') AS show_rows,
  (SELECT COUNT(*) FROM trials WHERE show_id = '<show_id>') AS trial_rows,
  (SELECT COUNT(*) FROM classes WHERE trial_id IN (SELECT id FROM trials WHERE show_id = '<show_id>')) AS class_rows,
  (SELECT COUNT(*) FROM judge_assignments WHERE show_id = '<show_id>') AS judge_rows;
```
Expected: `show_rows = 1`, `trial_rows ≥ 1`, `class_rows ≥ 1`, `judge_rows ≥ 1`.

- [ ] **Step 3: Clean up the test show**

Delete via the UI's Show Settings > Delete (cascades), or `DELETE FROM shows WHERE id = '<show_id>';` if RLS allows.

---

## Task 8 — Commit

- [ ] **Step 1: Stage and commit**

```bash
git add \
  supabase/migrations/145_create_show_with_children_rpc.sql \
  apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardTransformers.ts \
  apps/myk9show/src/pages/secretary/ShowCreationWizard/buildCreateShowPayload.ts \
  "apps/myk9show/src/pages/secretary/ShowCreationWizard/__tests__/buildCreateShowPayload.test.ts" \
  apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts
```

Commit message:
```
fix(wizard): atomic show creation via create_show_with_children RPC

Harden finding #3 (high): saveShow previously wrote to shows, trials,
classes, and judge_assignments across multiple round-trips. A partial
failure left orphaned rows and a half-built show.

Migration 145 introduces a SECURITY DEFINER RPC that wraps all INSERTs
in a single PL/pgSQL transaction. The online new-show path in
useShowCreationWizardActions now calls this RPC and seeds the local
IndexedDB replication tables as already-synced rows (no re-upload
queued). The offline and edit-mode paths remain unchanged.
```

Also stage `saveShowAtomicOnline.ts` + its test file:

```bash
git add \
  apps/myk9show/src/pages/secretary/ShowCreationWizard/saveShowAtomicOnline.ts \
  "apps/myk9show/src/pages/secretary/ShowCreationWizard/__tests__/saveShowAtomicOnline.test.ts"
```

---

## Task 9 — `/simplify` review [ADDED]

- [ ] **Step 1: Run `/simplify`** over the diff and address any flagged items (unused imports, dead code, overly nested conditionals).

## Task 10 — Open PR [ADDED]

- [ ] **Step 1: Push the branch and create PR**

```bash
git push -u origin claude/cranky-lamarr-59b7cd
gh pr create --title "fix(wizard): atomic show creation via create_show_with_children RPC" --body "$(cat <<'EOF'
## Summary
- Adds `create_show_with_children` SECURITY DEFINER RPC (migration 145) that atomically inserts show + trials + classes + judge_assignments in one transaction. Fixes Harden finding #3 (high).
- Online new-show path in the wizard now calls the RPC and seeds IndexedDB as already-synced. Offline / edit-mode paths unchanged.

## Test plan
- [x] `buildCreateShowPayload` unit tests (12)
- [x] `saveShowAtomicOnline` integration tests (4)
- [x] `verifyShowCreatedOnServer` regression tests (3)
- [ ] Manual smoke: create show as trial secretary on localhost, verify all four tables populated
EOF
)"
```

## Task 11 — `/review` and fix [ADDED]

- [ ] **Step 1: Run `/review`** on the PR; address blocking findings in a follow-up commit on the same branch.

## Task 12 — Merge and `/cleanup` [ADDED]

- [ ] **Step 1: Merge from main worktree** (feedback_merge_from_main_worktree)

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
gh pr merge <PR_NUMBER> --squash --delete-branch
```

- [ ] **Step 2: Run `/cleanup`** to remove the worktree.

---

## Appendix A: Revert path [ADDED]

If migration 145 needs to be rolled back in staging:

```sql
DROP FUNCTION IF EXISTS public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]);
```

Front-end revert: the RPC branch lives behind `!editMode?.showId && isOnline`; deleting `saveShowAtomicOnline.ts` + its import + the RPC branch restores the prior multi-step behavior (the offline path is unchanged, so all existing code paths remain functional).

---

## Appendix B: Key gotchas

1. **`clubs` address shape**: `useClubStore().clubs` is `Club[]` (from `@/types/club-types`). `Club.address` is a structured `{street, city, state, zipCode, country}` object — denormalize by joining parts. Do NOT confuse with `ReplicatedClub.address` (flat string) — that's the IndexedDB row shape, not what the store exposes.

2. **JSONB boolean extraction**: Use `(v_class->'hides_known')::boolean` (single arrow → JSONB) rather than `(v_class->>'hides_known')::boolean` (double arrow → TEXT). Both work for the non-null case, but JSONB cast is more correct for boolean values.

3. **`num_areas` vs `area_count`**: The DB column is `num_areas` (as written by `ReplicatedClassesTable.toSupabaseRow()`). The `area_count` field in `ReplicatedClass` is a compatibility alias for reads. The RPC must INSERT into `num_areas`.

4. **`isDirty=false` guard**: `ReplicatedTable.set(id, data, false)` will skip writing if the row already exists **and** is dirty. For brand-new rows this guard never fires. If the wizard is somehow called twice, the second call will be a no-op — that's correct.

5. **`trialType` in `WizardTrial`**: The wizard store type includes `trialType?: string`, but the original `WizardTrial` interface didn't. Adding it to `WizardTrial` (Task 2) prevents a structural typing mismatch when passing `trials` from the hook to `buildCreateShowPayload`.
