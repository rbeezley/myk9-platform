## Context

All findings come from the 2026-07-24 exhibitor role-journey audit. Source investigation during proposal authoring located exact root causes, so this design is grounded in real code rather than inferred structure.

Two constraints shape every decision below:

- **`docs/INTENT.md` — Exhibitor: _"This respects my time."_** Its listed anti-patterns include "requiring re-entry of information the system already knows" and its guardrails ask "What does the error state look like?" and "How many taps?". A change that silently discards a save is the most direct violation of that intent available, so the Critical fix is also the most intent-preserving one. No `// INTENT:` comment exists on any surface in scope.
- **Consolidate, don't duplicate.** The largest fix is a shared primitive, not a per-screen patch.

### Root causes established

| Finding                      | Root cause                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1 Toast steals the Save tap | [`main.tsx:73`](../../../apps/myk9show/src/main.tsx) mounts `<Toaster position="bottom-right">`. Every slide-out panel and wizard places its primary control in the bottom-right of a sticky footer. The toast lands directly on top of it and wins the pointer event. `main.tsx` also mounts a second, separate `<ToastContainer />` alongside sonner's `<Toaster />`. |
| #2 Footer overflows at 390px | [`EditPanelWrapper.tsx:368`](../../../apps/myk9show/src/components/panels/edit/EditPanelWrapper.tsx) — `flex items-center justify-between w-full` with no `flex-wrap`, no `min-w-0` on the status group, and no `flex-shrink-0` on the action group. The left status group expands and pushes the buttons past the viewport edge.                                       |
| #3 Errors crushed and hidden | Same footer row: `errors.slice(0, 2).join(' • ')` with `(+${errorCount - 2} more)`. The truncation to two errors is deliberate but unrecoverable, and rendering the summary inside the same non-wrapping flex row is what crushes it to one word per line.                                                                                                              |
| #4/#5 Dog field integrity    | Breed is defaulted at one layer and rendered from the raw value at others, producing "Mixed Breed" / "Unknown" / "Breed not set" for one null. Registered name is auto-filled from call name in the create path ([`useAddDogForm.ts`](../../../apps/myk9show/src/components/panels/edit/AddDogPanel/useAddDogForm.ts)) while the edit form marks it required.           |

## Goals / Non-Goals

**Goals**

- No user edit is ever lost without an explicit, informed choice.
- Every primary action is reachable and fully visible at every supported width.
- The dog record states only what the owner supplied, identically on every surface.
- Novice-facing explanatory text is readable and actionable rather than clipped.

**Non-Goals**

- The money contradiction, entry-count reconciliation, "Add or Change Entries" scope, and the dog Overview hierarchy — all owned by `exhibitor-journey-completion` (MYK9-71). This change consumes those contracts.
- Cosmetic-only audit findings #21–#24.
- Any Premium surface, database migration, edge function, or Stripe behavior.

## Decisions

### 1. Fix the toast/action-bar collision in the toast layer, not per screen

**Decision:** Treat this as one shared-primitive defect. Introduce a single mechanism by which an open action bar reserves space, and change the toast layer to respect it — rather than adjusting each dialog.

**Options considered:**

| Option                                                   | Verdict                                                                                                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lower the toast `z-index` below the footer               | **Rejected alone.** The toast would render behind the footer but still cover page content unpredictably, and a partially hidden toast is its own defect.                      |
| Move toasts to `top-right`                               | **Rejected as the sole fix.** It relocates the collision rather than removing it (headers and breadcrumbs live there), and it discards the deliberate bottom-right placement. |
| **Offset the toast layer when an action bar is mounted** | **Chosen.** The toast stacks above the bar instead of on it. Both stay fully visible and independently operable, and the existing placement is preserved.                     |
| Dismiss toasts whenever a dialog opens                   | **Rejected as the sole fix**, but adopted as a complement — see below.                                                                                                        |

**Implementation shape:** a small context/store that action bars register their height with on mount, consumed by the `<Toaster>` `offset` / `mobileOffset` props already present in `main.tsx`. This keeps the change in one place and automatically covers every current and future dialog, panel, and wizard.

