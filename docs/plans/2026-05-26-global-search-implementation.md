# Global Search v1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the unified Cmd-K global search in myK9Show: server-side `search_global` RPC across six record types (dogs, people, shows, clubs, entries, classes), context-aware show scoping, AskQ launcher row, offline fallback, and platform-wide dog/people discovery for the secretary entry-creation workflow.

**Architecture:** Postgres-side: `pg_trgm` GIN trigram indexes on searchable columns, a `search_global` RPC (`SECURITY INVOKER` — relies on existing RLS), and two `SECURITY DEFINER` directory functions (`search_dogs_directory`, `search_people_directory`) that expose only whitelisted public-identifier columns for cross-scope discovery. Frontend-side: refactor [CommandPalette.tsx](../../apps/myk9show/src/components/common/CommandPalette.tsx) to drive a new `useGlobalSearch` hook (RPC + debounce + offline fallback), add an AskQ row that calls into the existing `useAskQPanelStore`, and add an `in_scope` affordance switch for dogs/people. Gated behind `globalSearchV2` in [src/config/features.ts](../../apps/myk9show/src/config/features.ts).

**Tech Stack:** Postgres 15 / Supabase / `pg_trgm`. React + TypeScript + Vite. `cmdk` library (already used). React Router (`useLocation`). Zustand (existing stores for fallback). Vitest. Playwright. Supabase MCP for migrations.

**Design source:** [docs/plans/2026-05-26-global-search-design.md](2026-05-26-global-search-design.md). Phase 0 RLS audit and findings live there; do not re-derive them here.

---

## Phase A — Database prerequisites

Goal: every backend piece — indexes, directory functions, RPC — landed on a Supabase branch and verified against real data before any frontend work begins.

### Task A1: Create Supabase branch for the search work

**Files:** none locally (branch lives in Supabase).

**Step 1:** Create branch via Supabase MCP.

Run (via mcp tool, not shell):

```
mcp__supabase__create_branch  name: "global-search-v1"
```

Expected: branch created with a fresh staging DB. Note the branch project ref for later steps.

**Step 2:** Confirm branch exists.

```
mcp__supabase__list_branches
```

Expected: `global-search-v1` appears with status `running`.

**Step 3:** Commit the branch reference into the plan PR's description (not a code change). No git commit for this task.

---

### Task A2: Verify `pg_trgm` extension

**Step 1:** Query branch for installed extensions.

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';
```

Run via `mcp__supabase__execute_sql` against the branch.

Expected: one row with `pg_trgm` installed, OR empty result.

**Step 2:** Decision point.

- If installed → skip A3 (no migration needed for the extension itself).
- If missing → proceed to A3.

---

### Task A3: Add `pg_trgm` extension (only if A2 returned empty)

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_enable_pg_trgm.sql` (timestamp generated at migration time)

**Step 1:** Write migration file.

```sql
-- Enable trigram similarity search for global search v1
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
```

**Step 2:** Apply against branch.

```
mcp__supabase__apply_migration  name: "enable_pg_trgm"  query: <file contents>
```

Expected: migration succeeds; `\dx pg_trgm` shows installed.

**Step 3:** Commit.

```bash
git add supabase/migrations/*_enable_pg_trgm.sql
git commit -m "feat(db): enable pg_trgm for global search"
```

---

### Task A4: Add trigram GIN indexes on searchable columns

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_global_search_indexes.sql`

**Step 1:** Identify exact column names per table. Run via MCP:

```
mcp__supabase__list_tables  schemas: ["public"]
```

Inspect the column lists for `dogs`, `people`, `shows`, `clubs`, `classes`, `entries`, `armbands`. Note the actual column names (e.g., is it `call_name` or `name`? `show_name` or `name`?).

**Step 1b [ADDED]: Verify `entries.armband` column type.** The plan casts it to text in A7. Run:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'entries' AND column_name = 'armband';
```

If `integer` or `smallint`, the `::text` cast in A7 is correct. If already `text`, drop the cast (cheaper). If a different name (`armband_number`?), update every reference in A4 and A7 to match. Document the result in the migration's header comment so future readers don't have to re-derive.

**Step 2:** Write migration with confirmed column names. Template:

```sql
-- Trigram indexes for global search v1 (see docs/plans/2026-05-26-global-search-design.md)

CREATE INDEX IF NOT EXISTS idx_dogs_call_name_trgm
  ON public.dogs USING GIN (call_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dogs_registered_name_trgm
  ON public.dogs USING GIN (registered_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_people_first_name_trgm
  ON public.people USING GIN (first_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_people_last_name_trgm
  ON public.people USING GIN (last_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shows_show_name_trgm
  ON public.shows USING GIN (show_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clubs_club_name_trgm
  ON public.clubs USING GIN (club_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_classes_class_name_trgm
  ON public.classes USING GIN (class_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Armband exact match: B-tree (cast to text if integer column)
CREATE INDEX IF NOT EXISTS idx_entries_armband
  ON public.entries (armband)
  WHERE deleted_at IS NULL;
```

Adjust column names where they don't match. Add equivalent index on `armbands` table if armband lookup needs to hit it too (open question per design doc).

**Step 3:** Apply via `mcp__supabase__apply_migration`.

**Step 4:** Verify indexes exist:

```sql
SELECT indexname FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE 'idx_%_trgm' OR indexname = 'idx_entries_armband'
ORDER BY indexname;
```

Expected: all created indexes present.

**Step 5:** Commit.

```bash
git add supabase/migrations/*_global_search_indexes.sql
git commit -m "feat(db): add trigram indexes for global search"
```

---

### Task A4b [ADDED]: Per-user rate limit on `search_global`

**Why:** Design rule #15. Without enforcement, a buggy client (or stuck `useEffect` loop) can hit the RPC at keystroke frequency. Postgres-side limiting keeps the safety check on the same boundary as RLS.

**Files:**
- Modify: same `_search_global_rpc.sql` migration once A7 lands, OR add a separate `_search_global_rate_limit.sql` migration ahead of A7. Sequence-wise, do this as part of A7 so the limit ships with the RPC, not after.

**Step 1:** Add a counter table.

```sql
CREATE TABLE IF NOT EXISTS public.search_global_rate (
  user_id uuid NOT NULL,
  minute_bucket timestamptz NOT NULL,
  call_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, minute_bucket)
);

-- Auto-cleanup: rows older than 5 minutes are useless
CREATE INDEX IF NOT EXISTS idx_search_global_rate_bucket
  ON public.search_global_rate (minute_bucket);
```

**Step 2:** At the top of `search_global` (before the main query), add:

```sql
DECLARE
  current_user_id uuid := auth.uid();
  current_bucket  timestamptz := date_trunc('minute', now());
  current_count   int;
  RATE_LIMIT      constant int := 60;
BEGIN
  IF current_user_id IS NOT NULL THEN
    INSERT INTO public.search_global_rate (user_id, minute_bucket, call_count)
    VALUES (current_user_id, current_bucket, 1)
    ON CONFLICT (user_id, minute_bucket)
    DO UPDATE SET call_count = public.search_global_rate.call_count + 1
    RETURNING call_count INTO current_count;

    IF current_count > RATE_LIMIT THEN
      RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ... existing query body ...
END;
```

Anonymous callers (`auth.uid() IS NULL`) skip the limit — they hit anon-policy results only, and edge-level rate limiting (if/when added) covers them.

**Step 3:** Frontend handles `rate_limit_exceeded`. In `useGlobalSearch.ts`, catch the error code and set `setError(new Error('rate_limit'))` without falling back to stores (the user is fine, just over budget). Render a subtle "Search rate limit reached — pause typing" hint in the palette for 60s.

**Step 4:** Test on the branch:

```sql
-- Run 61 times rapidly from a single authenticated session; the 61st should raise
SELECT * FROM public.search_global('Bud', null, 8);
```

Expected: 61st call raises `rate_limit_exceeded`.

**Step 5:** Cleanup cron / housekeeping. Add a `pg_cron` job (or document for ops) to `DELETE FROM public.search_global_rate WHERE minute_bucket < now() - interval '5 minutes';` every 5 minutes. If `pg_cron` isn't enabled, file as a follow-up; for v1 the table will grow at ~1 row/user/minute which is tolerable.

**Step 6:** Commit alongside A7.

---

