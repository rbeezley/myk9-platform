# Tasks

Source: [`docs/ux-audits/exhibitor-elderly-novice-2026-07-24.md`](../../../docs/ux-audits/exhibitor-elderly-novice-2026-07-24.md). Finding numbers below refer to that report's findings table.

Sections 1–5 are PR-sized slices. Section 1 carries the Critical finding and the widest blast radius — land it first. Sections 3, 4, and 5 are independent of each other and may run in parallel.

## 1. Action-bar safety (audit #1, #2, #3) — Critical, do first

- [ ] 1.1 Confirm the collision in code: `<Toaster position="bottom-right">` in [`main.tsx`](../../../apps/myk9show/src/main.tsx) vs the bottom-right action group in [`EditPanelWrapper.tsx`](../../../apps/myk9show/src/components/panels/edit/EditPanelWrapper.tsx). **Also determine whether the separately mounted `<ToastContainer />` shares the same corner** (design open question 2); if it does, it receives the same treatment throughout this section.
- [ ] 1.2 Add a small action-bar registry (context or store) that a mounted sticky action bar registers its height with, and expose the current reserved offset.
- [ ] 1.3 Consume that offset in the `<Toaster>` `offset` / `mobileOffset` props so toasts stack above an open action bar instead of on top of it.
- [ ] 1.4 Dismiss transient toasts on route change so a toast cannot persist onto an unrelated screen.
- [ ] 1.5 Add a dirty-form navigation guard driven by the existing `hasChanges` signal in `EditPanelWrapper`. It must name what is at risk, offer stay/discard, and **not** fire on the form's own Cancel path.
- [ ] 1.6 Restructure the footer row: add `flex-wrap` + `gap-y`, `min-w-0` on the status group, `flex-shrink-0` on the action group. Below `sm`, collapse "Unsaved changes" to its amber dot with an `aria-label`.
- [ ] 1.7 Move the validation summary out of the footer row; render it full-width directly above the action bar.
- [ ] 1.8 Make the `(+N more)` counter interactive — expand the full list or move focus to the first invalid field. No error may be unreachable.
- [ ] 1.9 Audit other sticky action bars (registration wizard step navigation, other slide-out panels) and confirm they register with the mechanism from 1.2.

## 2. Dog record field integrity (audit #4, #5)

> **Target state: the dog record carries no breed and no registered name.** Both belong to a registration with an organization. `dogs.breed` and `dogs.name` are `NOT NULL`, so fully removing them needs the data-model change (design § Follow-ups) — this section stops the app _asserting_ those values to the owner and to paperwork, and the migration finishes the job.
>
> The `"Mixed Breed"` default is disclosed, not silent — but disclosure does not make it acceptable, because it is a claim about the owner's dog and it is stored. See design decision 3, Correction A.

- [ ] 2.1 Stop surfacing a substitute breed. A dog with no registration SHALL display no breed on the My Dogs list, dog record, and wizard, and SHALL NOT transmit one to entries, entry blanks, or organization submissions. Until the column can be dropped, keep the stored placeholder out of every read path rather than presenting it as data.
- [ ] 2.2 Extract a pure display/empty-state formatter and adopt it in the My Dogs list, the dog record, and the registration wizard's dog-selection step, so one stored value cannot render as both "Unknown" and "Breed not set".
- [ ] 2.9 Update the RegistrationTab empty-state copy: it must no longer tell the owner their dog "is saved as Mixed Breed". Say a breed will be recorded when a registration is added. **Update the `"4.E — no silent Mixed Breed"` test to match** — its intent (never mislead about breed) is preserved; its expected copy changes.
- [ ] 2.10 Reproduce and isolate the breed round-trip: does saving Edit Dog alter `dogs.breed` when the field is untouched? (Design open question 2.) **Fix only what the reproduction proves.**
- [ ] 2.3 **Remove the "Registered Name" field from the Edit Dog form's base dog record.** A dog is identified by its call name; a registered name belongs to a registration. This deletes a required field rather than adding one — see design decision 3.
- [ ] 2.8 Confirm nothing in this change makes a registration required to **create or edit** a dog — it must stay optional and completable later. Registration is enforced only at entry time (task 4.5). Keep the existing RegistrationTab copy that says so.
- [ ] 2.4 Ensure the registration editor ([`AddEditRegistrationDialog.tsx`](../../../apps/myk9show/src/components/dogs/AddEditRegistrationDialog.tsx) and the Add Dog Registration tab) captures the registered name for that organization alongside its registration number, breed, and variety. `dog_registrations` already has all four columns (migration 014) — **no migration required**.
- [ ] 2.5 Make organization-scoped surfaces display that organization's `dog_registrations.registered_name`. Keep the existing combined presentation where both are useful (`TERA "Maia TeraByte Van Neerland"`). Owner-facing surfaces lead with the call name.
- [ ] 2.7 Leave `name: formData.callName` in [`AddDogPanel/index.tsx`](../../../apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx) in place, but **replace the bare assignment with a comment** explaining it satisfies the legacy `dogs.name NOT NULL` constraint and is not a registered name — mirroring how the breed default is disclosed. Normalizing the column is out of scope here (see Follow-ups).
- [ ] 2.6 Grep for other call sites rendering breed or registered name and route them through the shared formatter (do not assume the surfaces above are exhaustive).

