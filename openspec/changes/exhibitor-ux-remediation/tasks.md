# Tasks

Source: [`docs/ux-audits/exhibitor-elderly-novice-2026-07-24.md`](../../../docs/ux-audits/exhibitor-elderly-novice-2026-07-24.md). Finding numbers below refer to that report's findings table.

Resume request (2026-08-25, verbatim): `continue until complete`

Sections 1–5 are PR-sized slices. Section 1 carries the Critical finding and the widest blast radius — land it first. Sections 3, 4, and 5 are independent of each other and may run in parallel.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: The work changes shared myK9Show UI primitives and user flows without changing persistence, auth, payments, or shared systems; focused regressions plus app typecheck/lint and viewport QA cover the blast radius.

## Implementation constraints added by plan verification

- [x] 0.1 Reuse the existing dog-registration editor from the canonical dog record; do not add a second registration form inside the entry wizard. Preserve the selected show/dog and return path when the exhibitor follows the prerequisite action.
- [x] 0.2 Resolve the sanctioning organization through the existing registry helpers. Treat missing or ambiguous organization/class metadata as registration-required (fail closed); allow the puppy exception only when existing class metadata proves it is a conformation puppy class.
- [x] 0.3 Source declined reasons/next steps from existing entry data and use one honest scope-level schedule message (details appear when the show publishes them); do not invent dates or reasons.
- [x] 0.4 Keep rollback code-only: no migration, persisted-data rewrite, payment mutation, or replication-path change. The PR can be reverted without data repair.

## 1. Action-bar safety (audit #1, #2, #3) — Critical, do first

- [x] 1.1 Confirm the collision in code: `<Toaster position="bottom-right">` in [`main.tsx`](../../../apps/myk9show/src/main.tsx) vs the bottom-right action group in [`EditPanelWrapper.tsx`](../../../apps/myk9show/src/components/panels/edit/EditPanelWrapper.tsx). **Also determine whether the separately mounted `<ToastContainer />` shares the same corner** (design open question 2); if it does, it receives the same treatment throughout this section. **Answered: NO.** `ToastContainer` renders top-right (`top-[calc(var(--app-top-inset,3rem)+0.75rem)]`); sonner is bottom-right. They do not share a corner, so only sonner needs the offset. Note the bottom-right dock is DELIBERATE and pinned by `src/test/mainToasterDocking.source.test.ts` — it exists to keep sonner away from that top-right stack, so moving the toaster is not an available fix.
- [x] 1.2 Add a small action-bar registry (context or store) that a mounted sticky action bar registers its height with, and expose the current reserved offset.
- [x] 1.3 Consume that offset in the `<Toaster>` `offset` / `mobileOffset` props so toasts stack above an open action bar instead of on top of it.
- [x] 1.4 Dismiss transient toasts on route change so a toast cannot persist onto an unrelated screen.
- [x] 1.5 Add a dirty-form navigation guard driven by the existing `hasChanges` signal in `EditPanelWrapper`. It must name what is at risk, offer stay/discard, and **not** fire on the form's own Cancel path. **Completed in MYK9-165 / PR #1609:** the app migrated to a data router and `EditPanelWrapper` plus `BulkResultEntry` use the shared `UnsavedChangesRouteGuard`.
- [x] 1.6 Restructure the footer row: add `flex-wrap` + `gap-y`, `min-w-0` on the status group, `flex-shrink-0` on the action group. Below `sm`, collapse "Unsaved changes" to its amber dot with an `aria-label`.
- [x] 1.7 Move the validation summary out of the footer row; render it full-width directly above the action bar.
- [x] 1.8 Make the `(+N more)` counter interactive — expand the full list or move focus to the first invalid field. No error may be unreachable.
- [x] 1.9 Audit other sticky action bars (registration wizard step navigation, other slide-out panels) and confirm they register with the mechanism from 1.2. **Result:** generic `SlideOverPanel` and `CommonDialog` footers plus the fixed dog/class/results/entry-selection bulk bars register centrally. `RegistrationWizardShell` navigation is in normal page flow, not a bottom-edge overlay, so it needs no reservation.

## 2. Dog record field integrity (audit #4, #5)