### Task A5: Implement `search_dogs_directory` (write failing test first)

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_search_directory_functions.sql`
- Create: `supabase/tests/search_directory.sql` (or wherever DB tests live — verify project convention first by running `Glob: supabase/tests/**`)

**Step 1: Write the failing test.**

```sql
-- supabase/tests/search_directory.sql (or pgTAP-style if project uses it)

-- Test: search_dogs_directory returns matches regardless of caller's relationship to the dog
SELECT public.search_dogs_directory('Buddy') AS results;
-- Expected: rows including ANY dog with call_name or registered_name like 'Buddy',
-- regardless of who calls (no RLS restriction).
-- BEFORE implementing the function, expect: function does not exist error.
```

**Step 2: Run test to verify it fails.**

Via MCP:
```sql
SELECT * FROM public.search_dogs_directory('Buddy');
```

Expected: `ERROR: function public.search_dogs_directory(unknown) does not exist`.

**Step 3: Write the function.**

```sql
CREATE OR REPLACE FUNCTION public.search_dogs_directory(
  query text,
  result_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  call_name text,
  registered_name text,
  breed text,
  owner_display_name text,
  rank real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF query IS NULL OR length(trim(query)) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.call_name,
    d.registered_name,
    d.breed,
    coalesce(trim(concat(p.first_name, ' ', p.last_name)), ''),
    GREATEST(
      similarity(coalesce(d.call_name, ''), query),
      similarity(coalesce(d.registered_name, ''), query) * 0.8
    ) AS rank
  FROM public.dogs d
  LEFT JOIN public.people p ON p.id = d.owner_id
  -- [EXPANDED — verification gap #28] Co-owner: if dogs.co_owner_id is non-null, append
  -- " & <co-owner display>" to owner_display_name. Implement via a second LEFT JOIN aliased
  -- as co and CONCAT_WS the names. Confirm during implementation that `co_owner_id` is the
  -- actual column (it is, per the RLS policy in design doc Phase 0). Keep the field a single
  -- text column — the frontend doesn't need to know about the join.
  WHERE d.deleted_at IS NULL
    AND (
      d.call_name % query
      OR d.registered_name % query
    )
  ORDER BY rank DESC
  LIMIT result_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_dogs_directory(text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.search_dogs_directory(text, int) TO authenticated;
```

**Step 4: Apply via `mcp__supabase__apply_migration`.**

**Step 5: Run the test again.**

```sql
SELECT * FROM public.search_dogs_directory('Buddy');
```

Expected: PASS — returns rows if any matching dogs exist on the branch; empty if not. No error.

**Step 6:** Add a second test: confirm the function returns only whitelisted columns.

```sql
-- Should be exactly: id, call_name, registered_name, breed, owner_display_name, rank
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'search_dogs_directory_result'; -- or via pg_proc.prorettype
```

(Or just visually inspect the function's `RETURNS TABLE` — the test is "no sensitive fields like microchip_number, dob, registration_number leaked into the return shape.")

**Step 7:** Do NOT commit yet — combine with A6 in one migration file.

---

### Task A6: Implement `search_people_directory` (write failing test first)

**Files:** same migration file as A5.

**Step 1: Write failing test.**

```sql
SELECT * FROM public.search_people_directory('Smith');
```

Expected: function does not exist.

**Step 2: Write the function.**

```sql
CREATE OR REPLACE FUNCTION public.search_people_directory(
  query text,
  result_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  display_name text,
  rank real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF query IS NULL OR length(trim(query)) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    trim(concat(p.first_name, ' ', p.last_name)) AS display_name,
    GREATEST(
      similarity(coalesce(p.first_name, ''), query),
      similarity(coalesce(p.last_name, ''), query)
    ) AS rank
  FROM public.people p
  WHERE p.deleted_at IS NULL
    AND (
      p.first_name % query
      OR p.last_name % query
    )
  ORDER BY rank DESC
  LIMIT result_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_people_directory(text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.search_people_directory(text, int) TO authenticated;
```

**Step 3:** Apply migration.

**Step 4:** Re-run failing test. Expected: PASS.

**Step 5:** Commit A5 + A6 together.

```bash
git add supabase/migrations/*_search_directory_functions.sql supabase/tests/search_directory.sql
git commit -m "feat(db): add SECURITY DEFINER directory functions for cross-scope dog/people search"
```

---

### Task A7: Implement `search_global` RPC (write failing test first)

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_search_global_rpc.sql`

**Step 1: Write failing test.**

```sql
SELECT * FROM public.search_global('Buddy', null, 8);
```

Expected: function does not exist.

**Step 2: Write the function. Critical: `SECURITY INVOKER` (default) so RLS applies to in-scope reads; calls into `SECURITY DEFINER` directory functions for cross-scope dog/people discovery.**

```sql
CREATE OR REPLACE FUNCTION public.search_global(
  query text,
  scope_show_id uuid DEFAULT NULL,
  result_limit int DEFAULT 8
)
RETURNS TABLE (
  record_type text,
  record_id uuid,
  display text,
  subtitle text,
  show_id uuid,
  show_name text,
  rank real,
  match_field text,
  in_scope boolean
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  norm_query text;
BEGIN
  norm_query := trim(query);
  IF norm_query IS NULL OR length(norm_query) < 2 OR length(norm_query) > 100 THEN
    RETURN;
  END IF;

  RETURN QUERY
  -- Entries (in-scope only; armband matches first)
  SELECT
    'entry'::text,
    e.id,
    'Armband ' || e.armband::text,
    coalesce(d.call_name, '') || ' — ' || coalesce(c.class_name, ''),
    e.show_id,
    s.show_name,
    CASE WHEN e.armband::text = norm_query THEN 1.0
         ELSE similarity(e.armband::text, norm_query) END,
    'armband',
    true
  FROM public.entries e
  LEFT JOIN public.dogs d ON d.id = e.dog_id
  LEFT JOIN public.classes c ON c.id = e.class_id
  LEFT JOIN public.shows s ON s.id = e.show_id
  WHERE e.deleted_at IS NULL
    AND (scope_show_id IS NULL OR e.show_id = scope_show_id)
    AND e.armband::text ILIKE norm_query || '%'

  UNION ALL

  -- Classes (in-scope only)
  SELECT
    'class'::text,
    c.id,
    c.class_name,
    coalesce(s.show_name, ''),
    s.id,
    s.show_name,
    similarity(c.class_name, norm_query),
    'class_name',
    true
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  JOIN public.shows s ON s.id = t.show_id
  WHERE c.deleted_at IS NULL
    AND s.deleted_at IS NULL
    AND (scope_show_id IS NULL OR s.id = scope_show_id)
    AND c.class_name % norm_query

  UNION ALL

  -- Shows
  SELECT
    'show'::text,
    s.id,
    s.show_name,
    coalesce(cl.club_name, ''),
    s.id,
    s.show_name,
    similarity(s.show_name, norm_query),
    'show_name',
    true
  FROM public.shows s
  LEFT JOIN public.clubs cl ON cl.id = s.club_id
  WHERE s.deleted_at IS NULL
    AND s.show_name % norm_query

  UNION ALL

  -- Clubs
  SELECT
    'club'::text,
    cl.id,
    cl.club_name,
    ''::text,
    NULL::uuid,
    NULL::text,
    similarity(cl.club_name, norm_query),
    'club_name',
    true
  FROM public.clubs cl
  WHERE cl.club_name % norm_query

  UNION ALL

  -- Dogs (in-scope via normal RLS; uses dogs table directly)
  SELECT
    'dog'::text,
    d.id,
    d.call_name,
    coalesce(d.breed, ''),
    NULL::uuid,
    NULL::text,
    GREATEST(
      similarity(coalesce(d.call_name, ''), norm_query),
      similarity(coalesce(d.registered_name, ''), norm_query) * 0.8
    ),
    'dog_name',
    true
  FROM public.dogs d
  WHERE d.deleted_at IS NULL
    AND (d.call_name % norm_query OR d.registered_name % norm_query)

  UNION ALL

  -- Dogs (cross-scope via directory; flag in_scope=false so frontend shows entry-creation affordance)
  -- Excludes IDs already returned by the in-scope read above so we don't dupe
  SELECT
    'dog'::text,
    dd.id,
    dd.call_name,
    coalesce(dd.breed, '') ||
      CASE WHEN dd.owner_display_name <> '' THEN ' · ' || dd.owner_display_name ELSE '' END,
    NULL::uuid,
    NULL::text,
    dd.rank * 0.5, -- penalize cross-scope so in-scope hits win on ties
    'dog_name_directory',
    false
  FROM public.search_dogs_directory(norm_query, result_limit) dd
  WHERE NOT EXISTS (
    SELECT 1 FROM public.dogs d2
    WHERE d2.id = dd.id AND d2.deleted_at IS NULL
      AND (d2.call_name % norm_query OR d2.registered_name % norm_query)
  )

  UNION ALL

  -- People (in-scope via normal RLS)
  SELECT
    'person'::text,
    p.id,
    trim(concat(p.first_name, ' ', p.last_name)),
    ''::text,
    NULL::uuid,
    NULL::text,
    GREATEST(
      similarity(coalesce(p.first_name, ''), norm_query),
      similarity(coalesce(p.last_name, ''), norm_query)
    ),
    'person_name',
    true
  FROM public.people p
  WHERE p.deleted_at IS NULL
    AND (p.first_name % norm_query OR p.last_name % norm_query)

  UNION ALL

  -- People (cross-scope via directory; in_scope=false)
  SELECT
    'person'::text,
    pd.id,
    pd.display_name,
    ''::text,
    NULL::uuid,
    NULL::text,
    pd.rank * 0.5,
    'person_name_directory',
    false
  FROM public.search_people_directory(norm_query, result_limit) pd
  WHERE NOT EXISTS (
    SELECT 1 FROM public.people p2
    WHERE p2.id = pd.id AND p2.deleted_at IS NULL
      AND (p2.first_name % norm_query OR p2.last_name % norm_query)
  )

  ORDER BY
    -- Boost entries when scoped to a show
    CASE WHEN scope_show_id IS NOT NULL AND record_type IN ('entry', 'class') THEN 0 ELSE 1 END,
    rank DESC,
    record_type
  LIMIT result_limit * 3; -- allow enough per type after dedup; client may further cap
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_global(text, uuid, int) TO authenticated, anon;
```

**Step 3: Apply migration.**

**Step 4: Run failing test again, plus a sanity test.**

```sql
SELECT record_type, display, subtitle, rank, in_scope
FROM public.search_global('Bud', null, 8);
```

Expected: returns a mix of record types, in_scope flag set correctly.

**Step 5:** Sanity test with a scoped show_id (pick a real `shows.id` from the branch):

```sql
SELECT record_type, display, in_scope
FROM public.search_global('47', '<some-show-id-from-shows-table>', 8);
```

Expected: armband 47 from that show ranks first if present.

**Step 6:** Commit.

```bash
git add supabase/migrations/*_search_global_rpc.sql
git commit -m "feat(db): add search_global RPC for unified record search"
```

---

### Task A7b [ADDED]: RPC ranking & trigram contract tests

**Why:** Verification gaps #19, #20. Without these, ranking regressions ship silently.

**Files:**
- Create: `supabase/tests/search_global_ranking.sql`

**Step 1:** Seed two known fixture rows on the branch (or use existing data — pick a dog whose `call_name` contains "Retriever" or similar fuzz target, and an entry with a known armband).

**Step 2:** Write assertions.

```sql
-- Assertion 1: trigram fuzz — "retriev" matches "Retriever" in dog breed or registered name
DO $$
DECLARE hit_count int;
BEGIN
  SELECT count(*) INTO hit_count
  FROM public.search_global('retriev', null, 8)
  WHERE record_type = 'dog' AND (display ILIKE '%retriev%' OR subtitle ILIKE '%retriev%');
  IF hit_count = 0 THEN
    RAISE EXCEPTION 'trigram fuzz failed: "retriev" returned no dog rows';
  END IF;
END $$;

-- Assertion 2: exact armband outranks fuzzy dog-name when scoped to a show
DO $$
DECLARE first_row record;
BEGIN
  SELECT record_type, display, rank INTO first_row
  FROM public.search_global('47', '<known-show-id-with-armband-47>', 8)
  ORDER BY rank DESC
  LIMIT 1;
  IF first_row.record_type <> 'entry' THEN
    RAISE EXCEPTION 'armband ranking failed: top result was % (display: %), expected entry',
      first_row.record_type, first_row.display;
  END IF;
END $$;

-- Assertion 3: in_scope=true ranks above in_scope=false for the same display
-- (cross-scope dog directory hits should not beat in-scope reads)
DO $$
DECLARE in_scope_rank real; out_scope_rank real;
BEGIN
  -- Pick a dog name that appears both in caller's scope and outside (set up fixtures accordingly)
  SELECT rank INTO in_scope_rank
  FROM public.search_global('<test-name>', null, 8)
  WHERE record_type = 'dog' AND in_scope = true LIMIT 1;
  SELECT rank INTO out_scope_rank
  FROM public.search_global('<test-name>', null, 8)
  WHERE record_type = 'dog' AND in_scope = false LIMIT 1;
  IF in_scope_rank IS NOT NULL AND out_scope_rank IS NOT NULL THEN
    IF in_scope_rank <= out_scope_rank THEN
      RAISE EXCEPTION 'in_scope dog should outrank out-of-scope dog (% vs %)',
        in_scope_rank, out_scope_rank;
    END IF;
  END IF;
END $$;
```

**Step 3:** Run via MCP. Expected: no exceptions raised.

**Step 4:** Commit.

```bash
git add supabase/tests/search_global_ranking.sql
git commit -m "test(db): contract tests for search_global ranking and trigram matching"
```

---

### Task A7c [ADDED]: Performance baseline via `EXPLAIN ANALYZE`

**Why:** Verification gap #24. The plan's p95 budgets are wishful without a measurement step.

**Step 1:** Pick three representative queries — short (`'47'`), medium (`'Buddy'`), long (`'open A novice golden'`).

**Step 2:** For each, run on the branch:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_global('Buddy', null, 8);
```

And the show-scoped variant:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_global('47', '<some-show-id>', 8);
```

**Step 3:** Record `Execution Time` for each. Acceptance:
- Show-scoped: < 200ms.
- Global: < 500ms.

**Step 4:** If either budget is exceeded, do NOT proceed to Phase B. Investigate: missing index? Trigram threshold too low (`SET pg_trgm.similarity_threshold = 0.3;` may help)? A single union branch dominating? Iterate on A4/A7 until budgets hold on the branch's data volume.

**Step 5:** Document numbers in the migration's header comment so future regressions have a baseline. No git commit specific to this task — verification only.

---

### Task A8: Run RLS canary test on staging branch

**Step 1:** Identify two test accounts on the branch: one exhibitor with a dog, one secretary in a different show. (Use the branch's seed data, or create test users via `auth.users` insert if needed.)

**Step 2:** Authenticate as the exhibitor (via Supabase MCP `execute_sql` with `SET LOCAL request.jwt.claims = ...` or via the JS client in a script).

**Step 3:** Query:

```sql
SELECT count(*) FROM public.search_global('<other_exhibitor_dog_call_name>', null, 8)
WHERE in_scope = true;
```

Expected: `0` (cannot see another exhibitor's dog as in-scope).

**Step 4:** Same query, but check `in_scope = false`:

```sql
SELECT count(*) FROM public.search_global('<other_exhibitor_dog_call_name>', null, 8)
WHERE in_scope = false;
```

Expected: `>= 1` (directory function returns it as out-of-scope for entry creation).

**Step 5:** Authenticate as the secretary, repeat scoped-to-their-show query.

Expected: in-scope rows for their own show's dogs/entries.

**Step 6:** If any assertion fails, **stop**. The RLS policies or directory functions are wrong; fix before proceeding to frontend.

**Step 7:** Document results in the design doc's Open Items section. No code commit for this task (verification only).

---

## Phase B — Frontend types and hook

### Task B1: Add the feature flag

**Files:**
- Modify: [apps/myk9show/src/config/features.ts](../../apps/myk9show/src/config/features.ts)

**Step 1:** Add the flag, default `false`.

```typescript
export const features = {
  // ... existing flags ...
  globalSearchV2: false,
} as const;
```

**Step 2:** Verify TS compiles.

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: no errors.

**Step 3:** Commit.

```bash
git add apps/myk9show/src/config/features.ts
git commit -m "feat(myk9show): add globalSearchV2 feature flag"
```

---

### Task B2: Regenerate Supabase TypeScript types

**Files:**
- Modify: wherever generated types live (likely `apps/myk9show/src/types/supabase.ts` or `packages/types/...`).

**Step 1:** Find the type generation script. Check `package.json` scripts in `apps/myk9show` and in the root `package.json` for one named `db:types`, `gen:types`, or similar.

**Step 2:** Run it against the branch.

```bash
# Example — confirm exact command from package.json
pnpm db:types
```

Expected: regenerated file now contains `search_global`, `search_dogs_directory`, `search_people_directory` in the `Database['public']['Functions']` map.

**Step 3:** Verify a known field appears:

```bash
grep -n "search_global" apps/myk9show/src/types/supabase.ts | head -5
```

Expected: at least one match.

**Step 4:** Commit.

```bash
git add apps/myk9show/src/types/supabase.ts # adjust path as needed
git commit -m "chore(types): regenerate Supabase types with global-search RPC signatures"
```

---

### Task B3: Write `useGlobalSearch` hook — failing test first

**Files:**
- Create: `apps/myk9show/src/hooks/useGlobalSearch.ts`
- Create: `apps/myk9show/src/test/hooks/useGlobalSearch.test.ts`

**Step 1:** Write the failing test.

```typescript
// apps/myk9show/src/test/hooks/useGlobalSearch.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({
      data: [{ record_type: 'dog', record_id: 'd1', display: 'Buddy', rank: 0.9, in_scope: true }],
      error: null,
    }),
  },
}));

describe('useGlobalSearch', () => {
  it('calls search_global RPC after debounce and returns results', async () => {
    const { result } = renderHook(() => useGlobalSearch('Bud', { showId: null }));

    await waitFor(() => {
      expect(result.current.results.length).toBeGreaterThan(0);
    });

    expect(result.current.results[0].display).toBe('Buddy');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFallback).toBe(false);
  });

  it('does not call RPC for queries under 2 characters', async () => {
    const { result } = renderHook(() => useGlobalSearch('a', { showId: null }));
    expect(result.current.results).toEqual([]);
  });

  it('falls back to store-filtered results when RPC fails', async () => {
    // Mock supabase rpc to throw; assert isFallback === true and badge content
    // (Full implementation in Task B4)
  });
});
```

**Step 2:** Run test.

```bash
cd apps/myk9show && npx vitest run src/test/hooks/useGlobalSearch.test.ts
```

Expected: FAIL — module `@/hooks/useGlobalSearch` not found.

**Step 3:** Write minimal hook (defer offline fallback to B4).

```typescript
// apps/myk9show/src/hooks/useGlobalSearch.ts
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

type SearchRow = Database['public']['Functions']['search_global']['Returns'][number];

interface UseGlobalSearchResult {
  results: SearchRow[];
  isLoading: boolean;
  isFallback: boolean;
  error: Error | null;
}

const DEBOUNCE_MS = 150;
const MIN_QUERY_LEN = 2;
const MAX_QUERY_LEN = 100;

export function useGlobalSearch(
  query: string,
  opts: { showId: string | null; limit?: number } = { showId: null }
): UseGlobalSearchResult {
  const [results, setResults] = useState<SearchRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN || trimmed.length > MAX_QUERY_LEN) {
      setResults([]);
      setIsLoading(false);
      setIsFallback(false);
      setError(null);
      return;
    }

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const { data, error: rpcError } = await supabase.rpc('search_global', {
          query: trimmed,
          scope_show_id: opts.showId,
          result_limit: opts.limit ?? 8,
        });
        if (rpcError) throw rpcError;
        setResults(data ?? []);
        setIsFallback(false);
        setError(null);
      } catch (e) {
        setError(e as Error);
        // Offline fallback wired in Task B4
        setResults([]);
        setIsFallback(true);
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, opts.showId, opts.limit]);

  return { results, isLoading, isFallback, error };
}
```

**Step 4:** Run test.

```bash
cd apps/myk9show && npx vitest run src/test/hooks/useGlobalSearch.test.ts
```

Expected: PASS for first two tests; the fallback test will be skipped or PASS trivially with empty fallback.

**Step 5:** Commit.

```bash
git add apps/myk9show/src/hooks/useGlobalSearch.ts apps/myk9show/src/test/hooks/useGlobalSearch.test.ts
git commit -m "feat(myk9show): add useGlobalSearch hook with debounce and RPC call"
```

---

### Task B4: Add offline fallback to `useGlobalSearch`

**Files:**
- Modify: `apps/myk9show/src/hooks/useGlobalSearch.ts`
- Modify: `apps/myk9show/src/test/hooks/useGlobalSearch.test.ts`

**Step 1:** Write failing test for fallback.

```typescript
it('falls back to store-filtered results when RPC fails', async () => {
  vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error('Network') });
  // Seed dogStore with a known dog
  useDogStore.setState({ dogs: [{ id: 'd1', call_name: 'Buddy', breed: 'Golden' }] });

  const { result } = renderHook(() => useGlobalSearch('Bud', { showId: null }));
  await waitFor(() => expect(result.current.isFallback).toBe(true));
  expect(result.current.results.some(r => r.record_id === 'd1')).toBe(true);
});
```

Run: `npx vitest run src/test/hooks/useGlobalSearch.test.ts -t "falls back"`. Expected: FAIL.

**Step 2:** Implement fallback. In the catch block of the hook, replace the empty-results path with:

```typescript
} catch (e) {
  setError(e as Error);
  const fallbackResults = buildFallbackResults(trimmed, opts.showId);
  setResults(fallbackResults);
  setIsFallback(true);
}
```

**Step 3:** Add `buildFallbackResults` helper.

```typescript
// In useGlobalSearch.ts or a sibling helper file
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { useShowStore } from '@/store/showStore';

function buildFallbackResults(query: string, showId: string | null): SearchRow[] {
  const lower = query.toLowerCase();
  const dogs = useDogStore.getState().dogs;
  const people = useUserStore.getState().people; // verify actual store shape
  const shows = useShowStore.getState().shows;

  const dogRows: SearchRow[] = dogs
    .filter(d => d.call_name?.toLowerCase().includes(lower))
    .slice(0, 5)
    .map(d => ({
      record_type: 'dog',
      record_id: d.id,
      display: d.call_name ?? '',
      subtitle: d.breed ?? '',
      show_id: null,
      show_name: null,
      rank: 0.5,
      match_field: 'dog_name',
      in_scope: true,
    }));

  // Similar for people, shows. Entries and classes are NOT in stores; skipped intentionally.
  return [...dogRows /* ...peopleRows, ...showRows */];
}
```

**Step 4:** Run test. Expected: PASS.

**Step 5:** Commit.

```bash
git add apps/myk9show/src/hooks/useGlobalSearch.ts apps/myk9show/src/test/hooks/useGlobalSearch.test.ts
git commit -m "feat(myk9show): add offline fallback to useGlobalSearch over Zustand stores"
```

---

## Phase C — Palette UI refactor

### Task C1: Detect show scope in palette

**Files:**
- Modify: [apps/myk9show/src/components/common/CommandPalette.tsx](../../apps/myk9show/src/components/common/CommandPalette.tsx)

**Step 1:** Add a `useLocation()` hook + regex match for `:showId`. Reuse the pattern from [AskQPanel.tsx](../../apps/myk9show/src/components/askq/AskQPanel.tsx) (lines 22-25):

```typescript
import { useLocation } from 'react-router-dom';