**Complementary fixes, both required:**

- **Dismiss transient toasts on route change.** The audit's toast survived three navigations. A toast raised on the dog list has no business being live on the edit dialog of another entity.
- **Guard dirty-form navigation.** Even with the collision fixed, an accidental navigation must not silently discard work. `EditPanelWrapper` already tracks `hasChanges`; that signal is the guard's input, so no new state is needed.

The three together are defence in depth: the collision stops happening, stale toasts stop existing, and if a navigation still occurs the user is asked before losing anything.

### 2. Restructure the footer row rather than shrinking its contents

**Decision:** Make the footer wrap and give the action group layout priority.

- Add `flex-wrap` and `gap-y` to the footer row; add `min-w-0` to the status group and `flex-shrink-0` to the action group so the primary control can never be the element that yields.
- Below `sm`, collapse the "Unsaved changes" text to its existing amber dot with an `aria-label`, keeping the signal without the width cost.
- **Move the validation summary out of the footer row entirely** and render it full-width directly above the action bar. This is what removes the one-word-per-line crushing; no amount of flex tuning fixes a summary competing with buttons for a 390px row.

**On `(+N more)`:** the cap stays — an unbounded error string in a footer is worse. But the counter becomes an interactive control that expands the full list or moves focus to the first invalid field. The requirement is that no error is _unreachable_, not that all errors are always shown.

### 3. A dog has a call name; a registration has a registered name

**Domain model (confirmed with the product owner).** A dog has **one call name** — the everyday name, e.g. "Tera". A **registered name** is a property of a _registration with an organization_, e.g. "Maia TeraByte Van Neerland" with AKC. It is usually the same across organizations but is not guaranteed to be. Because this is a dog-show app, **a dog must be registered to show**, with one exception: puppies in conformation classes.

**The schema disagrees with that model.** [`001_core_entities.sql`](../../../supabase/migrations/001_core_entities.sql) declares `dogs.name TEXT NOT NULL` commented _"Registered name"_ and `dogs.call_name TEXT` nullable — i.e. the org-specific value is required on the org-agnostic record, while the always-present value is optional. The app quietly works around this: [`AddDogPanel/index.tsx:98`](../../../apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx) writes `name: formData.callName, callName: formData.callName`, storing the call name in both columns purely to satisfy `NOT NULL`.

`dog_registrations` already holds the correct per-organization fields — `registered_name`, `breed`, `variety` (migration 014) under `UNIQUE(dog_id, organization)`. Nothing needs inventing.

**Two earlier corrections in this section, both now superseded on the registered-name point:**

- **Correction A — superseded. The breed default _is_ a defect, for a different reason than the audit first gave.** The audit called it a _silent_ default; it is not silent — [`AddDogPanel/index.tsx:100`](../../../apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx) and [`RegistrationTab.tsx`](../../../apps/myk9show/src/components/panels/edit/AddDogPanel/RegistrationTab.tsx) disclose it plainly. But disclosure does not make it acceptable. **"Mixed Breed" is a claim about the owner's dog**, and telling an exhibitor who has just added a purebred that their dog is recorded as Mixed Breed is offensive, however clearly it is explained. The value is also stored, so it can reach entry blanks and organization submissions — it is not merely a display string. **Decision: the dog record carries no breed at all.** Breed exists only on a registration, supplied by the organization the dog is registered with.
- **Correction B — "collect the registered name on Add" — withdrawn.** That treated the `NOT NULL` constraint as the requirement. Under the domain model above it is the constraint that is wrong, and asking a novice for a formal registered name before they hold a registration is the opposite of the intent this change protects.

**Decision — do not surface a registered name on the base dog record.**

