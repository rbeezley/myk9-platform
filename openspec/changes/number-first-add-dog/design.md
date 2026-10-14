# Design

## Context

See `proposal.md` for the why. The current state that shapes the approach:

- **Add Dog** (`components/panels/edit/AddDogPanel/`) has three gated steps from `DOG_STEP_TABS`: Essential → Registration → Optional. They are gated by `useEditPanelSteps` and the `addDogSchema` issues that `locateInvalidField` maps per step.
  - Registrations are optional.
  - Each registration requires organization, registered name, breed and number.
  - The duplicate check is `findLikelyDuplicateDogCandidate` at **Save**, over `useDogStoreCompat()` dogs.
  - Candidates are filtered to the same `ownerId`, so a cross-owner collision is never seen client-side. It surfaces only as the server's 23505.
  - `findDogByExactRegistrationIdentity` and the normalizers in `utils/dogIdentity.ts` already exist and match the SQL `normalize_dog_registration_*` functions.
- **Visibility.**
  - A secretary's device holds the whole live dog directory (`can_read_dog_directory()`, MYK9-854).
  - An exhibitor's device holds only own, co-owned and handled dogs. `dog_registrations_select` delegates to `dogs_select`.
  - No server function looks a dog up by registry identity.
- **Entry rule.** `entries_require_dog_registration()` (`20260828210000`; SECURITY DEFINER, INSERT only) refuses an entry whose dog lacks a registration for the trial's registry, resolved per trial with blank meaning AKC. The conformation-puppy carve-out is the only exception.
  - `can_manage_trial(trial_id)` (latest `20261004181900`) is the established trial-manager predicate.
- **Exceptions.** `ENTRY_MANAGEMENT_EXCEPTIONS = ['move-ups','pulls','waitlist']` in `entryManagementCockpitParams.ts`. It drives the menu (`entryManagementViews.ts`), URL state and the panes rendered in `EntryManagementPage.tsx`.
- **Paperwork selection** is spread across:
  - `lib/reports/catalogFields.ts` (`catalogRows`, `countCatalogClass`);
  - `buildRunSheetEntries.ts` and `paperScoresheetData.ts` (both via `isOnClassRunList`);
  - pipeline print (`usePipelinePrint` → `print-service`);
  - the SQL `emergency_packet_input`.
- **Lifecycle emails.**
  - Steps are rows in `show_lifecycle_email_steps`, constrained to five `step_type`s on both the steps and jobs tables, and seeded by `ensure_show_lifecycle_email_steps`.
  - Content is drafted client-side (`features/lifecycle-emails/render.ts`), saved as a `ready` job (`save_ready`), then sent by `send-lifecycle-email` (`send`).
  - Decision emails are prompted by `useEntryDecisionLifecycleEmails`.

## Goals / Non-Goals

**Goals:**

- One rule decides "awaiting a registration number", shared by the cockpit, every paperwork builder and the server packet. It is derived, never stored.
- The trigger relaxation is the minimum widening: the trial manager only, and INSERT only as before.
- Offline behavior is unchanged for show-day data. Every client predicate reads data the device already holds for that role.

**Non-Goals:**

- Changing `create_dog_with_registrations` (MYK9-1151 keeps the offline merge residue).
- A received-date column.
- Exhibitor UI for held entries.
- Rate limiting the lookup RPC (see Risks).

## Decisions

### D1. Step order: Registration first, inside the existing panel

`DOG_STEP_TABS` becomes Registration → Essential → Optional. The Registration step opens on a compact identity form:

- registry picker plus number, reusing the `RegistrationFormBody` field components;
- a **Find dog** action;
- for managers only, a quiet **No registration number yet** link.

After a no-match result the same step reveals the remaining registration fields (registered name, breed, variety, status). Those fields are already required for a registration, so `addDogSchema` is unchanged. The number is then saved as the first entry in `registrations`. Further registrations use the existing list, and "Add New Registration" moves below.

_Alternative rejected:_ a separate pre-panel "lookup" dialog. It is a new surface, and Dialog-vs-Slide-Out guidance (INTENT §3) puts work in the slide-out.

**Gating.**