const location = useLocation();
const scopedShowId = useMemo(
  () => location.pathname.match(/\/(?:secretary\/)?shows\/([^/]+)/)?.[1] ?? null,
  [location.pathname]
);
```

**Step 2:** No new test for this — covered by C5 (integration test of show-scoped section header rendering).

**Step 3:** Commit at end of C4.

---

### Task C2: Replace store-based search with `useGlobalSearch`

**Files:**
- Modify: `apps/myk9show/src/components/common/CommandPalette.tsx`

**Step 1:** Gate behind feature flag at the top of the component.

```typescript
import { features } from '@/config/features';

// inside component:
const useV2 = features.globalSearchV2;
```

**Step 2:** When `useV2` is true, replace the existing store-derived data commands with results from `useGlobalSearch`:

```typescript
const { results, isLoading, isFallback } = useGlobalSearch(searchInput, { showId: scopedShowId });
```

When `useV2` is false, keep current behavior (legacy code path remains as fallback during rollout).

**Step 3:** Verify TS compiles.

```bash
cd apps/myk9show && pnpm typecheck
```

**Step 4:** Commit at end of C4.

---

### Task C3: Render results with `in_scope` affordance switch

**Files:**
- Modify: `apps/myk9show/src/components/common/CommandPalette.tsx`

**Step 1:** Write failing test first.

```typescript
// apps/myk9show/src/test/components/common/CommandPalette.test.tsx
it('renders entry-create affordance for out-of-scope dog results', async () => {
  vi.mocked(supabase.rpc).mockResolvedValueOnce({
    data: [{ record_type: 'dog', record_id: 'd9', display: 'Rex', in_scope: false, ... }],
    error: null,
  });
  // ... render palette in show-scoped route, type "Rex", await results ...
  expect(screen.getByText(/Add Rex to this show/i)).toBeInTheDocument();
});
```

Run: `npx vitest run src/test/components/common/CommandPalette.test.tsx -t "out-of-scope"`. Expected: FAIL.

**Step 2:** In the result-row renderer, branch on `result.in_scope`:

```tsx
{results.map(r => (
  <CommandItem
    key={r.record_id}
    onSelect={() => r.in_scope ? navigateToRecord(r) : openEntryCreate(r)}
  >
    <ResultIcon type={r.record_type} />
    <div className="flex flex-col">
      <span>{r.display}</span>
      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
    </div>
    {!r.in_scope && (r.record_type === 'dog' || r.record_type === 'person') && (
      <span className="ml-auto text-xs">Add to this show</span>
    )}
  </CommandItem>
))}
```

**Step 3:** Stub `openEntryCreate` — for v1 it can navigate to the existing entry-creation route with the dog/person pre-selected.

**Step 3a [ADDED — verification gap #30]:** Before writing the stub, confirm the route exists. Run:

```
Grep: route path matching /entries/new OR /shows/.+/entries/new
```

If the route exists, use it. If it does NOT exist, do NOT block this task — instead:
1. Render the out-of-scope row with a placeholder action that fires a `toast.info('Entry creation flow coming soon')`.
2. File an OPEN-TODOS entry: *"Entry-creation deep link from global search palette (search v1 followup)"*.
3. Note in the PR description that the affordance ships visible but inert pending the route.

This way C3 lands on schedule and the deep-link is tracked separately.

**Step 4:** Run test. Expected: PASS.

**Step 5:** Commit at end of C4.

---

### Task C4: Add AskQ launcher row

**Files:**
- Modify: `apps/myk9show/src/components/common/CommandPalette.tsx`
- Modify: `apps/myk9show/src/test/components/common/CommandPalette.test.tsx`

**Step 1:** Write failing test.

```typescript
it('shows AskQ row when query is non-empty and opens AskQ panel on click', async () => {
  const openSpy = vi.spyOn(useAskQPanelStore.getState(), 'open');
  // render palette, type "buddy", wait for results
  const askqRow = screen.getByText(/Ask AskQ:/i);
  expect(askqRow).toBeInTheDocument();
  await user.click(askqRow);
  expect(openSpy).toHaveBeenCalledWith({ suggestedPrompt: 'buddy', showId: expect.any(String) });
});

