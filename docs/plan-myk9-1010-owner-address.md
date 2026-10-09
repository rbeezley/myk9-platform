# Require the owner's address on AKC entries (MYK9-1010)

> **Status:** Active

AKC Scent Work Regulations Ch.3 §36 item 8 requires the owner's address for every dog in the marked catalog. Since #2742 onboarding collects an address, but nothing stops an entry for a dog whose owner has none. Live, on 2026-10-08, 5 of 42 dog owners had no street address and 4 had no city, state or ZIP.

## Owner decisions (2026-10-08)

- **Scope:** AKC trials only. The check is per trial, through `getTrialRegistry` (a blank registry is treated as AKC), so UKC and ASCA trials in the same show are unaffected.
- **Required parts:** all four, `street_address`, `city`, `state` and `zip_code`, non-blank after trim. This matches onboarding.
- **Enforcement:**
  - Block online and mail-in entries. Warn, but do not block, on staff day-of entries.
  - Move-ups and waitlist promotions are not refused, because the dog is already entered.
  - The catalog's "No address on file" flag (MYK9-1009) catches anything that slips through.

## Design

### Where the check lives

| Path | Check | Why |
| --- | --- | --- |
| Class selection, all wizard paths | Client: an AKC class is blocked with "Add the owner's address" and an in-place fix, as a sibling of `getRegistrationPrerequisite` (`RegistrationWorkflow/registrationPrerequisite.ts`, applied at `ClassSelectionStep.tsx` ~606). | This is the existing per-class, per-registry block pattern, so no new UI concept. |
| Mail-in / organizer / non-card exhibitor submit | Server: `submit_show_entries` refuses an AKC line whose dog's owner lacks an address, with a coded error. | It is the single SECURITY DEFINER RPC for this path. A trigger cannot tell this path from day-of. |
| Card checkout | Server: `stripe-checkout` refuses the cart **before** creating the Checkout Session. | The entry is created only after payment (`create_online_paid_entry`). A refusal there would be a charge with no entry (MYK9-963). |
| Staff day-of (`submitOfflineLateEntry`) | Client warning only. | The entry is written locally and synced later, so a server refusal at the ring is unacceptable. |
| Move-up, waitlist promotion | None. | The same dog is already entered, and the catalog flags it. |

No `entries` trigger is added: a trigger would also refuse day-of syncs, move-ups and fixtures.

### Data

- Add `street_address, city, state, zip_code` to the owner select in `services/database/dogs/reads.ts` (owner select ~53 and the embed ~259) and to the `Owner` type (`types/dog-types.ts`). `catalogProfiles.ts` already reads these columns, so the grants are known to work.
- One shared predicate, `ownerAddressMissingParts(owner)`, returns the missing parts. Client and copy use it. The SQL predicate in the RPC and the edge function mirror it.

### The in-place fix

The block links to where the address is edited:

- for an exhibitor, `/account?section=profile`;
- for staff, the owner's `UserEditPanel`, as on `/people/:id`.

Reuse the inline fix pattern of `useInlineDogRegistration` if it fits. Otherwise use a link that returns to the wizard. After the save, the owner data refetches and the class unblocks.

### Server details

- `submit_show_entries`: `CREATE OR REPLACE` from the **latest** definition (`20261007205300…sql`). Add the check before the insert loop, for lines whose trial resolves to AKC. Raise a coded error (`SQLSTATE 23514`, a message naming the dog and the missing parts). Map the code in the client's error surface.
- `stripe-checkout`: after `loadCheckoutCart`, resolve each line's trial registry and its dog's owner address, and return 4xx `owner_address_required` with dog and part details before any Stripe call.
- Migration timestamp: pick against origin/main and the live ledger, with an odd time.

## Out of scope

- A country field.
- Non-US address formats.
- UKC/ASCA rules.
- Backfilling the 5 existing owners: they are prompted the next time they enter.

## Phases and testing

1. **Data + predicate.** Owner address in reads and the type, plus `ownerAddressMissingParts`. *Tests:* unit tests for the predicate, and a mapper/read test showing the fields reach `Owner`.
2. **Client block.**
   - Class-selection prerequisite for AKC trials, with copy and a fix link.
   - A day-of warning in the staff late-entry path.
   - *Tests:* render ClassSelectionStep with an AKC trial and an addressless owner (blocked, message names the missing parts), the same with a UKC trial (not blocked), and with a complete address (not blocked). The day-of path warns but submits.
3. **Server: `submit_show_entries`.** The migration. *Tests:* the src/test/database contract suite, plus a behavioral SQL test under `supabase/tests/` (CI only) covering an AKC refusal, a UKC pass, and a complete address passing.
4. **Server: `stripe-checkout`.** The pre-payment refusal. *Tests:* a function test under `// @vitest-environment node` showing the AKC addressless cart is refused before any Stripe call and a UKC cart proceeds.
5. **Verification and ship.**
   - Full typecheck, lint, ratchet, and a shuffled app suite.
   - Codex review (independent tier: migration plus a payments edge function).
   - After merge: `supabase db push`, deploy `stripe-checkout`, and the frontend deploy. Each needs owner approval.
