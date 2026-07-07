## Context

`dogs` is the canonical animal table. `dog_registrations` stores per-organization registration numbers with `UNIQUE(dog_id, organization)`, but does not prevent the same organization/number from being attached to multiple live dog rows. `dogs.microchip_number` already has a live-row unique index, but microchips are optional and many show workflows rely on registry numbers.

Dog creation currently flows through existing surfaces:

- `AddDogPanel` maps form data to `DogInput`.
- `useDogStoreCompat.addDog` writes a local replicated dog row, then calls `create_dog_with_registrations` when registrations exist.
- Dog Details registration panels call `createRegistration` / `updateRegistration`.
- `syncDogRegistrations` updates or creates per-dog organization rows when a dog edit includes registration changes.

The UX intent is exhibitor "This respects my time" and secretary "That was easy". Duplicate prevention must avoid a new management surface and must not make users learn a separate cleanup workflow during entry creation.

Offline-first impact: dog rows are part of the local-first/replication read path, but `dog_registrations` writes currently depend on Supabase. Exact duplicate enforcement therefore lives in Supabase and is surfaced through existing mutation errors or RPC results; local optimistic writes must roll back when the server rejects an exact duplicate. Likely-match suggestions can be based on currently loaded data and treated as assistance, not the source of truth.

## Goals / Non-Goals

**Goals:**

- Prevent exact duplicate live dog registry numbers at the database layer.
- Normalize organization and registration numbers consistently before uniqueness checks.
- Make `create_dog_with_registrations` atomic and duplicate-aware.
- Let users add a new organization registration to an existing dog when the entered information appears to match that dog.
- Keep Add Dog and Dog Details as the only user-facing surfaces.

**Non-Goals:**

- No new duplicate-review page, merge center, or secretary cleanup dashboard.
- No automated cross-organization merge without user confirmation.
- No external AKC/UKC lookup.
- No historical cleanup migration that rewrites existing duplicate records before the app ships this prevention path.

## Decisions

1. **Use normalized generated columns or immutable normalization functions plus a partial unique index.**

   Rationale: exact registry duplicates are data integrity, not just UI validation. The uniqueness key must ignore case, spaces, and common punctuation differences so `DN12345678`, `dn 12345678`, and `DN-12345678` compare the same when the organization is the same.

   Alternative considered: validate only in React Query hooks. Rejected because secretaries, RPCs, and direct table writes could still create duplicates.

2. **Keep one canonical `dogs` row per real dog and attach multiple `dog_registrations` rows.**

   Rationale: entries, armbands, check-in, exports, and results history already point at `dog_id`. Creating one dog row per registry would fragment show-day behavior.

   Alternative considered: add a new `dog_identity` parent table and let multiple dog profile rows point to it. Rejected for this slice because it adds more surface area and migration risk than needed pre-launch.

3. **Make exact duplicate creation return a typed result instead of relying only on raw constraint errors.**

   Rationale: `create_dog_with_registrations` is already the atomic path for dog plus registration creation. It can search for exact existing registrations before insert and respond with the existing `dog_id`, allowing the UI to attach or select it calmly.

   Alternative considered: let the unique constraint throw and translate the error. This remains the final safety net, but a typed result gives better copy and less brittle control flow.

4. **Use soft candidate matching for cross-organization duplicates.**

   Rationale: AKC and UKC numbers cannot prove same-dog identity by themselves. Strong cues such as owner, registered name, call name, breed, sex, DOB, and microchip can suggest a match. The app must ask before adding a new organization registration to an existing dog.

   Alternative considered: auto-link when owner and registered name match. Rejected because legitimate littermates or similarly named dogs can exist.

5. **Do not bypass existing surfaces.**

   Rationale: this is a consolidation-phase change. Add Dog and Dog Details are already the natural places where users enter registry numbers.

## Risks / Trade-offs

- Existing duplicate rows may block adding the unique index. Mitigation: migration should detect duplicates and either fail with a clear diagnostic query/comment or create the index only after a documented cleanup step.
- Normalization may collapse two numbers a registry treats differently. Mitigation: normalize only case, whitespace, and common separators; keep the original display value unchanged.
- Local-first Add Dog can briefly show a dog that later rolls back on exact duplicate. Mitigation: the existing rollback path in `useDogStoreCompat.addDog` already deletes the local dog on server failure; keep that behavior.
- Candidate matching can miss duplicates. Mitigation: exact registry and microchip checks remain authoritative; soft matching is a convenience layer only.
- Candidate matching can show false positives. Mitigation: require user confirmation and use plain copy that says "looks like" rather than asserting certainty.

## Migration Plan

1. Add normalization helpers and exact-duplicate database constraints with a preflight duplicate detection query in migration comments.
2. Update `create_dog_with_registrations` to check exact registrations before inserting the dog and registrations.
3. Update TypeScript database types/RPC expectations manually if generated types are not refreshed in this slice.
4. Add data access helpers for exact registration lookup and likely same-dog candidates.
5. Wire duplicate-aware handling into existing Add Dog and registration surfaces.
6. Run focused unit tests and relevant typecheck.
7. Before staging DB push, run a dry-run or duplicate inventory query and request explicit approval for the shared database mutation.

Rollback: drop the new unique index/columns/functions and restore the previous RPC body if the migration causes unexpected production data conflicts. App-side changes should continue to handle raw uniqueness errors if the typed RPC result is unavailable.

## Open Questions

- Should existing duplicate rows be merged before adding the unique index, or should the migration fail until an operator reviews them?
- Should same-owner be required for cross-organization candidate suggestions, or should secretary/admin roles see candidates across owners for data cleanup?