it('does not show AskQ row when query is empty', () => {
  // render with empty input; assert /Ask AskQ:/ is not in document
});
```

Run test. Expected: FAIL.

**Step 2:** Confirm `useAskQPanelStore` exposes an `open(opts)` action (verify by reading [store/useAskQPanelStore.ts](../../apps/myk9show/src/store/useAskQPanelStore.ts)). If the API differs, adjust the call to match.

**Step 3:** Render the AskQ row when `searchInput.trim().length > 0`. [EXPANDED — verification gap #16] Sanitize the query via a local helper before passing into the AskQ store, even though AskQ itself sanitizes too. Defense in depth.

```tsx
import { sanitizeForPrompt } from '@/lib/sanitizeForPrompt'; // new helper, see Step 3a

{searchInput.trim().length > 0 && (
  <>
    <CommandSeparator />
    <CommandItem
      onSelect={() => {
        const safe = sanitizeForPrompt(searchInput);
        useAskQPanelStore.getState().open({ suggestedPrompt: safe, showId: scopedShowId });
        onOpenChange(false);
      }}
      className="opacity-70"
    >
      <SparkleIcon className="h-3.5 w-3.5" />
      <span className="text-sm">Ask AskQ: "{searchInput}"</span>
      <span className="ml-auto text-xs px-1.5 py-0.5 bg-muted rounded">AI</span>
    </CommandItem>
  </>
)}
```

**Step 3a [ADDED]:** Build the `sanitizeForPrompt` helper. This is the single source of truth flagged in the [ai-ux-adaptation doc](../ai-ux-adaptation.md) — wire it up here, reuse it for future AI features.

Create `apps/myk9show/src/lib/sanitizeForPrompt.ts`:

```typescript
/**
 * Sanitize user-supplied text before it travels into an LLM prompt.
 * Treats input as data, not instructions. Defense-in-depth with server-side limits.
 */