## 3. Exhibitor review vocabulary (audit #9)

- [ ] 3.1 Add an explicit exhibitor variant to the shared review-state mapping module (`reviewStateLabels.ts`) rather than creating a parallel exhibitor-only mapping.
- [ ] 3.2 Replace independently-derived labels on the show-detail run schedule and the My Shows entry card with lookups against that module, so "Not accepted" no longer renders for an entry awaiting review.
- [ ] 3.3 Verify a genuinely declined entry still renders refusal wording accompanied by a reason or next step.

## 4. Entry wizard guidance (audit #13, #15, #16, #19)

- [ ] 4.1 Remove the fixed-height inner scroll region from the dog-selection step below `md`; retain it at `md` and above.
- [ ] 4.2 Add plain-language class-level eligibility guidance to the class-selection step. **Static hint only** (resolved: design resolved-question 2). Record computed per-registry eligibility as a separate follow-up; do not scope it here.
- [ ] 4.3 Make the "No registration on file" warning actionable — link it to adding a registration for that dog. Preserve its current accuracy (dogs with registrations must still show no warning).
- [ ] 4.5 Treat a missing registration **for the sanctioning organization** as a blocking prerequisite, not an advisory note — a dog must be registered to compete. The sole exception is conformation puppy classes, where entry is permitted and the wizard explains why. A registration with a _different_ organization does not satisfy the requirement.
- [ ] 4.4 Remove the duplicated payment reassurance copy so the statement appears exactly once, next to the control it describes. Keep the disabled-submit explanation.

## 5. Exhibitor surface legibility (audit #11, #12, #17, #18, #20)

- [ ] 5.1 Untruncate navigation descriptions in the exhibitor sidebar and drawer (allow wrapping / `line-clamp-2`) at all widths.
- [ ] 5.2 Fix the **desktop** clipping in [`ExhibitorPaymentsPage.tsx`](../../../apps/myk9show/src/pages/exhibitor/ExhibitorPaymentsPage.tsx) so the Receipt column is not truncated at 1280px and the table does not scroll horizontally in its container. **The phone-width disclosure is owned by `exhibitor-journey-completion` task 6.6 — do not implement it here.** Coordinate before touching this file; slice 4 has not started as of 2026-07-24.
- [ ] 5.6 Make the dog record lead with the dog: identity details before sub-collections, reachable without scrolling past the whole tab strip at 390px, and a single add-registration action instead of three ("Add New Registration" / "Add Registration" / "Add registration"). Builds on the merged consolidation in PR #1438 — do not re-plan that structure.
- [ ] 5.3 Add visible or persistently discoverable labels to the icon-only Find Shows view toggles.
- [ ] 5.4 Add accessible names to exhibitor nav links, dog-card links, and the Add Dog dialog's tab and select controls.
- [ ] 5.5 Collapse repeated "Time pending · Armband pending · Judge TBD" rows into one scope-level message that says when detail is expected; rows with real detail still show it.

## 6. Testing — no section is complete until its tests pass

### 6.1 Unit tests (pure logic)

