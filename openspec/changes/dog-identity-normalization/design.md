## Context

This change came out of the 2026-07-24 exhibitor role-journey audit ([`docs/ux-audits/exhibitor-elderly-novice-2026-07-24.md`](../../../docs/ux-audits/exhibitor-elderly-novice-2026-07-24.md)) and the product-owner clarifications recorded on MYK9-88. It is the data-model half; the presentation half stays with `exhibitor-ux-remediation`.

### Domain model (from the product owner)

- A dog has **one call name** — "Tera".
- A **registered name belongs to a registration with an organization** — "Maia TeraByte Van Neerland" with AKC. Usually the same across organizations, not guaranteed.
- **Breed likewise belongs to the registration.** A dog with no registration has no breed, and the app must not guess one.
- A registration is **optional when adding a dog** — you may add a dog now and register later. Registration is required **when entering a show**, except puppies in conformation.

### What the database actually contains (verified 2026-07-24)

| Query                                                                  | Result                               |
| ---------------------------------------------------------------------- | ------------------------------------ |
| Dogs (not deleted)                                                     | 15                                   |
| With `akc_number` / `ukc_number` / `other_registry_number`             | **0 / 0 / 0**                        |
| With `call_name`                                                       | 15                                   |
| Where `name = call_name`                                               | **13**                               |
| `dog_registrations` rows                                               | 8, across 6 dogs and 4 organizations |
| Registrations with `registration_number` / `registered_name` / `breed` | 8 / 7 / 7                            |
| Dogs holding registrations with more than one organization             | **1**                                |

Three conclusions, none inferred:

1. The flat `dogs.*_number` columns are **completely empty**. Every reader of them returns `NULL` for every dog.
2. `dogs.name` is in practice a copy of the call name (13/15), written to satisfy `NOT NULL`.
3. `dog_registrations` is the table that actually holds identity data — and the **multi-organization case is already live**, so breed resolution is not hypothetical.

### The correctness defect this unblocks

[`useAKCSubmissionData.ts:213`](../../../apps/myk9show/src/hooks/queries/useAKCSubmissionData.ts) and [`buildEntryBlankProps.ts:233`](../../../apps/myk9show/src/features/heritage/entry-blank/buildEntryBlankProps.ts) both map `registrationNumber: dog?.akc_number ?? null`. Given the table above, **every AKC submission and every printed entry blank currently carries a blank registration number.** [`reads.ts:575`](../../../apps/myk9show/src/services/database/dogs/reads.ts) searches the same empty column, so no dog is findable by registration number.

This is the highest-severity item the audit produced and the reason to do this change now rather than after launch.

## Goals / Non-Goals

**Goals**

- One home per identity attribute; no column holds a placeholder for a value the owner did not supply.
- Official paperwork carries the real registration number for the sanctioning organization.
- A dog can still be created with no registration, and completed later.

**Non-Goals**

- Exhibitor-facing UX (owned by `exhibitor-ux-remediation`).
- Registry-specific validation rules, or the sport/registry mapping layer.
- Any new UI — `AddEditRegistrationDialog` already exists.
- Backwards-compatibility shims. Pre-launch, no real users.

## Decisions

### 1. Delete the flat registry columns rather than backfilling them

They hold nothing (0/15), so there is no data to preserve and no migration risk in dropping them. The work is entirely in the three readers, which must move to `dog_registrations` filtered by the relevant organization.

**Rejected:** keeping them as a denormalized cache synced by trigger. It would add write-path complexity to keep a second copy of data that already has an authoritative home, and the audit's whole finding is that duplicated identity storage is what produced the defect.

### 2. Breed resolution — explicit rule, applied through one helper

- **Organization-scoped surfaces** (entry paperwork, submissions, registry-specific views) use the breed on the registration **for that organization**. No fallback: if that registration has no breed, the surface shows none.
- **Generic surfaces** (My Dogs, dog search, entry summaries) have no organization in context. Rule: **use the dog's primary registration**, defined as the registration the owner marks primary, defaulting to the earliest-created when unmarked.

**Why primary rather than "most recent" or "any":** the multi-organization case already exists in the data, and "any" would let a dog's breed change between page loads as row order shifts. "Most recent" makes the displayed breed jump when an unrelated second registration is added. An explicit primary is stable and explainable to the owner.

**This needs a `primary` flag on `dog_registrations`** — one boolean, with a partial unique index so at most one registration per dog is primary. That is the only column this change adds.