export function sanitizeForPrompt(raw: string): string {
  if (typeof raw !== 'string') return '';
  // Strip control chars except whitespace
  const stripped = raw.replace(/[ -]/g, '').trim();
  // Hard length cap — server enforces 100 too
  const capped = stripped.slice(0, 100);
  return capped;
}
```

Create unit test at `apps/myk9show/src/test/lib/sanitizeForPrompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sanitizeForPrompt } from '@/lib/sanitizeForPrompt';

describe('sanitizeForPrompt', () => {
  it('returns trimmed input unchanged for safe queries', () => {
    expect(sanitizeForPrompt('  buddy  ')).toBe('buddy');
  });
  it('strips control characters', () => {
    expect(sanitizeForPrompt('hello world')).toBe('helloworld');
  });
  it('caps length at 100', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeForPrompt(long).length).toBe(100);
  });
  it('returns empty string for non-string input', () => {
    // @ts-expect-error testing runtime safety
    expect(sanitizeForPrompt(null)).toBe('');
  });
});
```

Run tests; expected PASS.

**Step 4:** Run tests. Expected: PASS.

**Step 5:** Commit C1–C4 together.

```bash
git add apps/myk9show/src/components/common/CommandPalette.tsx apps/myk9show/src/test/components/common/CommandPalette.test.tsx
git commit -m "feat(myk9show): wire global-search RPC, in_scope affordance, and AskQ row into CommandPalette"
```

---

### Task C5: Show-scoped section headers + broaden divider

**Files:**
- Modify: `apps/myk9show/src/components/common/CommandPalette.tsx`
- Modify: test file as above

**Step 1:** Write failing test.

```typescript
it('renders "Search across all shows" divider when scoped', () => {
  // render palette inside /shows/<id>/... route with results returned for that show
  expect(screen.getByText(/Search across all shows/i)).toBeInTheDocument();
});
```

Expected: FAIL.

**Step 2:** Group results by `record_type`, render section header per group. When `scopedShowId` is set, render the broaden divider as the last item before the AskQ row.

```tsx
{scopedShowId && (
  <CommandItem
    onSelect={() => setBroadenToGlobal(true)}
    className="text-xs text-muted-foreground"
  >
    Search across all shows →
  </CommandItem>
)}
```

[EXPANDED — verification gap #29] **Explicit decision: no automatic broaden.** If a show-scoped search returns zero results, do NOT auto-broaden to global. The "Search across all shows →" row is the user's deliberate action. Reasons: (a) auto-broaden surprises the user with results from shows they didn't intend to search; (b) zero scoped results often means a typo, which auto-broaden would mask; (c) one click is cheap, surprise is expensive. Document this in the component as a comment so future maintainers don't "improve" it away.

`setBroadenToGlobal(true)` causes the next `useGlobalSearch` call to pass `showId: null`. Add the state to the component:

```typescript
const [broadenToGlobal, setBroadenToGlobal] = useState(false);
const effectiveShowId = broadenToGlobal ? null : scopedShowId;
const { results, isLoading, isFallback } = useGlobalSearch(searchInput, { showId: effectiveShowId });
```

Reset `broadenToGlobal` when palette closes or input clears.

**Step 3:** Run test. Expected: PASS.

**Step 4:** Commit.

```bash
git add apps/myk9show/src/components/common/CommandPalette.tsx apps/myk9show/src/test/components/common/CommandPalette.test.tsx
git commit -m "feat(myk9show): add show-scoped sections and broaden-to-global divider"
```

---

### Task C6: Offline-fallback badge

**Files:**
- Modify: `apps/myk9show/src/components/common/CommandPalette.tsx`
- Modify: test file

**Step 1:** Write failing test.

```typescript
it('shows offline-fallback badge when isFallback is true', async () => {
  vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error('Network') });
  // render, type, wait for fallback
  expect(screen.getByText(/Showing cached results — you're offline/i)).toBeInTheDocument();
});
```

Expected: FAIL.

**Step 2:** Render a chip in the palette footer when `isFallback` is true.

```tsx
{isFallback && (
  <div className="px-3 py-1.5 text-xs text-amber-600 bg-amber-50 border-t border-amber-200">
    Showing cached results — you're offline.
  </div>
)}
```

**Step 3:** Run test. Expected: PASS.

**Step 4:** Commit.

```bash
git add apps/myk9show/src/components/common/CommandPalette.tsx apps/myk9show/src/test/components/common/CommandPalette.test.tsx
git commit -m "feat(myk9show): show offline-fallback badge in CommandPalette"
```

---

## Phase D — Observability and tests

### Task D1: Logging

**Files:**
- Modify: `apps/myk9show/src/hooks/useGlobalSearch.ts`

**Step 1:** After every successful RPC call, emit a log via the existing `LoggingService`:

```typescript
import { logger } from '@/services/LoggingService';