> **Target state: the dog record carries no breed and no registered name.** Both belong to a registration with an organization. `dogs.breed` and `dogs.name` are `NOT NULL`, so fully removing them needs the data-model change (design § Follow-ups) — this section stops the app _asserting_ those values to the owner and to paperwork, and the migration finishes the job.
>
> The `"Mixed Breed"` default is disclosed, not silent — but disclosure does not make it acceptable, because it is a claim about the owner's dog and it is stored. See design decision 3, Correction A.

- [x] 2.1 Stop surfacing a substitute breed. A dog with no registration SHALL display no breed on the My Dogs list, dog record, and wizard, and SHALL NOT transmit one to entries, entry blanks, or organization submissions. Until the column can be dropped, keep the stored placeholder out of every read path rather than presenting it as data. The shared resolver/formatter now supplies the single empty-state label and entry-facing identity paths do not fall back to `dogs.breed`.
- [x] 2.2 Extract a pure display/empty-state formatter and adopt it in the My Dogs list, the dog record, and the registration wizard's dog-selection step, so one stored value cannot render as both "Unknown" and "Breed not set". `getDogBreedLabel` is used by the generic dog list, dog record, command/search surfaces, and wizard variants.
- [x] 2.9 Update the RegistrationTab empty-state copy: it must no longer tell the owner their dog "is saved as Mixed Breed". Say a breed will be recorded when a registration is added. **Update the `"4.E — no silent Mixed Breed"` test to match** — its intent (never mislead about breed) is preserved; its expected copy changes.
- [x] 2.10 Reproduce and isolate the breed round-trip: does saving Edit Dog alter `dogs.breed` when the field is untouched? (Design open question 2.) **Fix only what the reproduction proves.** The base edit mapper no longer serializes breed or registered-name fields; a regression test proves an unrelated edit leaves registration identity and breed untouched.
- [x] 2.3 **Remove the "Registered Name" field from the Edit Dog form's base dog record.** A dog is identified by its call name; a registered name belongs to a registration. This deletes a required field rather than adding one — see design decision 3.
- [x] 2.8 Confirm nothing in this change makes a registration required to **create or edit** a dog — it must stay optional and completable later. Registration is enforced only at entry time (task 4.5). Keep the existing RegistrationTab copy that says so. The base schema accepts unregistered dogs and registration editors remain separate.
- [x] 2.4 Ensure the registration editor ([`AddEditRegistrationDialog.tsx`](../../../apps/myk9show/src/components/dogs/AddEditRegistrationDialog.tsx) and the Add Dog Registration tab) captures the registered name for that organization alongside its registration number, breed, and variety. `dog_registrations` already has all four columns (migration 014) — **no migration required**.
- [x] 2.5 Make organization-scoped surfaces display that organization's `dog_registrations.registered_name`. Keep the existing combined presentation where both are useful (`TERA "Maia TeraByte Van Neerland"`). Owner-facing surfaces lead with the call name.
- [x] 2.7 Leave `name: formData.callName` in [`AddDogPanel/index.tsx`](../../../apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx) in place, but **replace the bare assignment with a comment** explaining it satisfies the legacy `dogs.name NOT NULL` constraint and is not a registered name — mirroring how the breed default is disclosed. Normalizing the column is out of scope here (see Follow-ups).
- [x] 2.6 Grep for other call sites rendering breed or registered name and route them through the shared formatter (do not assume the surfaces above are exhaustive).

## 3. Exhibitor review vocabulary (audit #9)

- [x] 3.1 Add an explicit exhibitor variant to the shared review-state mapping module (`reviewStateLabels.ts`) rather than creating a parallel exhibitor-only mapping.
- [x] 3.2 Replace independently-derived labels on the show-detail run schedule and the My Shows entry card with lookups against that module, so "Not accepted" no longer renders for an entry awaiting review.
- [x] 3.3 Verify a genuinely declined entry still renders refusal wording accompanied by a reason or next step. Exhibitor surfaces use “Declined” and direct the owner to the show secretary when no stored reason is available.

## 4. Entry wizard guidance (audit #13, #15, #16, #19)

