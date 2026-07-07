## Context

`people` and `clubs` are core directory tables that many workflows reference: entries, dogs, judges, show managers, club access requests, Stripe accounts, support diagnostics, and show creation. Duplicates in either table make secretary work harder because the correct row becomes a judgment call under time pressure.

The dog identity change `prevent-duplicate-dog-identities` established a useful pattern:

- normalize exact identity values in the database;
- inventory existing duplicates before adding unique indexes;
- make create operations duplicate-aware instead of relying only on raw constraint errors;
- surface likely matches inside existing creation flows.

Current people state:

- `people_email_unique` already enforces a partial case-insensitive unique index on non-deleted email rows.
- `handle_new_user()` already links an unclaimed existing people row by email during signup.
- `UserCreationPanel` warns from loaded people by exact full name or email.
- `CreateExhibitorDialog` still checks mock people data, so one registration surface can miss real duplicates.
- `ShowDetailsStep` official creation reuses existing people by email, but the logic is local to that hook.

Current club state:

- `clubs` has only a non-unique name index.
- `createClub` is a direct PostgREST insert.
- Show wizard host-club creation and the club creation panel can create duplicate clubs when spelling/case/spacing differs.

Offline-first impact: club rows are read through the replicated club table in core app paths, but club creation still syncs to Supabase. People directory reads are gated and online-backed for management surfaces after SA-008. Exact prevention therefore belongs in Supabase and should be mirrored by existing loaded-data candidate helpers for calm UX. No new offline queue is required in this slice.

Role intent: secretary-facing creation flows should preserve "That was easy" by preventing duplicates before they become cleanup work; exhibitor-facing quick-create should preserve "This respects my time" with plain reuse options rather than technical errors; site-admin directory work remains "Standard operations."

## Goals / Non-Goals

**Goals:**

- Prevent duplicate live clubs by normalized exact name at the database layer.
- Keep the existing `people_email_unique` behavior as the exact people guardrail and make all people create flows use it consistently.
- Add shared TypeScript helpers for normalizing and scoring people and club identity candidates from loaded data.
- Make club creation duplicate-aware so existing authorized clubs can be returned/reused.
- Replace mock/per-surface duplicate detection with shared helpers in existing creation surfaces.
- Translate exact duplicate conflicts into calm, plain copy.

**Non-Goals:**

- No new duplicate-management page, merge center, cleanup dashboard, or bulk merge tooling.
- No database uniqueness on people names, phones, or addresses.
- No historical data merge in the app UI.
- No external organization or identity verification service.
- No change to dog duplicate handling beyond reusing its pattern.

## Decisions

1. **Use normalized exact keys only where the real-world identity is strong enough.**

   Clubs get a normalized live-row name uniqueness guard because two active clubs with the same normalized name are almost always accidental in this product context. People keep email as the exact DB key because names, phones, and addresses are not reliable enough to block at the database layer.

   Alternative considered: add a unique index on normalized people full name plus phone or ZIP. Rejected because family members, shared phone numbers, typo corrections, and mail-in data make false blocks too likely.

2. **Add a duplicate-aware club create RPC instead of only changing client checks.**

   Rationale: direct UI checks can race and do not protect RPCs, scripts, or future surfaces. A `create_or_reuse_club` RPC can normalize the requested name, return an existing live club id when visible/authorized, and otherwise insert atomically.

   Alternative considered: update `createClub` to run `checkClubNameExists` before insert. This improves one surface but still leaves races and direct inserts.

3. **Keep people exact duplicate handling centered on email.**

   Rationale: the database already has `people_email_unique`, and signup already links existing secretary-created people by email. The next improvement is consistency: shared helper functions, shared error translation, and no mock duplicate source.

   Alternative considered: create a `create_or_reuse_person` RPC for every person insert path. This may be useful later, but the existing email unique index plus localized role/credential side effects make a broad RPC higher risk than needed for this slice.

4. **Use loaded-data candidate helpers for likely matches.**

   Rationale: likely duplicates are UX guidance, not data integrity. Helpers such as `findLikelyDuplicatePersonCandidate` and `findLikelyDuplicateClubCandidate` can score loaded rows and return reasons without creating a new surface.

   Alternative considered: server-side fuzzy matching functions. Rejected for this pre-launch slice because they add query/RLS complexity and are unnecessary when the relevant management surfaces already load scoped people/clubs.

5. **Resolve inside existing surfaces.**

   Rationale: this is consolidation work. The affected surfaces are `UserCreationPanel`, `CreateExhibitorDialog`, `useShowDetailsStepActions`, `ClubCreationPanel`, and the `createClub` database/query layer. A link to another page is not enough because the duplicate is introduced at create time.

## Risks / Trade-offs

- Existing duplicate club rows may block the unique index. Mitigation: include a read-only inventory query in the migration and fail clearly until an operator resolves duplicates.
- Normalized club names may collapse legitimate regional chapters. Mitigation: normalize case/spacing/punctuation only; if a real duplicate-name business case appears, handle it before applying the migration rather than silently allowing ambiguity.
- Candidate matching can show false positives. Mitigation: require explicit user confirmation and use "looks like" language.
- Candidate matching can miss duplicates. Mitigation: exact email and exact normalized club-name constraints remain authoritative.
- Returning an existing club from create may surprise callers expecting a fresh row. Mitigation: invalidate/refetch club lists and use plain notifications when a create operation reuses an existing club.
- People email uniqueness can still reject a create after loaded data missed the row due to RLS or stale cache. Mitigation: translate the unique violation to a plain message and prompt the user to search/use the existing person.

## Migration Plan

1. Add club normalization SQL helper(s) and a read-only duplicate inventory query in the migration header.
2. Add a partial unique index for normalized live club names after the inventory guard passes.
3. Add `create_or_reuse_club` with authorization that mirrors current club insert policy and returns the existing matching club id/row when appropriate.
4. Keep `people_email_unique` as-is; add any missing comments/tests that pin email as the only exact people DB identity key.
5. Add shared TypeScript identity helpers for people and clubs.
6. Wire helpers into existing creation flows; remove the mock duplicate source from `CreateExhibitorDialog`.
7. Run focused utility/hook/component tests and relevant typecheck.
8. Before staging DB push, run the club duplicate inventory query and request explicit approval for the shared database mutation.

Rollback: drop the new club unique index/helper/RPC and restore `createClub` to direct insert if the migration exposes unexpected production data conflicts. App-side helper changes should continue to work as advisory checks without the RPC.

## Open Questions

- Should normalized club uniqueness include website domain as a secondary exact key, or should website/domain remain a likely-match signal only for the first slice?
- Should club name normalization remove suffixes such as "Inc", "LLC", or "Club", or is that too aggressive for launch?
- Should `create_or_reuse_club` return only an id or the full club row to minimize follow-up fetches?
