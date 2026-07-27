## Context

`public.show_passcodes` currently stores one HMAC-SHA256 hash per `(show, role)`. `insert_show_passcodes` and `regenerate_show_passcodes` return plaintexts once, and `ShowAccessCodesCard` keeps those values only in component state. The shared card appears in the creation success overlay, Show Overview, Show Settings, and Show Desk tools, but every visit after creation/regeneration falls into an empty state that implies regeneration is necessary.

The four-character-suffix code space and existing hashes do not provide reversible storage. Existing plaintexts cannot be recovered without brute-forcing up to 1,679,616 candidates per role using the server pepper. A bounded one-time regeneration is safer and operationally clearer than an expensive migration-time recovery attempt.

This is sensitive, auth-adjacent data. It is intentionally online-only and will not enter the replication layer, React Query persistence, IndexedDB, or other offline caches. Initial passcode validation already requires the rate-limited online Edge Function, and the existing copy/print actions remain the offline show-day handoff.

## Goals / Non-Goals

**Goals:**

- Let an authorized show manager revisit the existing card and see all four current codes.
- Let each authenticated show role revisit the show Overview and see the exhibitor code plus its own operational code: exhibitors receive exhibitor only, assigned judges receive judge plus exhibitor, and assigned stewards receive steward plus exhibitor.
- Keep ciphertext inaccessible through direct table reads and perform authorization before decryption.
- Persist new and regenerated values without changing validation hashes, rate limiting, claim stamping, or revocation behavior.
- Give existing hash-only shows an accurate one-time transition state.
- Preserve the secretary intent of “That was easy” by removing unnecessary regeneration and redistribution.

**Non-Goals:**

- Add a new page, dialog, or duplicate access-code surface.
- Show any code to anonymous visitors or authenticated accounts without a qualifying show relationship.
- Show admin codes to judges, stewards, or exhibitors; show judge codes to stewards or exhibitors; or show steward codes to judges or exhibitors.
- Cache plaintext codes for offline use.
- Recover existing plaintexts through brute force.
- Change passcode format, validation, ringside authorization, or the regeneration confirmation.

## Decisions

### Store encrypted plaintext beside the validation hash

Add nullable `passcode_ciphertext bytea` to `public.show_passcodes`. Generation and regeneration continue producing random plaintext and HMAC hashes, and additionally encrypt each plaintext before the row is inserted/upserted.

Encryption uses pgcrypto symmetric authenticated encryption with a domain-separated key derived inside a locked `SECURITY DEFINER` helper from the existing Vault `passcode_pepper`. Domain separation avoids using the raw HMAC key directly for encryption. Pepper rotation already invalidates all hashes and requires regeneration; the same operational event will refresh ciphertext.

Alternative considered: store plaintext. Rejected because a direct table or backup disclosure would immediately expose live ringside credentials.

Alternative considered: deterministically derive codes from show IDs. Rejected because it removes independent randomness, complicates revocation, and restores a legacy model deliberately removed by the current passcode design.

Alternative considered: brute-force legacy hashes. Rejected because it creates an unbounded, expensive migration whose cost scales with every existing role row.

### Retrieve through one audience-scoped RPC

Add `get_show_access_codes(p_show_id uuid)` as `SECURITY DEFINER`, revoke it from `public`/`anon`, and grant execution only to `authenticated`.

The RPC determines the audience exclusively from `auth.uid()`:

- Existing passcode-management authorization returns all four role rows.
- An assigned judge receives the judge and exhibitor rows.
- An active show steward grant receives the steward and exhibitor rows.
- An active show exhibitor—handler, owner, or co-owner of a non-deleted entry whose lifecycle matches the client `isActiveSubmittedEntryStatus` projection and whose check-in status is not `pulled`—receives the exhibitor row.
- A caller with more than one qualifying relationship receives the union of those role rows.
- Every other caller receives no rows.