- [x] 4.1 Remove the fixed-height inner scroll region from the dog-selection step below `md`; retain it at `md` and above.
- [x] 4.2 Add plain-language class-level eligibility guidance to the class-selection step. **Static hint only** (resolved: design resolved-question 2). Record computed per-registry eligibility as a separate follow-up; do not scope it here.
- [x] 4.3 Make the "No registration on file" warning actionable — link it to adding a registration for that dog. Preserve its current accuracy (dogs with registrations must still show no warning).
- [x] 4.5 Treat a missing registration **for the sanctioning organization** as a blocking prerequisite, not an advisory note — a dog must be registered to compete. The sole exception is conformation puppy classes, where entry is permitted and the wizard explains why. A registration with a _different_ organization does not satisfy the requirement.
- [x] 4.4 Remove the duplicated payment reassurance copy so the statement appears exactly once, next to the control it describes. Keep the disabled-submit explanation.

## 5. Exhibitor surface legibility (audit #11, #12, #17, #18, #20)

- [x] 5.1 Untruncate navigation descriptions in the exhibitor sidebar and drawer; descriptions wrap in full without a line clamp at all widths.
- [x] 5.2 Fix the **desktop** clipping in [`ExhibitorPaymentsPage.tsx`](../../../apps/myk9show/src/pages/exhibitor/ExhibitorPaymentsPage.tsx) so the Receipt column is not truncated at 1280px and the table does not scroll horizontally in its container. **The phone-width disclosure is owned by `exhibitor-journey-completion` task 6.6 — do not implement it here.** Coordinate before touching this file; slice 4 has not started as of 2026-07-24.
- [x] 5.6 Make the dog record lead with the dog: identity details before sub-collections, reachable without scrolling past the whole tab strip at 390px, and a single add-registration action instead of three ("Add New Registration" / "Add Registration" / "Add registration"). Builds on the merged consolidation in PR #1438 — do not re-plan that structure.
- [x] 5.3 Add visible or persistently discoverable labels to the icon-only Find Shows view toggles.
- [x] 5.4 Add accessible names to exhibitor nav links, dog-card links, and the Add Dog dialog's tab and select controls.
- [x] 5.5 Collapse repeated "Time pending · Armband pending · Judge TBD" rows into one scope-level message that says when detail is expected; rows with real detail still show it.

## 6. Testing — no section is complete until its tests pass

### 6.1 Unit tests (pure logic)