- The Add Dog form keeps collecting the **call name**, which is correct and already works.
- The **Edit Dog form stops presenting "Registered Name" as a required field on the dog record.** That field is the schema leaking into the UI; it is what made the audited dog carry "Biscuit" as its registered name.
- Registered name is collected and edited **only within a registration**, alongside that organization's registration number, breed, and variety — the Add Dog form already has a Registration tab for exactly this.
- Display resolves per context: the call name everywhere the user identifies their dog, and `registration.registered_name` wherever an organization's paperwork or entry is in view. Where a surface must show both, the existing wizard pattern — `TERA "Maia TeraByte Van Neerland"` — is already correct.
- **No migration in this change.** `dogs.name` continues to mirror the call name as a documented constraint-satisfier. Normalizing it properly (making `dogs.name` nullable / `call_name` `NOT NULL`) is a data-model change tracked separately alongside the removal of the dead flat registry columns — see Follow-ups.

This is a net _reduction_ in scope: a required field is removed from the create/edit path rather than added to it.

**Decision — per-organization registered names:** the domain requirement is that a registered name is tied to a _registration number_, which is per organization (AKC, UKC, ASCA…) — usually identical across organizations, but not necessarily. **This is already modelled and needs no schema work:** `dog_registrations` carries a nullable per-org `registered_name` (migration 014) under `UNIQUE(dog_id, organization)`. The contract is therefore:

- `dogs.name` — the dog's canonical registered name, required, the default shown everywhere.
- `dog_registrations.registered_name` — an optional per-organization override, used only when that registry's name differs.

Display resolves per organization as `registration.registered_name ?? dog.name`. The registration editor should present its name field pre-filled from `dogs.name` and make clear it only needs changing when that registry differs — matching the "typically the same" reality rather than asking the question twice.

**Decision — read path:** extract a pure empty-state/display helper used by the dog list, dog detail, and the registration wizard's dog-selection step, so one stored value cannot render as both "Unknown" and "Breed not set". Being a pure function it is directly unit-testable against the exact null/empty/whitespace shapes the UI emits — the assertion-first pattern this repo prefers.

**One unresolved observation, deliberately not specified as a fix:** the audited dog's breed read "Mixed Breed" immediately after creation and "Unknown" after an unrelated edit was saved. That suggests the Edit round-trip drops or rewrites `dogs.breed` when the field is untouched, but it was not isolated during the walk. Tasks require reproducing it before changing anything, rather than guessing at a cause.

### 4. Extend the existing vocabulary module rather than adding exhibitor-only labels

**Decision:** `entry-review-vocabulary` already mandates that secretary-facing review states resolve from one shared mapping module (`reviewStateLabels.ts`). Exhibitor surfaces currently derive labels independently, which is how "Not accepted" reached an entry that is merely awaiting review while its own entry card said "Pending Review".

Add an explicit **exhibitor variant** to that shared module rather than creating a parallel exhibitor mapping. Exhibitors and secretaries legitimately need different wording for the same state — the secretary's "Not accepted" is an accurate work-queue term, while the exhibitor's must read as pending — but that divergence should be declared in one place, not re-invented per call site.

### 5. Wizard step 1 uses page flow on phones

**Decision:** Drop the fixed-height inner scroll region below `md`. The audit measured a 464px inner scroll container holding 1368px of content on an 844px-tall phone — two competing scrollbars in a step the user must complete to enter a show. The constrained-height presentation is retained at tablet and desktop where it does aid scanning.

## Risks / Trade-offs

- **The toast-offset mechanism is app-wide.** Every dialog, panel, and wizard inherits it, so a regression is broad. Mitigated by component-level regression tests asserting the collision specifically (a footer button remains the hit-test target with a toast present), which is the test the codebase currently lacks.
- **Two toast systems are mounted** (`<Toaster>` and `<ToastContainer>`). Only sonner is in scope here; the second must be checked for the same collision. If it shares the corner, it needs the same offset — flagged in tasks rather than silently assumed.
- **Making registered name optional is a product decision, not purely technical.** It is called out explicitly here for review. If the answer is instead "collect it on Add", the spec's first scenario still holds — it requires only that create and edit agree.
- **Dirty-form guards can become nagging** if they fire on trivial or programmatic changes. The guard consumes the existing `hasChanges` signal and must exclude the form's own Cancel path, which the spec states normatively.

## Migration Plan