**Rejected:** re-deriving breed onto `dogs` as a denormalized display column. It reintroduces exactly the duplication being removed.

### 3. A dog with no registration displays no breed

Not "Unknown", not "Mixed Breed", not "Breed not set" as a stored value — the attribute is absent and surfaces render their empty state. This is the product owner's decision and the reason the change exists: a stored guess is a claim about someone's dog, and it travels into paperwork.

`dogs.breed` therefore drops. Because ~258 read sites reference it, the sequencing matters — see Migration Plan.

### 4. `call_name` becomes the required identifier; `dogs.name` retires

`call_name` is populated for all 15 dogs, so `SET NOT NULL` is safe after a defensive backfill from `name`.

For `dogs.name` itself there are two options:

| Option                                                                            | Verdict                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drop `name`, use `call_name` everywhere                                           | **Rejected for this change.** `name` is referenced widely, including in the duplicate-identity guard and RPCs. Dropping it multiplies blast radius for no correctness gain. |
| **Keep `name` as a nullable legacy alias, stop treating it as "registered name"** | **Chosen.** Update its column comment, stop writing the call name into it, and let it become empty for new dogs. A later cleanup can drop it once no reader remains.        |

The behavioral change — that nothing presents `dogs.name` as a registered name — is delivered by `exhibitor-ux-remediation`; this change makes the storage honest.

### 5. Duplicate-identity guard must move with the data

`20260707120000_prevent_duplicate_dog_identities.sql` normalizes identity values for matching. Once registered name and breed live on the registration, that guard must match on registration-scoped values or it will silently stop catching duplicates — a regression that would be invisible until two dogs collide at a show. This is why `dog-identity-deduplication` is listed as a modified capability rather than left alone.

## Risks / Trade-offs

- **Paperwork is the highest-risk surface.** These documents go to sanctioning organizations. The change makes them go from _always blank_ to _populated_, which is strictly better, but it must be verified with a real registered dog before anyone relies on it.
- **~258 `.breed` read sites** is the bulk of the work. Most are display-only and resolve to the shared helper, but the count is large enough that a staged rollout (helper first, column drop last) is the only safe order.
- **`dogs` is a replicated table.** Column changes must land in the replication mappers and the PostgREST fallback path together, or offline reads diverge from online ones. The IndexedDB cache must also tolerate rows written under the old shape.
- **The `primary` flag is new surface area**, which this phase generally resists. It is justified because the multi-organization case already exists in production data and the alternative is unstable breed display. It is one boolean on an existing table, not a new page.
- **Two changes touch the dog record concurrently.** `exhibitor-ux-remediation` edits the same forms. Sequencing is stated below.

## Migration Plan

Ordered so that no step leaves the app reading a column that no longer exists.

1. **Add** `dog_registrations.is_primary` with a partial unique index; backfill the earliest registration per dog as primary.
2. **Introduce the resolution helpers** (organization-scoped and generic) and migrate read sites to them while `dogs.breed` still exists. No behavior change yet.
3. **Repoint the paperwork and search readers** at `dog_registrations`. Verify AKC submission and entry blanks carry a real registration number.
4. **Drop** `dogs.akc_number`, `ukc_number`, `other_registry`, `other_registry_number` — nothing reads them by now, and nothing ever wrote them.
5. **Backfill** `call_name` from `name` where null; `SET NOT NULL` on `call_name`. Update `dogs.name`'s comment; stop writing the call name into it.
6. **Make `dogs.breed` nullable**, stop writing the `"Mixed Breed"` placeholder, then drop the column once step 2's helpers own every read.
7. **Update the RPCs and the duplicate-identity guard** in the same migration as the column changes.

Steps 1–3 are additive and independently shippable. Steps 4–7 are the breaking half and need the shared-system approval gate before `db push`.

**Sequencing against `exhibitor-ux-remediation` (MYK9-88):** that change is migration-free and can land first or in parallel through step 3. Its task 2.1 (keep the placeholder out of every read path) is the natural precursor to step 6 — once nothing surfaces the placeholder, dropping the column is mechanical.

## Open Questions

1. **Is `is_primary` owner-set or purely derived?** Design assumes owner-settable with an earliest-created default. If registrations should never require that choice, the default alone is sufficient and the UI control can be omitted.
2. **Should `dogs.name` be dropped in a later cleanup, or kept permanently as a display alias?** Deferred until step 5 shows how many readers remain.
3. **Do any reports, exports, or edge functions read the flat registry columns?** The audit covered app source only. Confirm across `supabase/functions/` and report templates before step 4.