- [x] 6.1.1 Display formatter: null, `undefined`, empty string, and whitespace-only inputs all produce the single empty-state string; a real value passes through unchanged. `dogBreedLabel.test.ts` covers the formatter contract.
- [x] 6.1.4 Per-organization registered-name resolution: returns `registration.registered_name` when present; when it is null/empty, owner-facing identity remains the call name and organization paperwork shows the shared empty-state label rather than deriving a registered name from legacy `dog.name`. Resolver and registered-name helper tests cover primary, empty, and blank-name cases.
- [x] 6.1.2 Review-state label mapping: every state resolves to both a secretary and an exhibitor label; no pending state maps to refusal wording in the exhibitor variant.
- [x] 6.1.3 Action-bar offset calculation: registering and unregistering bars produces the expected reserved offset, including the zero-bars case. (PR #1574; re-run in this slice.)

### 6.2 Component / regression tests (these pin the Critical finding)

- [x] 6.2.1 **Toast does not steal the footer tap** — with a toast visible and a panel open, a click at the primary control's position resolves to that control, not to anything in the toast. This is the direct regression test for audit finding #1. **Evidence (2026-08-20):** Playwright CLI exercised the real app at 390×844 with the Edit Dog panel dirty and a 30-second Sonner `Dog added` / `Undo` toast visible. The Save center was `(280.23, 808)`; `document.elementFromPoint` and the captured browser click both resolved to `Save Changes`. The toast action occupied y=735–759, above the Save control at y=788–828. A capture-phase handler prevented the test click from dispatching the save mutation.
- [x] 6.2.2 Toast is dismissed on route change. (PR #1574; re-run in this slice.)
- [x] 6.2.3 Dirty-form guard prompts on navigation with unsaved changes, preserves data when the user stays, and does **not** fire on the form's own Cancel path. (PR #1609; re-run in this slice.)
- [x] 6.2.4 Footer at 390px with the unsaved-changes indicator present: the primary control renders fully inside the viewport with its complete label; also assert at 320px. **Evidence (2026-08-20):** the unit test pins the responsive class contract. Playwright CLI bounding-box checks in the real dirty Edit Dog panel recorded the complete `Save Changes` control inside both viewports: x=200.5–366 at 390×844 and x=165.5–296 at 320×844.
- [x] 6.2.5 Validation summary with three errors is rendered outside the footer row, and the `(+N more)` control reaches the hidden error.
- [x] 6.2.6 Submitting the Add Dog form empty creates no record and keeps the panel open.
- [x] 6.2.8 A registration editor captures its organization-scoped registered name without presenting or deriving a registered name on the base dog record; editing only that registration name leaves breed unchanged. Base edit mapping and registration-identity regression coverage pass.
- [x] 6.2.9 A dog created with no registration displays **no breed** on the My Dogs list, dog record, and wizard, and no substitute breed reaches an entry, entry blank, or submission payload. Shared identity regression coverage plus focused dog-list, wizard, and entry tests pass.
- [x] 6.2.10 The updated _"4.E"_ copy test passes: the empty state no longer claims the dog is saved as Mixed Breed.
- [x] 6.2.7 Accessible-name check over exhibitor nav links, dog-card links, and Add Dog dialog controls.
- [x] 6.2.11 Registration prerequisite coverage: matching organization passes; a missing/different organization blocks; a proven conformation puppy class passes with an explanation; ambiguous metadata fails closed; the add-registration action preserves a return path.
- [x] 6.2.12 Review vocabulary coverage on both exhibitor surfaces: pending wording is canonical, and declined wording includes an existing reason or next step. Focused mapping, My Shows, and show-detail tests pass (84 tests across the five relevant files).
- [x] 6.2.13 Responsive surface coverage: nav descriptions wrap, the desktop payments receipt column does not clip or scroll, Find Shows toggles have persistent labels, and schedule placeholders collapse to one scope-level message while real details remain.
- [x] 6.2.14 Dog-record hierarchy coverage: identity precedes sub-collections at phone width and the add-registration action appears once.

### 6.3 Repo checks

- [x] 6.3.1 Final `pnpm typecheck` passed after integration with PR #1798 (26/26 tasks).
- [x] 6.3.2 Final `pnpm lint` passed clean after integration with PR #1798 (14/14 tasks).
- [x] 6.3.3 Final focused verification passed 350 tests across 28 touched and name-matched regression files.

### 6.4 Manual multi-viewport re-walk (required before archiving)

Re-walk as the elderly-novice persona at **390×844**, **834×1112**, **1112×834**, and **1280×800**, capturing evidence for each:

- [x] 6.4.1 Add a dog → edit that dog → save, **with a toast deliberately raised first**. Confirm the edit persists by reopening the record. This reproduces the exact sequence that lost data on 2026-07-24.
- [x] 6.4.2 Submit the dog form empty; confirm all errors are legible and reachable, and that the primary button is fully visible at 390px.
- [x] 6.4.3 Walk the registration wizard steps 1–3 on a phone; confirm one scroll context, eligibility guidance, an actionable registration warning, and a single payment reassurance.
- [x] 6.4.4 Confirm no exhibitor surface renders "Not accepted" for an entry awaiting review.
- [x] 6.4.5 Confirm nav descriptions, the payments table, Find Shows toggles, and the run schedule at all four viewports.
- [x] 6.4.6 Verify against the audit's "What worked well" list that nothing previously good regressed — particularly the "Biscuit added → Enter a show" toast pattern, which must keep working once toasts stop covering buttons.

## 7. Close-out

- [x] 7.1 Write a follow-up audit report confirming which of findings #1–#20 are resolved, using the same report format so the next run diffs cleanly.
- [x] 7.2 Confirm the excluded findings are still tracked: #6, #7, #8, and #10 with `exhibitor-journey-completion` (MYK9-71); cosmetic #21–#24 in the audit report only. Finding #14 remains in scope here through task 5.6. MYK9-71 is Done and links merged PR #1456.
- [x] 7.3 Delete the audit's leftover test data if still present — dog **Biscuit**, one saved registration draft, one $30 cart item. **Verified 2026-08-21:** direct staging inventory found no matching dog or cart item under any owner; the saved draft was browser-local (`draft-storage`) rather than shared database data, so no destructive deletion was necessary.
- [ ] 7.4 Open and review the final implementation PR(s), record CI evidence, and merge before archive.
- [ ] 7.5 Update the Linear pointer issue with implementation/verification evidence and archive this change only after every required PR is merged.
