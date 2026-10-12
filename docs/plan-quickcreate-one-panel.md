# QuickCreateFlow: one slide-out hosting Add Person, Add Dog(s) and Review inline

> **Status:** Active

**Linear:** [MYK9-1081](https://linear.app/myk9-platform/issue/MYK9-1081) · **Date:** 2026-10-11 · **Owner decision 2026-10-09:** option (a), ONE right slide-out hosting all three steps inline · **Precedents:** MYK9-1088 (#2898, Message Center compose mode), MYK9-1089 (#2906, `EditPanelWrapper` `variant: 'inline'` and the Manage Registrations modes) · **Related ledger:** MYK9-1085 (overlay-stack audit)

Paths are under `apps/myk9show/src/` on `origin/main` at `49692674c` unless stated otherwise. Each reference was read while writing this plan, and anything that could not be verified is marked **UNVERIFIED**.

---

## 1. Why

`docs/INTENT.md` § "Dialog or Slide-Out: Decision vs Work" sets two rules. A form with more than about four fields, or one that scrolls, belongs in a slide-out. A dialog is never stacked on a slide-out for a routine step.

Quick Create breaks both rules today. The shell is a dialog. The real work happens in two more dialogs, Add Person (2 tabs) and Add Dog (3 tabs, about 12 fields plus registrations). And adding a registration inside Add Dog opens a third overlay, a slide-out on top of that dialog.

The secretary's intent word is "That was easy", and INTENT names "Multi-step forms" as an anti-pattern for that role. The issue's non-goals forbid shortening the steps, so this plan keeps them. What it changes is that the three steps become one continuous surface instead of a chain of overlays.

## 2. Current-state map (verified)

### 2.1 Mount chain

| Layer | File:line                                                                        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Route | `routes/secretaryRoutes.tsx:352` (and `routes/publicRoutes.tsx:210`)             | Renders `RegistrationWizardPage`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Page  | `pages/RegistrationWizardPage.tsx:409-457`                                       | Renders `WorkflowStepContent`. `offlineFirstCreate={isLateEntryMode && currentWorkflowMode !== 'exhibitor'}` is at `:449`. Late-entry mode is `?source=show-desk&entryMode=late` (`RegistrationWizardPage.routes.ts:1-3`, read at `useRegistrationWizardState.ts:118`).                                                                                                                                                                                                                                                                                                        |
| Shell | `components/shows/RegistrationWorkflow/RegistrationWizardShell.tsx:110-131`      | Ancestors are `div.container`, then a card `section`, then `div.flex-1 p-4 sm:p-8`. None has a transform, filter or `space-y` in source. The sticky header at `:105` uses `backdrop-blur-xl`, but it is a sibling, not an ancestor.                                                                                                                                                                                                                                                                                                                                            |
| Step  | `components/shows/RegistrationWorkflow/WorkflowStepContent.tsx:343-364`          | `div.min-h-[300px]` wraps `SearchErrorBoundary` (which adds no DOM wrapper), which wraps `DogSelectionStepEnhanced` with `offlineFirst`, `showStartDate` and `createdFromShowId`.                                                                                                                                                                                                                                                                                                                                                                                              |
| Host  | `components/shows/RegistrationWorkflow/DogSelectionStepEnhanced.tsx` (723 lines) | `creationDialogs` (`:385-418`) mounts three things: **QuickCreateFlow** (`:387-396`, always `mode="batch"`); a standalone **CreateExhibitorDialog** (`:397-404`, "Add Person Only"); and a standalone **AddDogPanel `variant="dialog"`** (`:405-417`, "Dog Only", also auto-opened after Add Person Only via `handleExhibitorCreated` `:296-305`). The triggers are at `:464`, `:472`, `:551`, `:556` and `:560`. The component root is a fragment (`:716-721`), so these overlays are siblings of the body and their parent is `div.min-h-[300px]`, with no `space-y` parent. |

### 2.2 QuickCreateFlow today (`components/shows/RegistrationWorkflow/QuickCreateFlow.tsx`, 471 lines)

**State and handlers**

- Props are at `:22-33` and `FlowState` at `:35-49` (`step: 'exhibitor'|'dogs'|'review'`, `exhibitor`, `exhibitorPendingMutationIds`, `dogs`).
- The child-dialog booleans are at `:63-64`. Progress is 25, 65 or 90 percent (`:68-73`).
- `handleExhibitorCreated` (`:76-89`) records the owner as created in this session, stores `pendingMutationIds`, advances to `dogs` and closes the dialog.
- `handleDogCreated` (`:92-101`) records the dog unless it already existed, then appends it. In `single` mode it also advances to review.
- `handleCompleteFlow` (`:112-123`) calls `onFlowCompleted({...exhibitor, dogs: ids}, dogs)` and then `handleClose`.
- `handleClose` (`:126-131`) resets state and calls `onOpenChange(false)`. Cancel and Complete use it.
- An effect (`:134-140`) auto-opens Add Person on the closed-to-open transition.

**Shell and the subtlety to keep**

- `shouldShowQuickCreateShell` (`QuickCreateFlow.helpers.ts:10-16`) hides the shell while a child dialog is open.
- The shell is a `<Dialog>` whose `DialogContent` is `max-w-3xl max-h-[85vh] overflow-y-auto` (`:146-147`).
- **Verified subtlety:** Escape, X and the backdrop call `onOpenChange` directly, not `handleClose`, so `flowState` is not reset and reopening resumes at the same step. Only Cancel and Complete reset. This plan preserves that.

**Step screens**

- Person (`:179-219`). "Edit Details" reopens a blank create form.
- Dogs (`:222-297`). Row Edit removes the dog and opens a blank Add Dog (`:251-260`).
- Review (`:300-400`).
- Navigation (`:404-443`).

**Child dialogs**

- `CreateExhibitorDialog` (`:448-455`) gets `offlineFirst` and `createdFromShowId`. `onDuplicateSelected` is not passed.
- `AddDogPanel` (`:457-468`) gets `variant="dialog"` (`:463`), `offlineFirst`, `offlineDependsOn=exhibitorPendingMutationIds`, `showStartDate` and `createdFromShowId`.

### 2.3 Add Person path

`CreateExhibitorDialog.tsx` (234 lines):

- Runs a duplicate check (`:116-135`, `DuplicateNotice` `:33-50`).
- Saves (`:137-200`) in one of two ways:
  - Offline: `replicatedShowDeskPeopleTable.createPerson({... createdFromShowId})`, then `getPendingMutationIdsForRow(person.id)`.
  - Online: `createUser({... created_from_show_id})`.
- Renders `UserEditPanel` with `variant="dialog"` hard-coded (`:228`).
- "Use This Person" calls `onDuplicateSelected?.()` and then closes (`:207-211`). Neither host passes `onDuplicateSelected` (see F3).

`components/panels/edit/UserEditPanel.tsx` (431 lines):

- In create mode it steps through Basic Info and then Contact (`UserEditPanel.validationTab.ts:6-9`).
- `variant` is passed through at `:394`. There is no `closeRequestRef` prop.
- The profile photo is hidden in create mode (`BasicInfoTab.tsx:97-98`), so Add Person opens no nested dialog.

### 2.4 Add Dog path (`components/panels/edit/AddDogPanel/index.tsx`, 432 lines)

**Saving**

- The panel remounts on `open` (`:34-36`).
- `handleSave` (`:70-170`) runs the duplicate-dog check and maps the form to `DogInput`, including `registrations`. Offline it calls `addDogOfflineFirst(dogInput, { dependsOn: offlineDependsOn, createdFromShowId })` (`:138`). Online it calls `addDog(dogInput, { createdFromShowId })`.
- Both live in `hooks/useDogStoreCompat.ts`:
  - `addDog` (`:89-184`) uses the RPC `create_dog_with_registrations`.
  - `addDogOfflineFirst` (`:186-245`) calls `replicatedDogRegistrationsTable.createLocalRegistrationsForDog`, then `replicatedDogsTable.createDogWithRegistrationsRpc(..., {dependsOn})`.
- Registrations at creation are form state (`AddDogPanel/types.ts:42-63`). They persist only through that save.

**Nested overlays inside Add Dog**

- **PhotoDialog** (`:395-415`), a Base UI `Dialog`.
- **AddEditRegistrationDialog**, inside `div.relative.z-[60]` (`:417-430`). It is opened by `useAddDogForm.openAddRegistration` and `openEditRegistration` (`useAddDogForm.ts:166-174`) and writes to form state through `handleSaveRegistration` (`:98-115`).
- The "Add New Registration" button is at `RegistrationTab.tsx:99-106`. The row Edit and Remove buttons there are icon-only with no accessible name (`:79-91`).

### 2.5 The registration slide-out stack (MYK9-1085)

`components/dogs/AddEditRegistrationDialog.tsx` (410 lines) is a `SlideOverPanel` (`:229-247`). It is used in three places:

- `AddDogPanel/index.tsx:423`: stacked, in every AddDogPanel variant.
- `ClassSelectionStep.tsx:702`: not stacked (opened from the page).
- `DogSelectionStep.tsx:388`: not stacked (opened from the page).

The only stack is therefore AddDogPanel.

**UNVERIFIED, likely a live bug today.** In the `dialog` variant this slide-out mounts inside Base UI `DialogContent`, which carries `translate-x-[-50%] translate-y-[-50%]` (`components/ui/dialog/dialog.tsx:103`), inside the `overflow-hidden` of `EditPanelDialogShell` (`EditPanelShells.tsx:31`). A `fixed inset-0` child of a transformed ancestor uses that ancestor as its containing block, so the "slide-out" is probably confined to the dialog box and clipped. Capture a "before" screenshot during the walk (§7.8).

### 2.6 The second registration form

`DogDetails/Registrations/AddRegistrationPanel.tsx` (301 lines) and `EditRegistrationPanel.tsx` (327 lines) are built on `EditPanelWrapper` and save to the database (`useRegistrationFormSaves.ts`). They differ from `AddEditRegistrationDialog` in five ways:

- the schema;
- the labels ("Breed" vs "Registered Breed");
- a Registration Date field;
- the breed control;
- the save contract (a database write vs an in-memory `Registration`).

A comment at `AddDogPanel/index.tsx:417-421` forbids swapping one for the other.

### 2.7 EditPanelWrapper modes (`components/panels/edit/EditPanelWrapper.tsx`, 556 lines)

- `dialog` (`:501-516`) renders through `EditPanelDialogShell`.
- `inline` (`:518-526`) renders through `EditPanelInlineShell` (`EditPanelShells.tsx:51-68`): an `h-full overflow-y-auto` scroller with a sticky `px-6` footer and **no body padding**.
- `closeRequestRef` is filled with `handleClose` (`:371-377`). `handleClose` waits while a save, delete or prompt is in progress, and shows the discard prompt when the form is dirty.
- For inline, `DiscardChangesDialog` uses `finalFocus: () => !confirmedCloseRef.current` (`:484-496`), so **the host must place focus after Discard**.

### 2.8 Precedent hosts

- **ManageRegistrationsPanel** (`DogDetails/Registrations/ManageRegistrationsPanel.tsx`, 132 lines):
  - The mode is derived from store flags.
  - `handlePanelClose` routes Escape, the backdrop, X and Back to `closeFormRef` while a form is open.
  - While a form is open it shows `showBackButton`/`onBack`, drops the panel footer, and puts the form in a `div.h-full` with `tabIndex=-1`.
  - Focus is handled by `useRegistrationModeFocus.ts`, and the tests are in `ManageRegistrationsPanel.mode.test.tsx`.
- **MessageCenterPanel** (`components/notifications/MessageCenterPanel.tsx`), with `useComposeModeFocus.ts`.

### 2.9 SlideOverPanel (`components/panels/SlideOverPanel.tsx`, 383 lines)

- It is not portaled (`:378-380`). Its root is `fixed inset-0 z-50` with `role="dialog" aria-modal="true"`.
- The size classes (`:36-41`) are overridden to full width between 640 and 767px (LESSON `slideover-size-band`).
- Escape answers only for the topmost overlay (`lib/overlayStack.ts`).
- **The focus trap (`:221-241`) does not skip focusables inside `[hidden]` or `[inert]`.** That matters for §4.2.
- An initial-focus fallback runs after 300ms.

### 2.10 Other `variant="dialog"` call sites in production

| Call site                                 | Used by                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `CreateExhibitorDialog.tsx:228`           | Quick Create, and the DogSelectionStepEnhanced (DSE) "Add Person Only" button                                                  |
| `QuickCreateFlow.tsx:463`                 | Quick Create                                                                                                                   |
| `DogSelectionStepEnhanced.tsx:412`        | "Dog Only"                                                                                                                     |
| `pages/onboarding/steps/StepDogs.tsx:113` | Exhibitor onboarding. Its parent is `div.space-y-4` (`:62`), which is the space-y trap if it becomes a non-portaled slide-out. |

Test-only uses:

- `EditPanelWrapper.routeGuard.test.tsx` (5×)
- `.steps.test.tsx:95`
- `.feedback.test.tsx:48`
- `.delete.test.tsx:53-72` (`describe.each(['dialog','panel'])`)
- `pages/ClassDetailsPage/ClassDetailsPage.deleteContract.test.tsx:87`

`EditPanelDialogShell` has no other importer.

### 2.11 Existing tests

- **Quick Create:** `QuickCreateFlow.test.tsx` (it asserts `shouldShowQuickCreateShell` 4×, and `variant: 'dialog'` at `:96-105`), `.reviewStep.test.tsx` and `.registeredName.test.tsx`. All three mock `CreateExhibitorDialog` and `AddDogPanel`.
- **CreateExhibitorDialog:** `CreateExhibitorDialog.test`, `.duplicates`, `.feedback`, `.partialAddress` and `.createdFromShow`.
- **DogSelectionStepEnhanced:** 10 render files (29 `it` blocks) plus `.helpers.test.ts`.
  - **Correction to the issue:** the issue says 13 DSE tests mount Quick Create. In fact all 10 render files mock `QuickCreateFlow`, `CreateExhibitorDialog` and `@/components/panels/edit`, so none mounts the real flow.
- **AddDogPanel:** `AddDogPanel/__tests__/*`.
- **AddEditRegistrationDialog:** `.save.test.tsx` and `.breed.test.tsx`.
- **SlideOverPanel:** `SlideOverPanel.test.tsx`.

### 2.12 E2E

`src/test/e2e/registration/secretaryNewUsers.spec.ts:124-232` walks Quick Create end to end. Its locators are:

- `getByText('Quick Registration Setup')` (`:144`)
- `getByRole('dialog', { name: 'Add Dog' })` (`:161`)
- `getByRole('dialog', { name: 'Add New Registration' })` (`:177`)
- the texts "Add First Dog", "Dogs Added (1):", "Review & Complete" and "Complete Setup"

This spec is in neither the PR-smoke list nor the Nightly list in `playwright.ci.config.ts`, so it has to be run by hand.

## 3. The duplication question

**Does this duplicate an existing surface? No.**

The change deletes three containers and keeps the work in one: the shell dialog, the `shouldShowQuickCreateShell` workaround, and (for this flow) the nested registration slide-out. The Person and Dog forms stay the single Person create form (`UserEditPanel` via `CreateExhibitorDialog`) and the single Dog create form (`AddDogPanel`), now rendered `inline` as #2906 did for registrations. No form body is copied.

Duplication this plan touches but does not remove:

1. **DSE has three create entry points.** "Add Person Only" auto-opens Add Dog, so it amounts to Quick Create without Review. Collapsing them is a product call (follow-up F5).
2. **There are two registration forms (§2.6).** Consolidating them is out of scope (follow-up F2). Their save contracts and validation differ, and the issue forbids validation changes.
3. **A third "mode inside a panel" focus hook.** The plan writes one generic hook, `components/panels/usePanelModeFocus.ts`. Migrating the other two is follow-up F4, so the shipped MYK9-1088/1089 code is not touched in a show-day-flow PR.

## 4. Design

### 4.1 One host panel, four views

`QuickCreateFlow` renders one `SlideOverPanel` with `size="xl"`.

| View                               | Title                                        | Header Back | Body                                                                                    | Footer                                                                    |
| ---------------------------------- | -------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `steps`                            | "Quick Registration Setup"                   | none        | the current step screen (Person / Dogs / Review), moved verbatim, plus the progress bar | Back / Cancel / Next: Add Dogs / Review / Complete Setup (moved verbatim) |
| `person-form`                      | "Add Person"                                 | yes         | `CreateExhibitorDialog variant="inline"`                                                | the inline form's own sticky footer                                       |
| `dog-form`                         | "Add Dog"                                    | yes         | `AddDogPanel variant="inline"`                                                          | the inline form's own sticky footer                                       |
| `dog-form` + registration sub-mode | "Add New Registration" / "Edit Registration" | yes         | the registration form inline. The dog form stays **mounted but `hidden` and `inert`**.  | the registration form's own Cancel / Save Registration                    |

The subtitle reads "Step N of 3: Add Person | Add Dog(s) | Review & Complete". UI copy uses no em dashes.

**Close routing** follows the ManageRegistrations pattern:

- Escape, the backdrop, X and header Back in `person-form` or `dog-form` call `closeFormRef.current?.()`. That shows the discard prompt if the form is dirty, and otherwise leaves the form.
- In the registration sub-mode they return to the dog form.
- In `steps`, they call `onOpenChange(false)` **without a reset**, which keeps today's resume behaviour. Cancel and Complete still reset.

**Leaving a form** (save, cancel, discard, or "use existing dog") returns to `view = 'steps'`, and the `flowState` handlers are unchanged. The auto-open effect sets `view = 'person-form'`. "Edit Details" and the dog row's "Edit" keep their current behaviour, now as a view switch.

### 4.2 Registrations inside Add Dog (Decision D2, recommended (a))

The registration form becomes a **sub-mode owned by AddDogPanel**, enabled only for `variant === 'inline'`.

1. **Lift the state.** Move the registration open/edit state up to `AddDogPanelSession`. The content publishes its `handleSaveRegistration` through a `saveRegistrationRef` that is refreshed every render.
2. **Render.** Wrap the dog form as `<div hidden={regOpen} inert={regOpen}>` around `<EditPanelWrapper variant="inline">`, so its state and active tab survive. Render `{regOpen && <RegistrationFormInline …/>}` next to it.
3. **Route close requests.** AddDogPanel accepts the host's `closeRequestRef` and fills it with a composite: in the sub-mode it leaves the sub-mode, otherwise it calls the wrapper's own close request. It reports `onSubModeChange?.('dog' | 'registration-add' | 'registration-edit')` so the host can update the title and Back.
4. **Place focus.** On entry, focus goes to the registration form's first control. On leaving, focus goes to "Add New Registration", or to the edited row's Edit button (add `data-edit-registration={reg.id}` in `RegistrationTab.tsx`).
5. **Extract the form body.** Move the registration body into `components/dogs/RegistrationFormBody.tsx` (fields, `useRegistrationEditor` state, schema, `onSubmitValid`). `AddEditRegistrationDialog` keeps exactly its current output. The inline form reuses `EditPanelInlineShell`. **No field, label or validation change.**
6. **Fix the SlideOverPanel focus trap** to skip focusables inside `[hidden]` or `[inert]` (filter with `!el.closest('[hidden],[inert]')`). Without this, Tab can land on a hidden dog-form control and escape the modal.

### 4.3 Photo inside Add Dog (Decision D4, recommended (c))

`PhotoDialog` is a dialog for a routine step inside the panel, which the acceptance criteria forbid. The recommendation is to hide the photo control when AddDogPanel is `inline`. Person create already omits the photo for the same reason, and the photo can be added later from the dog's profile. This affects Quick Create only.

### 4.4 Prop plumbing (no new container modes)

- **`UserEditPanel.types.ts`:** add `closeRequestRef`.
- **`CreateExhibitorDialog`:** add `variant` (default `'dialog'` in PR A, flipped in PR B) and `closeRequestRef`.
- **`AddDogPanel/types.ts`:** add `closeRequestRef` and `onSubModeChange`.
- **`EditPanelWrapper` `variant: 'inline'`** works as is. One gap: `EditPanelInlineShell` gives the body no padding, and AddDogPanel's content root is a bare `div.space-y-8`. It is **UNVERIFIED** how the panel variant pads it today. If the walk shows the dog form flush against the panel edges, add `p-6` to AddDogPanel's content root for variants other than `dialog`.

## 5. Decisions needed from the owner

**D1. The other `variant="dialog"` call sites** (DSE "Add Person Only" and "Dog Only", and onboarding `StepDogs`):

- (a) Convert all of them in the same PR.
- (b) Convert Quick Create only and keep `dialog` for the others indefinitely.
- **(c) Recommended:** Quick Create in PR A. Then PR B converts DSE's standalone dialogs and `StepDogs` to the default `panel` slide-out, which opens from a page and is not stacked. In `StepDogs`, move the panel out of the `space-y-4` div. This keeps the show-day PR small, and replaces the probable clipped slide-out inside a dialog (§2.5) with the known Dogs-page behaviour.

**D2. Adding registrations inside the flow:**

- **(a) Recommended:** an inline sub-mode owned by AddDogPanel (§4.2).
- (b) The same, plus restructuring AddDogPanel's `panel` variant so the stack disappears everywhere. That has a larger blast radius, so it is better as F1.
- (c) An expanding editor card inside the tab. Rejected: a half-typed registration can be silently lost when the dog is saved.
- (d) Keep the stacked slide-out. This fails the acceptance criteria.

**D3. Delete `variant: 'dialog'` from EditPanelWrapper afterward?**

- **Yes, recommended**, in PR B once D1(c) leaves zero production call sites.
- Delete `EditPanelDialogShell`, the `dialog` branch (which brings `EditPanelWrapper.tsx` under 500 lines) and its legend padding.
- Migrate the five test files in §2.10, and remove `'dialog'` from `EditPanelVariant` so TypeScript catches anything left over.
- If D1(b) is chosen instead, keep the variant.

**D4. Photo in Quick Create's Add Dog:**

- **(c) Recommended:** hide it when inline.
- (a) Add a photo sub-mode.
- (b) Keep `PhotoDialog` as a documented exception. This contradicts the acceptance criteria.

**D5. Escape and X on a step screen keep progress; Cancel resets.** This is today's verified behaviour. **Recommended: keep it.**

## 6. Phased implementation

**Gate before starting:**

- Run `pnpm qa:inflight` on the touched paths, and check Linear issues In Progress and `list_sessions`.
- Work in a worktree.
- PR A carries Phases 1-3 plus their tests. It is the structural batch and is reviewed as one. PR B carries Phase 4.

### Phase 1: plumbing and extraction, no behaviour change

**Changes:**

- `UserEditPanel.types.ts` and `UserEditPanel.tsx`: pass `closeRequestRef` through.
- `CreateExhibitorDialog.tsx`: pass `variant` (default `'dialog'`) and `closeRequestRef` through.
- `AddDogPanel/types.ts`: add the new props.
- `components/dogs/RegistrationFormBody.tsx` (new, about 250 lines). `AddEditRegistrationDialog.tsx` shrinks to a container (about 120 lines).
- `SlideOverPanel.tsx`: the focus trap skips `[hidden]` and `[inert]`.
- `components/panels/usePanelModeFocus.ts` (new).

**Verify:** `AddEditRegistrationDialog.save` and `.breed`, `CreateExhibitorDialog.*`, `UserEditPanel.*`, `SlideOverPanel.test` and `ManageRegistrationsPanel.mode.test` all pass unchanged. Add the new focus-trap test (§7.2).

### Phase 2: AddDogPanel inline registration sub-mode

**Changes:**

- `AddDogPanel/index.tsx`: the session lifts the registration state, wraps the dog form in hidden and inert, renders the inline registration form, composes the close request, reports `onSubModeChange`, and hides the photo when inline.
- `AddDogPanel/AddDogPanelContent.tsx` (new). This keeps `index.tsx` under 500 lines.
- `useAddDogForm.ts`: the registration open/save goes through the session when inline.
- `RegistrationTab.tsx`: add `data-edit-registration`.
- `BasicInfoTab.tsx`: the photo control becomes conditional.

**Verify:** the existing `AddDogPanel/__tests__/*` pass, and the new `AddDogPanel.inlineRegistration.test.tsx` passes.

### Phase 3: QuickCreateFlow as one slide-out

**Changes:**

- `QuickCreateFlow.tsx`: the host, the `view` state, close routing and focus. Target: under 220 lines.
- `QuickCreateSteps.tsx` (new): the step screens and progress, moved verbatim.
- `QuickCreateFooter.tsx` (new): the navigation, moved verbatim.
- `QuickCreateFlow.helpers.ts`: delete `shouldShowQuickCreateShell`. Add `quickCreateTitle(view, subMode)`, `quickCreateStepLabel(step)` and `quickCreateProgress(step)`.

**Verify:** §7.1, §7.2, §7.4 and §7.5.

### Phase 4 (PR B; only with D1(c) and D3 approved): convert the rest and delete the variant

**Changes:**

- `DogSelectionStepEnhanced.tsx` (`:397-417`): drop `variant="dialog"`.
- `CreateExhibitorDialog`: the default becomes `'panel'`.
- `StepDogs.tsx`: drop the variant and move the panel out of `space-y-4`.
- `EditPanelWrapper.tsx`, `EditPanelShells.tsx` and `EditPanelWrapper.types.ts`: delete the dialog variant.
- The five test files from §2.10.
- `StepDogs.test.tsx`: assert a slide-out.

**Verify:** §7.6, and re-walk onboarding and the DSE "Dog Only" / "Add Person Only" flows at three viewports (§7.8).

## 7. Testing phase (required; a phase is not done until its tests pass)

**Assertion-first.** Write T1-T3 first, run them **red on unmodified `origin/main`**, and record the red output in the PR. Helpers:

```ts
const dialogs = () => document.querySelectorAll('[role="dialog"]');
const panel = () => document.querySelector('.slide-over-panel');
```

Never count dialogs while a Select or the breed popover is open: Base UI popovers are also `role="dialog"` (`components/ui/searchable-popover.tsx:46`).

### 7.1 One panel (`__tests__/QuickCreateFlow.onePanel.test.tsx`, new)

Use the real `CreateExhibitorDialog`, which renders `UserEditPanel`, and the real `AddDogPanel`. Mock the data layer as `CreateExhibitorDialog.test.tsx` and `AddDogPanel.duplicate.test.tsx` already do.

**T1 (red before the change):**

1. **On open:**
   - `dialogs()` has length 1, and `dialogs()[0]` contains `panel()`.
   - "Step 1 of 3: Add Person" and the First Name field are inside it.
2. **After Add Person saves:** the same element is still the host (`toBe(host)`), and the "Add Dog(s)" heading is inside it.
3. **After Add First Dog:** still the same host, with the Call Name field inside it.
4. **After Registration tab, then "Add New Registration":** `dialogs()` has length 1 (it is **2** today), and the Registered Name field is inside the host.
5. **After Save Registration:**
   - The dog form returns with **Call Name still holding the typed value**, which proves the hidden form kept its state.
   - The registration row is listed.
   - No dialog named for a registration exists.

**T2 (`AddDogPanel/__tests__/AddDogPanel.inlineRegistration.test.tsx`):**

- With `variant="inline"`, the registration form renders in place, and `dialogs()` is 0 with no host.
- `onSubModeChange` is called with `'registration-add'` and then `'dog'`.
- The photo button is absent inline and present for `panel`.
- `addDog` receives `registrations: [{ organization: 'AKC (American Kennel Club)', number: 'DN12345601', registeredName: 'Mailbox Special Delivery', type: 'Golden Retriever', status: 'Active' }]`.

**T3 (submit unchanged):**

- Complete Setup calls `onFlowCompleted` with `(expect.objectContaining({ id: 'person-1', dogs: ['dog-1'] }), [expect.objectContaining({ id: 'dog-1' })])`.
- `onOpenChange(false)` is called.
- `recordOwnerCreated` and `recordDogCreated` are each called once.

### 7.2 Keyboard, focus and Escape (mirror `ManageRegistrationsPanel.mode.test.tsx` and #2898)

**Opening and Escape**

- Opening focuses First Name.
- On a clean form, the first Escape returns to the Person step with "Add Person" focused and the panel still open. A second Escape calls `onOpenChange(false)` without a reset.

**Dirty forms and the discard prompt**

- On a dirty form, each of Escape, header Back, X and the backdrop shows "Discard changes?" and keeps the typed value.
- "Keep editing" stays in the form.
- "Discard" goes to the step screen with focus inside `panel()`.
- Escape on the prompt answers the prompt without re-raising it.
- After Discard, focus stays in the panel even if an earlier popup was used. Open and close the Gender Select first to set this up.

**Registration sub-mode**

- Escape or Back returns to the dog form with its values intact. Focus goes to "Add New Registration", or to the row's Edit button.
- Tab from the last visible control wraps to the first visible control inside `panel()`, and Shift+Tab wraps the other way. This is red without the SlideOverPanel filter.

**After saves**

- After the dog saves, "Add Another Dog" has focus.
- After the person saves, "Add First Dog" has focus.

**SlideOverPanel known-answer test**

- In `SlideOverPanel.test.tsx`, the trap skips a focusable inside `[hidden]`.
- Break the filter and watch this test go red (LESSON `mutation-actually-mutated`).

### 7.3 Offline create (show day)

Run this through the real components, with `offlineFirst` and `createdFromShowId="show-1"`.

**Offline calls:**

- `replicatedShowDeskPeopleTable.createPerson` is called with `expect.objectContaining({ firstName: 'Molly', createdFromShowId: 'show-1' })`.
- `getPendingMutationIdsForRow('person-1')` is called.
- `addDogOfflineFirst` is called with `(expect.objectContaining({ ownerId: 'person-1', registrations: [expect.objectContaining({ number: 'DN1' })] }), { dependsOn: ['person-mutation-1'], createdFromShowId: 'show-1' })`.
- `createUser` and `addDog` are **not** called.

**Online mirror:** the reverse of the above.

Keep the existing "passes offline-first mode through" test, with its `variant` updated to `'inline'`.

### 7.4 Existing suites

- **`QuickCreateFlow.test.tsx`:** delete the 4 `shouldShowQuickCreateShell` tests, add the helper tests, and change `variant` to `'inline'`.
- **`.reviewStep` and `.registeredName`:** expected to pass unchanged. Treat "I had to rewrite a test" as a stop sign.
- **Run all of these:**
  - `CreateExhibitorDialog.*`
  - `AddDogPanel/__tests__/*`
  - `AddEditRegistrationDialog.*`
  - `UserEditPanel.*`
  - `EditPanelWrapper.*`
  - `ManageRegistrationsPanel.mode.test.tsx`
  - `MessageCenterPanel*.test.tsx`
- **The 10 DSE render files plus the helpers file:** run them; they mock the flow.
- **New `DogSelectionStepEnhanced.quickCreatePanel.test.tsx`:** do **not** mock QuickCreateFlow.
  - Click "Add Person & Dog(s)".
  - Assert `dialogs()` has length 1, `.slide-over-panel` is present, and First Name is inside it.
  - This is red today. It is the acceptance criterion's "fails before" assertion.

### 7.5 E2E locator audit (`secretaryNewUsers.spec.ts`)

- **`:144`:** use `getByRole('dialog', { name: 'Add Person' })` together with `getByText('Step 1 of 3: Add Person')`.
- **`:161`:** `getByRole('dialog', { name: 'Add Dog' })` still resolves to the host panel.
- **`:177`:** "Add New Registration" resolves to the same panel. Add `await expect(page.locator('.slide-over-panel')).toHaveCount(1)` after it.
- **Run the spec by hand** against the dev server, since it is in neither CI list.
- **For PR B:** also re-run `entities/dogsUI.spec.ts`, `dogPanelAccessibleNames.spec.ts` and `user-creation-validation.spec.ts`.

### 7.6 Suite gates

- `pnpm typecheck` and `pnpm lint`. For fast scoped checks use `npx tsc --noEmit -p tsconfig.app.json`, never `-p tsconfig.json`.
- `pnpm qa:code-quality-ratchet`: QuickCreateFlow, AddDogPanel/index and EditPanelWrapper must not grow, and EditPanelWrapper shrinks in PR B.
- The full app suite **shuffled**: once, or six times if any module-level mutable state is added.
- `pnpm qa:review-tier --base origin/main`.

### 7.7 Mutation checks

- Revert the SlideOverPanel filter and confirm the Tab-trap test fails.
- Render the registration path through `AddEditRegistrationDialog` and confirm T1's count assertion fails.

### 7.8 Signed-in browser walk (secretary; 375px, 768px, 700px and desktop at 1280+)

**Routes:** `/secretary/register/<showId>`, and the day-of path `?source=show-desk&entryMode=late`.

**First, on `main`:** take a "before" screenshot of Quick Create, then Add Dog, then Add New Registration, to settle the §2.5 clipping question.

**Full walk:**

1. Create New, then Exhibitor & Dog(s).
2. Add Person (both tabs).
3. Add First Dog (all three tabs), adding one registration through the sub-mode, then editing it and removing it.
4. Add Another Dog, then remove a dog.
5. Go Back through the steps, then Review, then Complete Setup. Expect "N dogs selected".
6. Repeat with Escape and X in each view.
7. Discard a dirty form.

**Console checks in each view:**

- `.slide-over-panel` count is 1.
- `[role=dialog]` count is 1 with no popover open.
- The panel root's rect equals the viewport.
- Walk from the panel root up to `body` and report any ancestor whose computed `transform`, `filter`, `backdrop-filter`, `perspective`, `contain` or `will-change` is not `none`/`auto`. Also report any `space-y-` parent, and any non-zero `margin-top` on the fixed root.

**Offline:** on the late-entry path, go offline in DevTools, then create Person, a Dog with a registration, and Complete. The mutations should queue and sync once back online.

**Layout checks:**

- whether the dog form is flush against the panel edges (§4.4);
- that popovers are positioned correctly;
- that the sticky footer clears the last field at 375px;
- that the 700px band renders full width.

Close the browser session afterward.

## 8. Review tier and risks

**Tier.** Nothing touched matches `INDEPENDENT_PATTERNS` (`scripts/qa/review-tier.ts`), so the floor is **`adversarial`**, with two or more lenses. Because this is the secretary's day-of new-entry path, also run `pnpm qa:codex-review` on PR A as a voluntary independent review. Review after the structural batch (PR A).

**Risks, each with its guard:**

1. **Offline day-of create.** The person's pending-mutation ids must reach `addDogOfflineFirst({dependsOn})`, and the registrations must go with the dog create. Guard: T3, §7.3 and the offline walk.
2. **Dog form state lost across the registration sub-mode.** AddDogPanel remounts when its `open` key changes, so the host must keep `open` true. Guard: T1's Call Name assertion.
3. **Focus escaping the modal,** through the hidden focusables or Discard's `finalFocus: false`. Guard: the §7.2 tests.
4. **Escape handled twice,** by SlideOverPanel and the prompt. The wrapper's `showUnsavedDialog` guard covers this. Guard: §7.2.
5. **Shared-component change to the SlideOverPanel trap filter.** It is narrow. Guard: the known-answer test and the full suite.
6. **Extracting `AddEditRegistrationDialog`** could affect its other callers. Guard: the unchanged `.save` and `.breed` tests, and an identical container DOM.
7. **Removing the photo from Quick Create (D4).** Call it out in the PR.
8. **PR B on onboarding:** the space-y trap, and the registration stack on the panel (the same as the Dogs page today). Guard: the walk.

## 9. Non-goals

- No new fields, validation changes or copy changes, other than the titles and the step subtitle.
- No change to the save paths or to the `onFlowCompleted` contract.
- No consolidation of the two registration forms (F2).
- No change to registration editing in ClassSelectionStep or DogSelectionStep, which are not stacked.
- No fix for three pre-existing behaviours:
  - "Use This Person" does nothing (F3).
  - "Edit Details" and the dog row's "Edit" open blank create forms (F6).
  - The icon-only registration buttons have no accessible names (F7).
- No removal of DSE's "Add Person Only" and "Dog Only" entry points (F5).
- No migration of the existing mode-focus hooks (F4).

## 10. Follow-up issues to file

Search Linear with `includeArchived: true` before filing, and link each one to the MYK9-1085 ledger.

- **F1.** AddDogPanel's registration slide-out still stacks on the panel in the `panel` and `dialog` variants (the Dogs page, onboarding `StepDogs`, DSE "Dog Only"). Restructure the `panel` variant into a host with an inline wrapper and the Phase 2 sub-mode.
- **F2.** Consolidate `AddEditRegistrationDialog` with `AddRegistrationPanel` / `EditRegistrationPanel`: one schema, one set of labels, one breed picker, and Registration Date. This needs an owner decision on the validation differences.
- **F3.** "Use This Person" in the duplicate-person card closes the form and selects nobody, in both Quick Create and DSE (`CreateExhibitorDialog.tsx:207-211`).
- **F4.** Migrate `useComposeModeFocus` and `useRegistrationModeFocus` to `usePanelModeFocus`.
- **F5.** Decide whether DSE "Add Person Only", which auto-opens Add Dog, should collapse into Quick Create. Rename `CreateExhibitorDialog` to `CreatePersonForm` if PR B does not.
- **F6.** Quick Create's "Edit Details" and the dog row's "Edit" open blank create forms for records already saved (`QuickCreateFlow.tsx:208-215`, `:251-260`).
- **F7.** Give the AddDogPanel `RegistrationTab` Edit and Remove icon buttons accessible names (`RegistrationTab.tsx:79-91`).
- **F8.** Add `secretaryNewUsers.spec.ts` to the Nightly list, or record why it stays manual.
- **F9.** Fix the AddDogPanel content padding in the panel variant, if the walk confirms it is flush.

## 11. Lifecycle

On the final merge (PR B, or PR A if D1(b) is chosen):

- Flip the status to `Complete`, `git mv` this file into `docs/archive/`, and drop its row in `docs/README.md`.
- Post the Linear close-out.
- Move MYK9-1081 to Done only after re-reading its full description and confirming the browser-walk evidence is recorded.