// inside the .then() / success path:
logger.info('global_search.rpc', 'search', {
  query_length: trimmed.length,
  scope_show_id: !!opts.showId,
  result_count: data?.length ?? 0,
  result_types: [...new Set((data ?? []).map(r => r.record_type))],
});
```

For zero-result queries, also log a hashed query payload (use a quick `crypto.subtle.digest` SHA-256, truncate to 16 chars):

```typescript
if ((data?.length ?? 0) === 0) {
  const hashed = await hashQuery(trimmed);
  logger.info('global_search.zero_result', 'search', { query_hash: hashed });
}
```

For AskQ-row clicks, in the palette's click handler:

```typescript
logger.info('global_search.askq_clicked', 'search', {
  query_length: searchInput.length,
  scope_show_id: !!scopedShowId,
});
```

**Step 2:** Commit.

```bash
git add apps/myk9show/src/hooks/useGlobalSearch.ts apps/myk9show/src/components/common/CommandPalette.tsx
git commit -m "feat(myk9show): emit telemetry for global-search RPC, zero results, and AskQ clicks"
```

---

### Task D2: E2E — armband search in show context

**Files:**
- Create: `apps/myk9show/e2e/global-search.spec.ts`

**Step 1:** Find existing Playwright patterns — check `apps/myk9show/e2e/` (or wherever `pnpm test:e2e` runs from) for an example spec to mirror auth setup and page-object usage.

**Step 2:** Write spec covering:

```typescript
test('armband search inside show context opens entry detail', async ({ page }) => {
  // Auth as secretary, navigate to a known show with a known armband
  await page.goto('/shows/<test-show-id>');
  await page.keyboard.press('Meta+k'); // or Control+k on Linux/Win
  await page.getByPlaceholder(/search/i).fill('47');
  await page.getByRole('option', { name: /armband 47/i }).click();
  await expect(page.getByTestId('entry-detail-panel')).toBeVisible();
});
```

**Step 3:** Run:

```bash
cd apps/myk9show && pnpm test:e2e --grep "armband search"
```

Expected: PASS.

**Step 4:** Commit.

```bash
git add apps/myk9show/e2e/global-search.spec.ts
git commit -m "test(myk9show): e2e for armband search in show context"
```

---

### Task D3: E2E — out-of-scope dog → entry creation

**Files:** same spec file.

**Step 1:** Write spec.

```typescript
test('out-of-scope dog result opens entry-creation flow', async ({ page }) => {
  await page.goto('/shows/<test-show-id>');
  await page.keyboard.press('Meta+k');
  await page.getByPlaceholder(/search/i).fill('Rex');
  const row = page.getByRole('option', { name: /Rex.*Add to this show/i });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/entries\/new/);
  await expect(page.getByLabel(/dog/i)).toHaveValue(/Rex/);
});
```

**Step 2:** Run, verify PASS, commit.

---

### Task D4: E2E — AskQ row click opens panel

**Files:** same spec file.

```typescript
test('AskQ row opens panel with pre-filled query and show context', async ({ page }) => {
  await page.goto('/shows/<test-show-id>');
  await page.keyboard.press('Meta+k');
  await page.getByPlaceholder(/search/i).fill('how is buddy doing today');
  await page.getByRole('option', { name: /Ask AskQ:/i }).click();
  await expect(page.getByTestId('askq-panel')).toBeVisible();
  // Confirm query is pre-filled in AskQ input
  await expect(page.getByRole('textbox', { name: /ask/i })).toHaveValue(/how is buddy doing today/);
});
```

Run, verify PASS, commit.

---

### Task D5: RLS unit test — exhibitor cannot see other exhibitor's in-scope dog

**Files:**
- Create: `supabase/tests/rls_search_global.sql`

**Step 1:** Write SQL-level integration test. Pattern (pseudo):

```sql
-- Assumes pgTAP installed; if not, plain assertions with RAISE EXCEPTION.