- An exhibitor cannot advance past Registration with zero registrations. This is a new step-scoped issue in `locateInvalidField`, so it is enforced by the existing gate rather than a bespoke check.
- A manager who chose the skip can advance.
- The skip is shown when `isAdminRole(userRole)` is true. That is the existing helper, already used by `BasicInfoTab`, and every caller already passes `userRole`; `QuickCreateFlow` passes `SECRETARY`.

**INTENT.** For the secretary ("That was easy"), the lookup costs one field before work they would do anyway, and saves retyping a known dog. For the exhibitor ("This respects my time"), a dog they already added is found instead of re-entered.

### D2. Lookup: local first, then a boolean server RPC

1. **Local.** Run `findDogByExactRegistrationIdentity` over the dogs the panel already has (`useDogStoreCompat()`), without the owner filter. Every dog on the device is one the user may see. A hit shows the existing "This looks like {call name} — Use existing dog" card, the same `handleUseExistingDog` path, now at Find time instead of Save time.
2. **Server, online only.** Call a new `public.registry_identity_taken(p_organization text, p_registration_number text) RETURNS boolean`:
   - SECURITY DEFINER, `STABLE`, `search_path = public`;
   - compares with `normalize_dog_registration_organization` / `normalize_dog_registration_number` against live dogs;
   - `REVOKE ALL ... FROM PUBLIC, anon`, `GRANT EXECUTE ... TO authenticated`.

   If the RPC says taken and there was no local hit, the dog belongs to someone the caller cannot see. The step then shows "This number is already registered to another dog. Contact the show secretary." and blocks continuing with that identity. A secretary will practically always get a local hit first, because they hold the directory. The RPC is the exhibitor's path, and a fallback for a secretary whose directory is stale.

3. **Offline or failure.** The RPC is skipped or its error swallowed, and the flow continues on the local result. The server's existing 23505 at upload remains the final guard.

_Alternative rejected:_ returning the dog's id or name to secretaries from the RPC. The secretary already has it locally, and one shape for everyone keeps the function free of a role-dependent leak.

### D3. Trigger relaxation: trial managers only

Copy `entries_require_dog_registration()` from its only definition (`20260828210000`) into a new migration and add one early `RETURN NEW` after the class and trial are resolved:

```sql
IF public.can_manage_trial(v_trial_id) THEN RETURN NEW; END IF;
```

- `auth.uid()` inside the SECURITY DEFINER function still reflects the caller's JWT, so `submit_show_entries` (organizer source) and replication uploads from a secretary's device both pass, while self-service exhibitors still fail.
- INSERT-only scope and the puppy carve-out are unchanged.
- Rewrite the header comment's decision line to cite this change, so the 2026-08-28 rationale and its owner-approved exception read together.

_Alternative rejected:_ keying on `submission_source`. It is not a column on `entries`, and replication inserts carry no source.

### D4. One derived predicate: `isAwaitingRegistrationNumber`

The predicate is a pure helper in `features/dogs/identity/`, next to `resolveDogIdentityForOrganization`. It takes the entry, its trial's registry and the dog's registrations. It is true when the entry is live, is not conformation-puppy exempt, and the dog has no registration whose normalized organization matches the trial registry. It mirrors the SQL rule; known-answer tests run the same fixtures as the trigger's cases.

**Consumers:**

- **Cockpit:** the Exceptions count and pane.
- **Catalog:** `catalogRows` and `countCatalogClass`. The catalog count is a "listed" count, so held entries leave it.
- **Run sheet and run order:** `buildRunSheetEntries` and the show-map run-order source.
- **Paper scoring:** `paperScoresheetData.loadEntriesWithDogs`.
- **Pipeline print:** `usePipelinePrint` (run order, scoresheets).

Each builder already loads, or can load from the replica, the dog's registrations: the run sheet and paper scoring already resolve the registered breed per organization. Where registrations are not loaded, the builder loads them. The predicate never treats "registrations unknown" as "missing". An unloaded set means "not held", and a test pins each builder so an unloaded fixture cannot silently empty a class.

Capacity is untouched: held entries are still entries.

**SQL.** `emergency_packet_input`'s entry filter gains the same condition. It already joins registrations per `registry_key`; copy from its latest definition, `20260922220537`.

_Alternative rejected:_ a stored `registration_pending` flag. It would need a trigger on `dog_registrations` to clear it and could drift. Derivation clears itself when the number arrives.

### D5. Exceptions pane

