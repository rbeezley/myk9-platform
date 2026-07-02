# Plan 001: Make the AI assistant's show-scope filter fail CLOSED

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 929240192..HEAD -- supabase/functions/_shared/askq/toolExecutor.ts`
> If that file changed since this plan was written, compare the "Current state"
> excerpt below against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1 (do first)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `929240192`, 2026-07-02

## Why this matters

The `ask-myk9show` edge function runs the AI assistant's data-lookup tools with
a **service-role** Supabase client (`supabase/functions/ask-myk9show/index.ts:92`),
which **bypasses Row-Level Security**. Tenant isolation for those tools rests
entirely on one helper, `applyShowScope`, adding a `show_id` filter. That helper
**fails open**: when no show scope is resolved, it returns the query with *no
filter at all*, so a service-role query returns rows across **every club**.

A user is given a resolved show scope only after an access check
(`ask-myk9show/index.ts:186` — `hasAccess = roleCount > 0 || entryCount > 0`).
If that check fails (the user named a show they don't belong to, or named none),
`verifiedShowId` stays `null`, `scope.showId` is `undefined`, and the
`search_entries` / `get_entry_results` tools then return **handler names, dog
names, and results from all shows on the platform**. That is a cross-tenant PII
leak, reachable by any signed-in user simply by asking the assistant to "search
entries for handler <name>". Because the service role bypasses RLS, there is no
database backstop — this helper is the only guard.

After this plan, an unresolved scope returns **zero rows** instead of everyone's
data, and a unit test pins that behavior.

## Current state

- `supabase/functions/_shared/askq/toolExecutor.ts` — the AI assistant's tool
  layer. `applyShowScope` (lines 13–22) is the sole tenant filter; four tools
  pass `scope` through it: `get_class_summary`, `get_entry_results`,
  `get_trial_overview`, `search_entries` (switch at lines 426–464). Two tools,
  `search_rules` and `search_user_guide`, are **legitimately global** (rules and
  the user guide are not tenant data) — they do not use `applyShowScope` and
  must stay global.

  The vulnerable helper, verbatim:

  ```ts
  // toolExecutor.ts:13-22
  // Apply the appropriate show scope filter to a query
  function applyShowScope(query: ReturnType<SupabaseClient['from']>, scope: ShowScope) {
    if (scope.showId) {
      return query.eq('show_id', scope.showId);
    }
    if (scope.licenseKey) {
      return query.eq('license_key', scope.licenseKey);
    }
    return query;          // <-- FAILS OPEN: no scope → no filter → all clubs
  }
  ```

  Scope is built in `executeTool` (lines 408–415): `scope.showId` is set only
  from `userContext?.showId` (the access-verified `verifiedShowId`); `scope`
  can legitimately be empty.

- **Why this file can't be imported by vitest directly**: `toolExecutor.ts`
  imports `createClient` from an `https://esm.sh/...` URL (line 1), which the
  app's vitest cannot resolve. Sibling `_shared` modules that ARE unit-tested
  (e.g. `apps/myk9show/supabase/functions/_shared/cartOverflowRefund.ts`) have
  **no** such import — that is why they are testable. So the fix extracts the
  scope logic into a Deno-import-free sibling module we can unit-test, following
  that same pattern.

- **Test convention** for these pure `_shared` helpers (vitest, run inside the
  app suite): see `apps/myk9show/supabase/functions/_shared/cartOverflowRefund.test.ts`
  — `import { describe, expect, it } from 'vitest'`, import the pure function,
  assert on its return. Match it.

## Commands you will need

| Purpose   | Command                                                                                   | Expected |
|-----------|-------------------------------------------------------------------------------------------|----------|
| Typecheck | `pnpm typecheck`                                                                          | exit 0   |
| Lint      | `pnpm lint`                                                                               | exit 0   |
| New test  | `cd apps/myk9show && npx vitest run supabase/functions/_shared/askq/showScope.test.ts`    | all pass |

## Scope

**In scope** (only these):
- `supabase/functions/_shared/askq/showScope.ts` (create)
- `supabase/functions/_shared/askq/showScope.test.ts` (create)
- `supabase/functions/_shared/askq/toolExecutor.ts` (edit: import + use the extracted helper; delete the inline one)

**Out of scope** (do NOT touch):
- `search_rules` / `search_user_guide` handling — these are intentionally global.
- The access check in `ask-myk9show/index.ts` — it is correct; the bug is
  purely that the *tool layer* fails open when it returns null. Do not change
  how `verifiedShowId` is computed.
- Any other edge function.

## Git workflow

- Branch: `advisor/001-askq-show-scope-fail-closed`
- Conventional-commit style, e.g. `fix(askq): fail closed when AI tool show-scope is unresolved`
- Do NOT push or open a PR unless the operator instructed it. **Do NOT deploy
  the edge function** — deployment is a separate, human-confirmed step.

## Steps

### Step 1 (assertion-first): create the failing test

Create `supabase/functions/_shared/askq/showScope.test.ts`. It tests a pure
helper `applyShowScope` (created in Step 2) against a **fake query builder** that
records `.eq()` calls, so we assert exactly what filter is applied:

