# MYK9-691 Premium Style Persistence Design

## Purpose

Allow an authorized show manager to preview and save an entitled Premium presentation style from the existing show Preview without risking unrelated show data or changing the already-published public snapshot.

## Context

The Preview UI and shared style selector already satisfy most visible behavior. Preview is the sole style editor; Settings links to it rather than duplicating the control. The persistence boundary must avoid rebuilding a full database row from the intentionally lossy app-level `Show` model: doing so can change status or overwrite payment, handler, capacity, and other fields omitted by the mapper.

Style save is explicitly online-only. Offline queuing would create a second write contract, durable projection and rollback lifecycle, and difficult semantics when the session changes or an RPC response is lost. The feature therefore does not claim to provide offline persistence or immediate convergence across every local reader.

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

A `BEFORE UPDATE OF style` trigger rejects invoker-level direct table updates, so the existing table grant cannot bypass the RPC's authorization and Premium gate. The RPC does not publish an experience snapshot; publication remains the responsibility of the existing publish flow.

### 2. Save is online-only and bound to the initiating owner

The Preview save command receives the displayed `Show`, selected `ShowStyle`, and initiating owner ID. It does not receive a React Query client and does not write a replica row or query cache.

Before the RPC, the command verifies that the network is available, the active session still belongs to the initiating owner, and the show has no pending local mutations. Because this preflight is asynchronous, it verifies the owner again immediately before sending the session-bound RPC. It validates the returned replication version and verifies the owner again after the RPC. If the session changes after submission, the command reports that the style may already have been saved and does not request sync in the new account's context.

After an acknowledged RPC under the same owner, it dispatches the established `replication:sync-requested` event. The regular show synchronization observes the RPC's updated timestamp/version and refreshes the replica. Other screens may continue showing their previous value until that sync completes; no immediate local convergence is claimed.

Generic show updates continue to exclude style from their payloads so a stale form cannot overwrite the dedicated style command. If unrelated local show changes are pending, Save asks the user to sync those changes first. If the RPC rejects or its response is ambiguous, the UI does not claim the old style definitely remains saved; it asks the user to sync/reload before retrying.

### 3. Preview owns transient selection and acknowledged current-page state

The page keys `ShowPublicLanding` by `show.id`. Navigating from show A to show B unmounts A's pending preview state. If A's save finishes later, its completion cannot change B's current or pending style.

The existing interaction contract remains:

- selecting an entitled style changes the preview immediately;
- Save is disabled offline and explains that a connection is required;
- Cancel restores the persisted draft selection without making a request;
- an acknowledged save commits the style in the mounted Preview only;
- a failed or ambiguous save presents uncertainty-aware recovery guidance;
- published shows label draft and published styles separately;
- the public presentation continues using the published snapshot until the existing publish action runs.

## Data Flow

```text
Preview selection
      |
      v
local pending style (render only)
      |
    Save (online; owner + clean-row preflight)
      |
      v
session-bound update_show_style RPC
      |
      +--> update shows.style only; advance updated_at/version
      |
      +--> verify initiating owner still active
      |
      +--> dispatch replication:sync-requested
      |       |
      |       +--> established show sync refreshes the replica
      |
      v
mounted Preview commits acknowledged style

other local readers update when normal sync completes
existing publish flow -----------------------> published snapshot
```

## Alternatives Rejected

### Offline queue and style projection

Rejected because it adds a feature-specific projection, queued RPC lifecycle, durable rollback semantics, and auth-switch hazards to generic replication machinery. MYK9-691 does not require offline acceptance, so that complexity is not justified.

### Direct PostgREST update

Rejected because the narrow RPC is the authorization and Premium-entitlement boundary and preserves unrelated columns by construction.

### Immediate replica or query-cache reconciliation

Rejected because a direct write to shared local replica/cache state can race with account changes and queued show mutations. The acknowledged Preview can update its own mounted state safely; other readers converge through the established sync path.

## Testing

- SQL behavioral test: valid manager writes, Monogram without Premium, Premium rejection, unrelated-column preservation, cross-club denial, anonymous denial, invalid-style rejection, returned version, and rejection of a raw authenticated `shows.style` UPDATE. The script is present but has not been run locally because no Postgres runtime is available.
- Persistence command tests: offline save makes no RPC or mutation; exact RPC arguments; pending-change precondition; owner change during preflight makes no RPC; RPC rejection and ambiguous failure; owner change after submission does not request sync; acknowledged same-owner save dispatches the sync event and performs no replica or cache write.
- Preview/page tests: default, entitlement filtering, live preview, online Save, offline disabled state, Cancel, error recovery, draft-versus-published labels, and navigation during an in-flight save.
- Focused tests run red before implementation, then green; final validation includes shuffled app tests for touched files, typecheck, lint/format, OpenSpec strict validation, migration guard, and the code-quality ratchet.

## Deployment

The migration ships in the PR but is never applied from the feature branch. After merge, applying it to the linked Supabase project requires the normal explicit shared-system approval. The app path may ship only with the RPC migration in the same merged change; otherwise online saves would fail until the function exists.

## Non-goals

- Offline style persistence or a feature-specific mutation queue/projection.
- Immediate replica or cross-screen cache convergence after Save.
- Adding styles, products, pages, dialogs, or a second style editor.
- Publishing or regenerating Premium artifacts when Save draft is clicked.
- Generalizing every show update into a new partial-update framework.
- Repairing unrelated legacy full-row show mutations.
