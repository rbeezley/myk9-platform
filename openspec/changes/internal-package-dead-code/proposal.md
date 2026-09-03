## Why

Complete the deferred internal-package portion of MYK9-328 and the existing P3 batch. Removing verified-unreachable exports reduces maintenance risk before fall 2026; removing inert wall-clock expiry preserves reliable show-day replica reads.

Original continuation: "Continue". Owner compatibility decision, verbatim: "Internal" in response to whether `@myk9/*` packages have consumers outside this repository. Current request: "please implement and Complete 328". This authorizes treating these packages as internal-only for reachability decisions, not deleting live APIs.

## What Changes

- **BREAKING (unused internal APIs only):** re-check and remove unreachable package exports, implementation clusters, and tests dedicated solely to removed APIs. Trim barrels and document retained live consumers.
- Remove inert replication TTL plumbing without wiring expiry, changing sync/deletion semantics, or clearing stored data.
- Complete the issue's types-only email option: remove unused React renderers/tokens, retain app data types and existing Edge Function renderers. Keep production-content assertions from the former parity tests; production builders are the sole rendering authority.
- Update the existing inventories and batch plan with per-symbol evidence, owner decision, and actual verification.

No existing UI surface is duplicated or added. The mounted `/at-show` and secretary workflows remain the consumers; no new link or UI is needed for unreachable code removal.

## Capabilities

### New Capabilities

None. This is behavior-preserving removal of unreachable internal APIs; `skip_specs: true` is intentional.

### Modified Capabilities

None. Existing show-day reads, mutations, error handling, authorization, and live scoresheet behavior must be preserved.

## Impact

Candidate packages: scoring, scoring-ui, ringside, ui, email, core, notifications, secretary, replication. The supabase subset already shipped and will not be repeated. Scope comes from MYK9-328 plus fresh references, not stale zero-count claims. No DB migrations, Supabase deployments, remote writes, legacy-repo changes, new features, or new cache policy. PR publication/merge and external tracking remain gated separately.