Add `'registration-needed'` to `ENTRY_MANAGEMENT_EXCEPTIONS`, a view entry and count in `buildEntryManagementViews`, the count threaded from `EntryManagementPage`, and a pane component beside the waitlist pane.

Each row shows the dog, exhibitor and registry, with three actions:

- **Add registration:** opens the dog's existing registration form.
- **Pull / Withdraw:** the existing entry actions.
- **Send reminder:** see D6.

The data is the cockpit's already-loaded entries plus the dogs' registrations. The secretary's replica holds them, so the pane works offline. Reminders queue only online, like other lifecycle sends.

### D6. Lifecycle step `registration_number_needed`

**Migration:**

- drop and re-add both `step_type` CHECKs with the sixth value;
- update `ensure_show_lifecycle_email_steps` to seed it;
- backfill steps for existing shows by calling the function per show.

**Client:**

- add the value to `LIFECYCLE_EMAIL_STEP_TYPES`;
- add a draft case in `render.ts` covering dog, show, registry, "your entry is held until we have the registration number", and how to supply it (add it on the dog in myK9Show, or reply to the secretary);
- add a toggle in `ScheduledLifecycleEmailsPanel`.

**Prompt on save.** The secretary registration submit path follows the `useEntryDecisionLifecycleEmails` pattern: after a successful save whose created entries include held ones, it offers the existing preview dialog. Send, edit and skip are as for decision emails, with no new dialog.

**Send reminder** prepares a fresh `save_ready` job for the entry and opens the same preview. Idempotency keys include a reminder sequence, so a reminder is not deduplicated against the first send.

**No email.** If the exhibitor has no email, no job is prepared and the row shows "No email on file — contact by phone".

**Never after the number.** `send-lifecycle-email`'s `send` action re-checks, server-side, that a `registration_number_needed` job's entry is still held, using the trigger's own registry resolution. If not, it marks the job skipped instead of sending.

### D7. Batching (one PR per batch, per the orchestrate rules)

1. **Batch 1:** the `registry_identity_taken` RPC and number-first Add Dog. Tier: independent.
2. **Batch 2:** the trigger relaxation, `isAwaitingRegistrationNumber`, paperwork exclusions (client and packet SQL), and the Exceptions pane. Tier: independent.
3. **Batch 3:** the lifecycle step (migration, client, edge function). Tier: independent.
4. **Batch 4:** secretary guide card 5, and an e2e test of a held mail-in end to end on the isolated Nightly target.

Batches 1–3 each carry their own unit tests and the guide lines they change.

## Risks / Trade-offs

- **Registry-number enumeration.** The RPC lets an authenticated user test whether a number is in use. → Registry numbers are not secret, and the existing 23505 on save already reveals the same fact one dog at a time. The RPC returns no identity. Accepted; rate limiting is out of scope.
- **A held spot is never resolved.** → The Exceptions count sits beside pulls and waitlist, and the email and reminders chase it. Resolution is explicitly a secretary act (spec). This is the trade the owner chose over refusing the entry.
- **A paperwork builder missed.** A held entry would then print on a catalog or scoresheet. → D4 lists every builder found by the code map. Each gets a test, and the batch 2 review is told to grep for any other `isOnClassRunList` or `catalogRows` consumer.
- **The predicate drifts from SQL.** → Shared known-answer fixtures cover the TS predicate and the trigger's behavioral SQL test; the SQL runs in CI only.
- **A secretary enters their own dog via self-service without a number.** It passes, because they manage the trial. Accepted; it is the same person who would resolve it.
- **Exhibitor regression.** The new zero-registration gate blocks onboarding (`StepDogs`) where a dog was previously added without a number. → This is intended by the owner decision. Onboarding copy already asks for the registration. The batch 1 e2e covers onboarding at phone width.

## Migration Plan

- Each batch's migration merges with its PR. Going live needs an owner-run `supabase db push` after merge, in batch order. The batch 3 edge function also needs a `send-lifecycle-email` deploy.
- The client tolerates the server lagging:
  - the RPC call is wrapped, so a missing function behaves as offline;
  - the held predicate is client-side;
  - until batch 2 is pushed, a secretary's no-number entry is still refused by the old trigger, with today's error text.
- **Rollback:** each migration is independent. Re-applying the previous `entries_require_dog_registration` restores the August rule, and dropping the RPC returns the lookup to local-only.