BEGIN;

-- Set auth.uid() to exhibitor A
SET LOCAL request.jwt.claims = '{"sub": "<exhibitor-a-uuid>"}';

-- Their own dog should be in_scope
SELECT count(*) > 0 AS has_own_dog
FROM public.search_global(
  (SELECT call_name FROM dogs WHERE owner_id = '<person-id-for-A>' LIMIT 1),
  null,
  8
)
WHERE in_scope = true;

-- Another exhibitor's dog should NOT be in_scope
SELECT count(*) = 0 AS no_other_in_scope
FROM public.search_global(
  (SELECT call_name FROM dogs WHERE owner_id = '<person-id-for-B>' LIMIT 1),
  null,
  8
)
WHERE in_scope = true;

ROLLBACK;
```

**Step 2:** Run against branch, fix RLS/RPC if assertions fail.

**Step 3:** Commit.

---

## Phase E — Launch

### Task E1: Merge branch to main (Supabase)

**Step 1:** Confirm all D-phase tests pass.

**Step 2:** Use Supabase MCP to merge:

```
mcp__supabase__merge_branch  branch_id: <global-search-v1 branch ID>
```

Expected: migrations applied to production DB.

**Step 3:** Smoke-test against production via the SQL editor: run `SELECT * FROM search_global('test', null, 5);`. Expected: returns rows or empty, no errors.

---

### Task E2: Open draft PR for the frontend changes

**Step 1:** From the worktree, push the feature branch:

```bash
git push -u origin <branch-name>
```

**Step 2:** Create draft PR.

```bash
gh pr create --draft --title "feat(search): global search v1 in Cmd-K palette" --body "$(cat <<'EOF'
## Summary
- Server-side global search across dogs, people, shows, clubs, entries, classes
- Context-aware show scoping with broaden-to-global divider
- AskQ launcher row at bottom of palette
- Offline fallback to existing Zustand stores
- Behind `globalSearchV2` flag in features.ts (default false)

## Test plan
- [ ] Cmd+K in show → type "47" → entry detail panel opens
- [ ] Cmd+K outside show → type known dog name → record jumps to dog page
- [ ] Cmd+K → type unknown dog name → "Add to this show" affordance
- [ ] Cmd+K → click "Ask AskQ:" row → AskQ panel opens with query pre-filled
- [ ] Disconnect network → search shows "cached results" badge
- [ ] Flag flipped to true in staging deploy

## Related
- Design: docs/plans/2026-05-26-global-search-design.md
- Plan: docs/plans/2026-05-26-global-search-implementation.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3:** Confirm CI passes on the PR.

---

### Task E3: Canary launch

**Step 1:** Merge PR (squash). Branch hygiene per CLAUDE.md.

**Step 2:** Verify in staging deploy that flag is still `false` and palette behaves identically to today.

**Step 3:** Flip `globalSearchV2` to `true` in `features.ts`, open a tiny follow-up PR. Merge.

**Step 4:** Monitor logs (`global_search.rpc`, `global_search.zero_result`, `global_search.askq_clicked`) for 48 hours. Watch p95 latency. If p95 < 200ms scoped / 500ms global and zero RLS canary failures, declare v1 shipped.

**Step 5:** Add a follow-up issue for Phase 2 (replicated local-first search) per design doc.

---

## Verification & success criteria

Refer to the design doc's "Success criteria" section. All four must hold before declaring done:

- p95 RPC latency under threshold (200ms scoped / 500ms global).
- RLS canary test (Task A8 + D5) green.
- Secretary entry-creation E2E (Task D3) green.
- AskQ click-through ≥5% after one month of release (post-launch metric — not a v1 blocker, but logged for promotion to Phase 2).

## Appendix [ADDED] — gap fills from /verify-plan

### Recent-searches preservation test (gap #13)

Add to the palette test file at C2:

```typescript
it('preserves recent searches behavior under globalSearchV2 flag', () => {
  // Seed useRecentSearches with two items
  // Render palette with empty input
  expect(screen.getAllByTestId('recent-search-row')).toHaveLength(2);
});
```

Run this test in both flag-on and flag-off states. Expected: PASS both.

### Migration rollback runbook (gap #26)

If `search_global` misbehaves in production after E1 merge:

1. **First action: flip the flag.** `globalSearchV2: false` in `features.ts`, ship a one-line PR, merge. UI reverts to legacy palette behavior. Buys time without touching the DB.
2. **If DB-side rollback is also needed** (RPC consuming runaway CPU, lock contention on the rate-limit table):
   ```sql
   -- Disable the function without dropping it (preserves migration history)
   REVOKE EXECUTE ON FUNCTION public.search_global(text, uuid, int) FROM authenticated, anon;
   ```
   Apply as a hotfix migration. Frontend then errors → fallback path renders.
3. **Index rollback is last resort.** Indexes are non-blocking to read but cost write amplification on `dogs`/`people`/`entries`/etc. If writes spike, drop the trigram indexes:
   ```sql
   DROP INDEX CONCURRENTLY IF EXISTS public.idx_dogs_call_name_trgm;
   -- etc.
   ```
   Use `CONCURRENTLY` to avoid locking the underlying table. Indexes can be re-added later.
4. **Directory functions stay.** Even with the RPC revoked, the `SECURITY DEFINER` directory functions are no-ops without a caller; no need to drop them in a rollback.

Document this runbook in the PR description at E2 so on-call reviewers know what to do without re-deriving it.

### Alerting on RPC errors / latency (gap #31)

After E3 canary flip, before declaring done:

1. Confirm `frontend_logs` table (or whatever the project's log sink is) is receiving `global_search.rpc` events.
2. Add a query alert (Supabase log sink, existing observability stack — confirm during implementation): trigger when in any rolling 5-minute window:
   - Error rate on `global_search.rpc` exceeds 2%, OR
   - p95 latency exceeds 600ms global / 250ms scoped (slightly above success criteria to account for legitimate noise).
3. Alert destination: the same channel that handles existing production alerts.
4. If the project doesn't have a query-alert mechanism wired up yet, file an OPEN-TODOS entry for "Search v1 alerting" and document in the v1 launch note that the first 7 days require manual log review every 24h.

### Entry-creation route follow-up (gap #30)

Already inline at Task C3 — if the route doesn't exist, file OPEN-TODOS and ship inert. No additional appendix needed.

---

## Skills referenced

- @superpowers:test-driven-development for every task with a test-first step
- @superpowers:verification-before-completion before claiming any task done
- @superpowers:executing-plans to run this plan task-by-task