Each returned row includes `role`, nullable decrypted `passcode`, and `recoverable`. Authorization is evaluated before decryption, and the underlying table retains deny-all RLS and no client grants.

Alternative considered: separate per-role RPCs. Rejected because one server-side projection is easier to audit, naturally returns the union for multi-role callers, and prevents the browser from choosing a more privileged endpoint.

**[ADDED]** The SQL predicate uses an explicit allow-list matching the client classifier's pending, accepted, waitlist, in-ring, and move-up-requested raw values instead of a broad “not withdrawn” exclusion. This fails closed for completed, rejected, expired, unknown, absent, moved-source, cancelled, withdrawn, scratched, and pulled rows. Contract tests enumerate both sides so future lifecycle changes must update the browser and RPC together.

### Keep plaintext in component-local memory only

`ShowAccessCodesCard` loads the RPC directly into local state for authenticated users. It does not place values in a shared query cache, persisted store, local storage, IndexedDB, logs, or notifications. The server determines the returned role union; client context controls only whether to render a manager-capable regeneration control.

The RPC remains the security boundary; client audience flags only prevent inappropriate requests and loading states.

Alternative considered: React Query caching. Rejected because cache reuse across role/session transitions adds avoidable secret-retention and cross-audience risk.

### Represent legacy rows without pretending codes are missing

For authorized managers, hash-only rows return their roles with `recoverable = false` and no plaintext. The card explains that these predate saved display and offers one replacement action. After regeneration, all four rows contain ciphertext and every later authorized visit can display them.

Judges, stewards, and exhibitors never receive a destructive action. If their visible role rows are hash-only, the card directs them to the secretary without exposing metadata about roles they cannot view.

### Reuse every existing card placement

The change upgrades `ShowAccessCodesCard` and passes authenticated audience context from `ShowDetailTabs` into `ShowOverviewTab`. The server—not `hasUserEntries` or another client flag—derives the exact role union. Settings and Show Desk continue using the same card with manager audience. No new navigation or page is introduced.

## Risks / Trade-offs

- [Database or backup readers see ciphertext] → Keep direct table access denied, derive the encryption key from Vault only inside locked helpers, and test grants/authorization statically.
- [A compromised database role capable of executing definer helpers could decrypt codes] → Revoke helper execution from `public`, `anon`, and `authenticated`; expose only the audience-scoped getter.
- [Legacy shows require one more regeneration] → Explain why once, persist the replacement set, and never prompt again after successful regeneration.
- [Role authorization drifts from existing show relationships] → Reuse established manager, confirmed/invited judge assignment, active steward grant, and handler/owner/co-owner predicates and cover each audience plus multi-role union behavior in migration contract tests.
- [Plaintexts remain in browser memory while the card is mounted] → Keep state component-local, clear it on unmount naturally, and never log or persist it.
- [Online retrieval is unavailable at a poor-connectivity venue] → Preserve copy and print workflows; do not weaken secret storage or replicate credentials to solve an initial-login path that already depends on online validation.

## Migration Plan

1. Add nullable ciphertext storage and locked encryption/decryption helpers.
2. Replace generation/regeneration functions so every future write stores both hash and ciphertext while retaining stable row IDs and `created_at` revocation semantics.
3. Add and grant the audience-scoped getter.
4. **[ADDED]** Update deterministic demo seed codes to populate ciphertext through the same locked encryption helper, so reset environments exercise the durable display path instead of looking like legacy production data.
5. Deploy the UI after the migration so it can distinguish recoverable and legacy rows.
6. Existing shows transition lazily when a manager intentionally regenerates once.
7. Rollback can remove the getter/UI and leave the additive ciphertext column in place; hashes continue validating independently. Do not drop ciphertext during emergency rollback because doing so would recreate the original operational problem.

## Open Questions

None. The requested role union maps to existing show-management authorization, judge assignments, steward grants, and active-entry ownership rules.
