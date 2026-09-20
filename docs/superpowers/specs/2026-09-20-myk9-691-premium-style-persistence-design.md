# MYK9-691 Premium Style Persistence Design

## Purpose

Allow an authorized show manager to preview and save an entitled Premium presentation style from the existing show Preview without risking unrelated show data, bypassing offline durability, or changing the already-published public snapshot.

## Context

The Preview UI and shared style selector already satisfy most of the visible behavior. Preview is the sole style editor; Settings links to it rather than duplicating the control. The failed correction path is persistence:

- A cold replicated store was seeded from the app-level `Show` model.
- That model is intentionally lossy relative to the replicated/database row.
- Reconstructing a full row changed values such as `upcoming` to `draft` and could overwrite payment, handler, capacity, and other fields absent from the mapper.
- A generic direct partial mutation is not sufficient because OCC conflict reconciliation can rebuild a queued direct update from the full local row.
- The existing cache synchronizer updates only some query families and inserts the show into caches whose filters may not match.
- A generic show save can carry a stale full-row style and clobber a concurrent style mutation.

This is therefore a persistence-boundary repair, not another UI guard.

## Decisions

### 1. One narrow server command owns style persistence

Add `public.update_show_style(p_show_id uuid, p_style text) returns integer` as a `SECURITY DEFINER` RPC.

The function:

- accepts only the eight canonical style values;
- locks and resolves the target show;
- admits site admins or a club-scoped secretary/club admin for the show's non-null club;
- permits `monogram` without Premium and requires `has_effective_premium_access(get_my_person_id(), now())` for every other style;
- updates only `shows.style` and lets the existing updated-at and replication-version triggers run;
- returns the new integer replication version;
- is executable by `authenticated` only, with `PUBLIC` and `anon` revoked.

A `BEFORE UPDATE OF style` trigger rejects invoker-level direct table updates, so
the existing table grant cannot bypass the RPC's authorization and Premium gate.

The RPC does not publish an experience snapshot. Draft publication remains the responsibility of the existing publish flow.

### 2. Offline replication queues the RPC as a delta

`ReplicatedShowsTable.updateShowStyle(showId, style)` queues an UPDATE mutation whose data is exactly `{ id, style }` and whose RPC arguments are exactly `{ p_show_id, p_style }`.

The mutation is queued with deferred upload. If the replicated row already exists, the table patches that row's style and pending metadata before requesting upload. If the table is cold, it does not synthesize or persist a partial `ReplicatedShow`; the durable queued mutation is sufficient. If the local replica write fails after queueing, the pending mutation is discarded before upload. A permanent RPC rejection restores the clean replica base and warm caches.

Because the queued mutation is RPC-routed, OCC reconciliation never expands it into a full-row `shows` update.

### 3. A feature command returns the current-page view

Create a Premium feature command that accepts the complete `Show` already on screen, the selected `ShowStyle`, and the React Query client. It queues the replication mutation, derives a merged view by changing only `style`, `_syncStatus`, and `_lastModified`, updates every existing show-shaped query cache entry with that partial patch, and returns the merged show.

It never inserts a show into an absent or filtered cache. Statistics caches are left unchanged because style does not affect them.

Covered cache families are detail, list (including filtered list keys), search, club, status, upcoming, date range, entry counts, deleted-show, and public collections.

### 4. Preview async state belongs to one show

The page keys `ShowPublicLanding` by `show.id`. Navigating from show A to show B unmounts A's pending preview state. If A's save finishes later, its completion cannot change B's current or pending style.

The existing interaction contract remains:

- selecting an entitled style changes the preview immediately;
- Save queues the draft style;
- Cancel restores the persisted draft;
- a save failure restores the persisted draft and explains the outcome in plain language;
- a permanent deferred server rejection reconciles the local replica and caches before showing the failure action;
- published shows label draft and published styles separately;
- the public presentation continues using the published snapshot until the existing publish action runs.

## Data Flow

```text
Preview selection
      |
      v
local pending style (render only)
      |
    Save
      |
      v
saveShowDraftStyle(show, style, queryClient)
      |
      +--> ReplicatedShowsTable.updateShowStyle
      |       |
      |       +--> durable RPC mutation: { id, style }
      |       +--> patch warm replica only
      |
      +--> patch existing React Query show entries by id
      +--> return merged current-page Show
      |
      v
Preview commits draft style

background upload --> update_show_style RPC --> shows.style only
existing publish flow -----------------------> published snapshot
```

## Alternatives Rejected

### Repair the full-row mapper

Rejected because every new or omitted show field can recreate the overwrite. A style edit must not depend on a complete cross-layer row mapper.

### Queue a direct partial table update

Rejected because direct UPDATE conflict reconciliation may rebuild the mutation from the full replicated row, recreating the same clobber class. It also cannot enforce Premium entitlement at the write boundary.

### Save online through PostgREST and use replication only when warm

Rejected because the same user action would have different durability and authorization behavior depending on cache warmth and connectivity.

## Testing

- SQL behavioral test: valid manager writes, Monogram without Premium, Premium rejection, unrelated-column preservation, cross-club denial, anonymous denial, invalid-style rejection, returned version, and rejection of a raw authenticated `shows.style` UPDATE. The script is present but has not been run locally because no Postgres runtime is available.
- Replication unit tests: exact delta/RPC payload, deferred upload, warm-row patch, cold-row non-fabrication, and queue failure behavior.
- Feature-command unit tests: merged return value, every show cache family patched, absent caches remain absent, statistics remain unchanged, and persistence failure leaves caches untouched.
- Preview/page tests: default, entitlement filtering, live preview, Save, Cancel, error recovery, draft-versus-published labels, and navigation during an in-flight save.
- Focused tests run red before implementation, then green; final validation includes shuffled app tests for touched files, typecheck, lint/format, OpenSpec strict validation, migration guard, and the code-quality ratchet.

## Deployment

The migration ships in the PR but is never applied from the feature branch. After merge, applying it to the linked Supabase project requires the normal explicit shared-system approval. The app path may ship only with the RPC migration in the same merged change; otherwise queued saves would fail until the function exists.

## Non-goals

- Adding styles, products, pages, dialogs, or a second style editor.
- Publishing or regenerating Premium artifacts when Save draft is clicked.
- Generalizing every show update into a new partial-update framework.
- Repairing unrelated legacy full-row show mutations.