No data migration, no Supabase deploy, no edge-function change. All changes are presentation-layer or client-side validation, so **offline-first behavior is untouched** — no replication-backed read or mutation path is modified, and `@myk9/replication` is not involved. The work is shippable incrementally: the toast/footer primitive first (it carries the Critical finding and the widest blast radius), then dog field integrity, then wizard and legibility items, which are independent of each other.

## Follow-ups (deliberately out of scope here)

> **These are now specified.** All three are owned by the `dog-identity-normalization` change ([MYK9-90](https://linear.app/myk9-platform/issue/MYK9-90/dog-identity-normalization-tracked-in-openspec-change-dog-identity)). This section is retained as the rationale for why they were split out; do not re-plan them here.

Investigating the dog identity model surfaced three data-model problems. None is an exhibitor-UX defect, all touch secretary/reporting paths, and all need a migration — so they are recorded here rather than absorbed into a change that declares itself migration-free.

1. **Dead flat registry columns.** `dogs.akc_number`, `ukc_number`, `other_registry`, `other_registry_number` (migration 001) are a pre-normalization fossil superseded by `dog_registrations`. **Nothing writes them.** Three places still read them, two of which are official paperwork — [`useAKCSubmissionData.ts:213`](../../../apps/myk9show/src/hooks/queries/useAKCSubmissionData.ts) and [`buildEntryBlankProps.ts:233`](../../../apps/myk9show/src/features/heritage/entry-blank/buildEntryBlankProps.ts) both map `registrationNumber: dog?.akc_number ?? null` — plus dog search ([`reads.ts:575`](../../../apps/myk9show/src/services/database/dogs/reads.ts)). If confirmed, dogs registered through the current UI carry a **null registration number onto AKC submissions and printed entry blanks**, and cannot be found by registration number. This is the highest-priority item of the three and is tracked separately.
2. **`dogs.name` / `dogs.call_name` are inverted.** The org-specific value (`name`, commented "Registered name") is `NOT NULL`; the always-present value (`call_name`) is nullable. Correct shape: `call_name` `NOT NULL`, and no registered name on the dog record at all. Requires a migration plus a backfill.
3. **Remove breed from the dog record entirely — decided, not open.** Neither the registered name nor the breed belongs on the dog; both are properties of a registration with an organization. `dogs.breed` is `NOT NULL` with ~258 read sites, and the `"Mixed Breed"` placeholder exists solely to satisfy that constraint for dogs with no registration yet. **An unregistered dog displays no breed.** The app does not guess, because guessing means asserting something untrue about a person's dog — and the guess is stored, so it can reach entry blanks and organization submissions. One mechanical question remains: **which breed a generic, non-organization-scoped surface shows for a dog registered with several organizations**, since `dog_registrations.breed` is per organization and values can differ. Organization-scoped surfaces resolve naturally; My Dogs, dog search, and entry summaries need a documented rule (primary registration, most recent, or explicit user choice).

Pre-launch with no real users, none of these need a backwards-compatibility shim. **All three belong in one data-model change rather than three:** items 2 and 3 are the same schema inversion (`dogs.name` and `dogs.breed` are both `NOT NULL` columns holding placeholders for attributes that belong on the registration), and item 1 touches the same table and the same paperwork paths.

## Resolved Questions

1. **Registered name — optional on Edit, or collected on Add?** **Resolved: collect it on Add.** `dogs.name` is `NOT NULL`, so optional was never available. Per-organization variation is handled by the existing `dog_registrations.registered_name` rather than by relaxing the dog record. See decision 3.
2. **Class eligibility guidance — computed or static?** **Resolved: static plain-language hint first.** It resolves the persona's failure without depending on title data whose per-registry completeness was not verified in this audit. Computed per-registry eligibility is recorded as a follow-up, not scoped here.

## Open Questions

1. **Does `<ToastContainer />` share sonner's corner?** `main.tsx` mounts it alongside `<Toaster>`. To be confirmed in task 1.1; if it shares the bottom-right corner it needs the same offset treatment.
2. **Does saving Edit Dog rewrite `dogs.breed` when the field is untouched?** Observed but not isolated during the walk (see decision 3). Task 2.1 requires reproducing it before any fix.