```ts
import { describe, expect, it } from 'vitest';
import { applyShowScope } from './showScope';

// Minimal fake matching the `.eq(col, val)` surface applyShowScope uses.
function makeFakeQuery() {
  const calls: Array<{ col: string; val: unknown }> = [];
  const q = {
    calls,
    eq(col: string, val: unknown) {
      calls.push({ col, val });
      return q;
    },
  };
  return q;
}

describe('applyShowScope', () => {
  it('filters by show_id when a show scope is present', () => {
    const q = makeFakeQuery();
    applyShowScope(q, { showId: 'show-1' });
    expect(q.calls).toEqual([{ col: 'show_id', val: 'show-1' }]);
  });

  it('filters by license_key when only a license scope is present', () => {
    const q = makeFakeQuery();
    applyShowScope(q, { licenseKey: 'lic-1' });
    expect(q.calls).toEqual([{ col: 'license_key', val: 'lic-1' }]);
  });

  // THE REGRESSION THIS PLAN FIXES: empty scope must return NO rows, never all.
  it('fails closed (matches no rows) when no scope is resolved', () => {
    const q = makeFakeQuery();
    applyShowScope(q, {});
    // Exactly one filter applied, and it is an impossible predicate — NOT an
    // unfiltered query. The old code applied zero filters here.
    expect(q.calls.length).toBe(1);
    expect(q.calls[0].col).toBe('show_id');
    expect(q.calls[0].val).toBe('00000000-0000-0000-0000-000000000000');
  });
});
```

**Verify** it fails (helper doesn't exist yet):
`cd apps/myk9show && npx vitest run supabase/functions/_shared/askq/showScope.test.ts`
→ fails to resolve `./showScope`. Good — proceed.

### Step 2: create the fail-closed helper

Create `supabase/functions/_shared/askq/showScope.ts` — no Deno/esm.sh imports,
so vitest can load it:

```ts
// Tenant scope filter for the AI assistant's data tools. These tools run with a
// SERVICE-ROLE client that bypasses RLS, so this is the ONLY tenant guard —
// it must fail closed. `Q` is any Supabase query exposing `.eq()`.
export interface ShowScope {
  licenseKey?: string;
  showId?: string;
}

// A UUID that no real row uses — forces zero rows when scope is unresolved.
const IMPOSSIBLE_SHOW_ID = '00000000-0000-0000-0000-000000000000';

export function applyShowScope<Q extends { eq(column: string, value: unknown): Q }>(
  query: Q,
  scope: ShowScope
): Q {
  if (scope.showId) {
    return query.eq('show_id', scope.showId);
  }
  if (scope.licenseKey) {
    return query.eq('license_key', scope.licenseKey);
  }
  // Fail closed: an unresolved scope must return NO rows. Returning the query
  // unfiltered here leaked every club's entries via the service-role client.
  return query.eq('show_id', IMPOSSIBLE_SHOW_ID);
}
```

**Verify** the test now passes:
`cd apps/myk9show && npx vitest run supabase/functions/_shared/askq/showScope.test.ts`
→ all 3 pass, including the fail-closed case.

### Step 3: use the extracted helper in `toolExecutor.ts`

In `supabase/functions/_shared/askq/toolExecutor.ts`:
1. Delete the inline `applyShowScope` function (lines 13–22) **and** the inline
   `ShowScope` interface (lines 7–11).
2. Add an import near the top (after the existing imports):
   `import { applyShowScope, type ShowScope } from './showScope.ts';`
   (Keep the `.ts` extension — sibling edge-function imports use it, e.g. line 3
   `from './ruleLookup.ts'`.)
3. Leave every call site (`applyShowScope(query, scope)`) unchanged — the
   signature is identical.

**Verify**: `pnpm typecheck` → exit 0. `pnpm lint` → exit 0.
Then `grep -n "function applyShowScope" supabase/functions/_shared/askq/toolExecutor.ts`
→ **no matches** (the inline copy is gone).

## Test plan

- New file `showScope.test.ts` with the three cases above; the third
  (`fails closed`) is the regression guard and must be present and green.
- Structural pattern: `apps/myk9show/supabase/functions/_shared/cartOverflowRefund.test.ts`.
- Full run: `cd apps/myk9show && pnpm test` → passes, including the 3 new cases.

## Done criteria (ALL must hold)

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `cd apps/myk9show && npx vitest run supabase/functions/_shared/askq/showScope.test.ts` → 3 pass
- [ ] `grep -n "function applyShowScope" supabase/functions/_shared/askq/toolExecutor.ts` → no matches
- [ ] `grep -n "return query;" supabase/functions/_shared/askq/toolExecutor.ts` → no match on the old fail-open line
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row for 001 updated

## STOP conditions

- The `applyShowScope` body in the live file differs from the "Current state"
  excerpt (someone already changed the scoping) — STOP and report.
- `toolExecutor.ts` turns out to call `applyShowScope` with a scope object of a
  different shape than `{ showId?, licenseKey? }` — STOP.
- Any show-data tool (`get_class_summary`, `get_entry_results`,
  `get_trial_overview`, `search_entries`) turns out **not** to route through
  `applyShowScope` — that is a *second* leak; STOP and report it rather than
  patching ad hoc.

## Maintenance notes

- **This helper is a security boundary.** Any *new* AI tool that reads tenant
  data must call `applyShowScope`. A reviewer should reject a new
  `serviceClient.from('<tenant table>')` in `toolExecutor.ts` that doesn't.
- Deployment is out of scope here: after merge, a human must
  `supabase functions deploy ask-myk9show` (per project deploy rules) for the fix
  to take effect in staging/prod. Note that in the PR description.
- Follow-up deferred: the impossible-UUID sentinel is a pragmatic fail-closed.
  A stricter design would have `executeTool` refuse scoped tools outright when
  `scope` is empty and return a "pick a show first" message to the model —
  cleaner UX, larger change. Left for later.