- [ ] 6.1.1 Display formatter: null, `undefined`, empty string, and whitespace-only inputs all produce the single empty-state string; a real value passes through unchanged.
- [ ] 6.1.4 Per-organization registered-name resolution: falls back to `dog.name` when `registration.registered_name` is null/empty; returns the per-org value when present; unaffected organizations keep the canonical name.
- [ ] 6.1.2 Review-state label mapping: every state resolves to both a secretary and an exhibitor label; no pending state maps to refusal wording in the exhibitor variant.
- [ ] 6.1.3 Action-bar offset calculation: registering and unregistering bars produces the expected reserved offset, including the zero-bars case.

### 6.2 Component / regression tests (these pin the Critical finding)

- [ ] 6.2.1 **Toast does not steal the footer tap** — with a toast visible and a panel open, a click at the primary control's position resolves to that control, not to anything in the toast. This is the direct regression test for audit finding #1.
- [ ] 6.2.2 Toast is dismissed on route change.
- [ ] 6.2.3 Dirty-form guard prompts on navigation with unsaved changes, preserves data when the user stays, and does **not** fire on the form's own Cancel path.
- [ ] 6.2.4 Footer at 390px with the unsaved-changes indicator present: the primary control renders fully inside the viewport with its complete label; also assert at 320px.
- [ ] 6.2.5 Validation summary with three errors is rendered outside the footer row, and the `(+N more)` control reaches the hidden error.
- [ ] 6.2.6 Submitting the Add Dog form empty creates no record and keeps the panel open.
- [ ] 6.2.8 Add Dog collects the registered name and does **not** copy it from the call name; editing only the registered name leaves breed unchanged (regression test for the round-trip in 2.1).
- [ ] 6.2.9 A dog created with no registration displays **no breed** on the My Dogs list, dog record, and wizard, and no substitute breed reaches an entry, entry blank, or submission payload.
- [ ] 6.2.10 The updated _"4.E"_ copy test passes: the empty state no longer claims the dog is saved as Mixed Breed.
- [ ] 6.2.7 Accessible-name check over exhibitor nav links, dog-card links, and Add Dog dialog controls.

### 6.3 Repo checks

- [ ] 6.3.1 `pnpm typecheck` (never raw `tsc`).
- [ ] 6.3.2 `pnpm lint` clean at `--max-warnings 0`.
- [ ] 6.3.3 Run the colocated tests for every file touched, plus tests found by grepping for the changed function names — not only colocated ones.

### 6.4 Manual multi-viewport re-walk (required before archiving)

Re-walk as the elderly-novice persona at **390×844**, **834×1112**, **1112×834**, and **1280×800**, capturing evidence for each:

- [ ] 6.4.1 Add a dog → edit that dog → save, **with a toast deliberately raised first**. Confirm the edit persists by reopening the record. This reproduces the exact sequence that lost data on 2026-07-24.
- [ ] 6.4.2 Submit the dog form empty; confirm all errors are legible and reachable, and that the primary button is fully visible at 390px.
- [ ] 6.4.3 Walk the registration wizard steps 1–3 on a phone; confirm one scroll context, eligibility guidance, an actionable registration warning, and a single payment reassurance.
- [ ] 6.4.4 Confirm no exhibitor surface renders "Not accepted" for an entry awaiting review.
- [ ] 6.4.5 Confirm nav descriptions, the payments table, Find Shows toggles, and the run schedule at all four viewports.
- [ ] 6.4.6 Verify against the audit's "What worked well" list that nothing previously good regressed — particularly the "Biscuit added → Enter a show" toast pattern, which must keep working once toasts stop covering buttons.

## 7. Close-out

- [ ] 7.1 Write a follow-up audit report confirming which of findings #1–#20 are resolved, using the same report format so the next run diffs cleanly.
- [ ] 7.2 Confirm the excluded findings are still tracked: #6, #7, #8, #10, #14 with `exhibitor-journey-completion` (MYK9-71); cosmetic #21–#24 in the audit report only.
- [ ] 7.3 Delete the audit's leftover test data if still present — dog **Biscuit**, one saved registration draft, one $30 cart item.
- [ ] 7.4 Update the Linear pointer issue and archive this change.
