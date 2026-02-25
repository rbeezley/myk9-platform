# Dog CRUD E2E Test Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify the full dog CRUD lifecycle (create, edit, delete) via Claude Preview and fix any bugs found.

**Architecture:** Interactive browser testing using preview_* tools against the myK9Show dev server (localhost:5173). Sequential test flow on a single dog entity. Bugs fixed inline in source code.

**Tech Stack:** Claude Preview tools, Vite dev server, React + TypeScript (myK9Show app)

---

### Task 1: Start Dev Server and Navigate to Dogs Page

**Step 1: Start the myK9Show dev server**

Use `preview_start` with name `"myk9show"` (configured in `.claude/launch.json`).

Expected: Server starts on port 5173.

**Step 2: Verify server is running**

Use `preview_logs` to check for compilation errors.

Expected: No errors, Vite ready message.

**Step 3: Navigate to the dogs page**

Use `preview_eval` to navigate: `window.location.href = '/dogs'`

**Step 4: Take initial screenshot**

Use `preview_screenshot` to capture the Dogs page state.

Expected: Dogs page loads with sidebar and either existing dogs or an empty state.

**Step 5: Check for initial errors**

Use `preview_console_logs` with `level: "error"`.

Expected: Zero errors.

---

### Task 2: CREATE — Open AddDogPanel and Fill Basic Info Tab

**Step 1: Find and click the "Add Dog" button**

Use `preview_snapshot` to identify the Add Dog button/link. Then use `preview_click` with the appropriate selector.

Expected: AddDogPanel slides open with Basic Info tab active.

**Step 2: Verify no stale validation errors on mount**

Use `preview_snapshot` to check the panel content.

Expected: No error messages visible — form should be clean on first open. If validation errors appear immediately, this is a bug (same pattern as club CRUD EditPanelWrapper issue). Fix by adding `isTouched` state guard.

**Step 3: [ADDED] Check owner field visibility**

Use `preview_snapshot` to check if an "Owner" selector is visible. This field should only appear for admin roles (SITE_ADMIN, CLUB_ADMIN, SECRETARY). Note whether it is visible or hidden — this validates role-based field visibility. If visible, leave it on the default (current user).

**Step 4: Fill call name**

Use `preview_fill` with selector for the call name input, value `"Buddy Test"`.

**Step 5: Select gender**

Use `preview_snapshot` to find the gender selector. Use `preview_click` or `preview_fill` to select "Male".

**Step 5: Fill date of birth**

Use `preview_fill` with the DOB input, value `"2022-03-15"` or interact with the date picker.

**Step 6: Verify Basic Info tab state**

Use `preview_snapshot` to confirm all fields are filled correctly.

**Step 7: Check console for errors**

Use `preview_console_logs` with `level: "error"`.

Expected: Zero errors.

---

### Task 3: CREATE — Fill Registration Tab

**Step 1: Switch to Registration tab**

Use `preview_click` on the Registration tab.

Expected: Registration tab content loads.

**Step 2: Add a registration**

Use `preview_snapshot` to identify the "Add Registration" button or form. Click it.

**Step 3: Fill registration fields**

Fill the registration form:
- Organization: "AKC"
- Number: "DN12345678"
- Breed: "Golden Retriever"
- Status: "Active"

Use `preview_fill` for text inputs and `preview_click`/`preview_fill` for selects.

**Step 4: Verify registration appears in list**

Use `preview_snapshot` to confirm the registration entry is visible.

**Step 5: Check console for errors**

Use `preview_console_logs` with `level: "error"`.

Expected: Zero errors.

---

### Task 4: CREATE — Fill Additional Info Tab and Save

**Step 1: Switch to Additional Info tab**

Use `preview_click` on the Additional Info tab.

**Step 2: Fill additional fields**

Use `preview_fill` for each field:
- Color: "Golden"
- Weight: "65"
- Height: "23"
- Microchip: "985112345678901"
- Notes: "Test dog for CRUD validation"

**Step 3: Toggle spayed/neutered**

Use `preview_snapshot` to find the spayed/neutered checkbox or toggle. Use `preview_click` to set it to checked/Yes.

This field was recently added (commits 54d2731, 9620b90) — high risk for data pipeline issues.

**Step 4: [ADDED] Test photo upload (if PhotoDialog is accessible)**

Use `preview_snapshot` to check if a photo upload button or avatar click area is available on the form. If present:
- Click to open the PhotoDialog
- Use `preview_snapshot` to verify the dialog opens
- Close without uploading (test dialog open/close cycle)
- Check console for errors

If photo upload is only accessible from the edit panel or detail page, skip and test during Task 6 instead. The key verification is that the photo dialog opens/closes without errors and that dogs without photos render correctly (no `src=""` console errors).

**Step 5: Click Save**

Use `preview_snapshot` to find the Save button. Use `preview_click` to submit.

**Step 5: Wait for navigation**

Use `preview_eval`: `window.location.pathname` to check if the URL changed to `/dogs/<new-id>`.

If still on the same page, check for validation errors via `preview_snapshot`.

**Step 6: Check for errors after save**

Use `preview_console_logs` with `level: "error"`.
Use `preview_network` with `filter: "failed"`.

Expected: Zero errors, zero failed requests.

---

### Task 5: CREATE — Verify Dog Details Page

**Step 1: Take screenshot of dog details page**

Use `preview_screenshot` to capture the new dog's detail page.

**Step 2: Verify all fields via snapshot**

Use `preview_snapshot` to read the page content. Verify these fields are displayed:
- Call name: "Buddy Test"
- Gender: Male
- DOB: March 15, 2022 (or 2022-03-15 format)
- Color: Golden
- Weight: 65
- Height: 23
- Microchip: 985112345678901
- Spayed/Neutered: Yes
- Notes: "Test dog for CRUD validation"

**Step 3: Check registration display**

Look for the registration section. Verify:
- AKC registration with number DN12345678
- Breed: Golden Retriever
- Status: Active

If registrations are missing, this indicates a `syncDogRegistrations()` failure — investigate `dogQueries.ts`.

**Step 4: Check dog appears in sidebar**

Use `preview_snapshot` to verify "Buddy Test" appears in the dog sidebar list.

**Step 5: Check console and network**

Use `preview_console_logs` with `level: "error"`.
Use `preview_network` with `filter: "failed"`.

Expected: Zero errors, zero failed requests.

---

### Task 6: EDIT — Open Edit Panel and Modify Fields

**Step 1: Find and click the Edit button**

Use `preview_snapshot` to locate the Edit button (likely in HeroProfileCard header). Use `preview_click`.

Expected: DogEditPanel opens with existing data pre-filled.

**Step 2: Verify pre-filled data**

Use `preview_snapshot` to confirm all fields show the values from creation:
- Call name: "Buddy Test"
- Gender: Male
- DOB: 2022-03-15
- Color: Golden
- Weight: 65
- Height: 23
- Spayed/Neutered: Yes

**Step 3: Edit call name**

Use `preview_fill` to change call name to "Buddy Updated".

**Step 4: Edit weight**

Use `preview_fill` to change weight to "68".

**Step 5: Toggle spayed/neutered**

Use `preview_click` on the spayed/neutered toggle to change from Yes to No.

This tests the round-trip of the recently-added field.

**Step 6: [ADDED] Switch to Registrations tab and add a second registration**

Use `preview_click` to switch to the Registrations tab. Use `preview_snapshot` to see the existing AKC registration. Click "Add Registration" and fill:
- Organization: "UKC"
- Number: "R123-456"
- Breed: "Golden Retriever"
- Status: "Active"

Use `preview_snapshot` to verify both registrations are listed. This tests `syncDogRegistrations()` handling of additions during edit.

**Step 7: Check console for errors**

Use `preview_console_logs` with `level: "error"`.

Expected: Zero errors.

---

### Task 7: EDIT — Save and Verify Persistence

**Step 1: Click Save in edit panel**

Use `preview_click` on the Save button.

**Step 2: Verify changes on detail page**

Use `preview_snapshot` to confirm updated values:
- Call name: "Buddy Updated"
- Weight: 68
- Spayed/Neutered: No
- [ADDED] Both registrations visible (AKC DN12345678 + UKC R123-456)

All other fields should remain unchanged.

**Step 3: Check for errors after save**

Use `preview_console_logs` with `level: "error"`.
Use `preview_network` with `filter: "failed"`.

Expected: Zero errors, zero failed requests.

**Step 4: Reload the page to test round-trip persistence**

Use `preview_eval`: `window.location.reload()`

Wait briefly, then use `preview_snapshot` to re-verify the updated values survive a full page reload (proves data is persisted, not just in local React state).

Expected: All edited values still display correctly after reload.

**Step 5: Take screenshot as proof of edit persistence**

Use `preview_screenshot` to capture the detail page showing the edited values after reload.

---

### Task 8: DELETE — Delete Dog and Verify Cleanup

**Step 1: Find the delete action**

Use `preview_snapshot` to locate the delete button or menu item (likely in the dog header dropdown or HeroProfileCard). Use `preview_click`.

Expected: DeleteDogDialog appears with confirmation prompt.

**Step 2: Take screenshot of delete confirmation**

Use `preview_screenshot` to capture the dialog.

**Step 3: Confirm deletion**

Use `preview_click` on the confirm/delete button in the dialog.

**Step 4: Verify navigation after deletion**

Use `preview_eval`: `window.location.pathname` to check URL.

Expected: Navigated to another dog's detail page (if dogs exist) or `/dogs` (empty state).

**Step 5: Verify dog removed from sidebar**

Use `preview_snapshot` to confirm "Buddy Updated" no longer appears in the sidebar.

**Step 6: Check for errors**

Use `preview_console_logs` with `level: "error"`.
Use `preview_network` with `filter: "failed"`.

Expected: Zero errors, zero failed requests.

**Step 7: Take screenshot of final state**

Use `preview_screenshot` to capture the post-deletion state.

---

### Task 9: Edge Cases — Avatar and CSS Checks

**Step 1: Check avatar rendering on existing dogs**

If dogs exist in the sidebar, use `preview_snapshot` to check avatar elements. Look for any `<img>` tags with empty `src` attributes.

Use `preview_console_logs` to look for network errors related to empty src.

Expected: No `src=""` errors (avatar.tsx should guard against this — fixed in club CRUD, verify fix applies here).

**Step 2: Check for CSS overflow/clipping**

Use `preview_inspect` on the dog details card container. Check for `overflow: hidden` that might clip dropdown menus.

If the dog header has a dropdown menu, use `preview_click` to open it and `preview_screenshot` to verify it renders without clipping.

**Step 3: Check for dead DogProfileEditDialog references**

This was deleted in commit 13277e0. If any imports or references remain, they would cause runtime errors already visible in console logs from previous steps. Verify console is still clean.

---

### Task 10: Edge Cases — Inline Creation from Person Page

**Step 1: Navigate to a person's page**

Use `preview_eval`: `window.location.href = '/people'`

Use `preview_snapshot` to find a person entry. Click to navigate to their detail page.

**Step 2: Test the ?add=true flow**

Use `preview_eval`: append `?add=true` to the current dog URL, or find the "Add Dog" action from a person's profile.

Expected: AddDogPanel opens with the person pre-selected as owner (if applicable).

**Step 3: Verify clean form state**

Use `preview_snapshot` to confirm the form is clean — no stale data from the previous "Buddy Test" creation.

**Step 4: Close without saving**

Close the panel (Escape or cancel button). Verify no errors.

**Step 5: Final console and network check**

Use `preview_console_logs` with `level: "error"`.
Use `preview_network` with `filter: "failed"`.

Expected: Zero errors across the entire test session.

---

### Task 11: Fix Any Bugs Found

For each bug discovered during Tasks 1-10:

**Step 1: Document the bug**

Note the symptom, which task/step it occurred in, and the console/network error details.

**Step 2: Read the relevant source file**

Use the Read tool to examine the source code causing the bug.

**Step 3: Fix the bug**

Edit the source file to fix the issue. Follow existing patterns (e.g., `isTouched` for validation, `!src` guard for avatar, removing `overflow-hidden` for clipping).

**Step 4: Verify the fix**

Re-run the failed step in the browser to confirm the fix works.

**Step 5: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: Zero errors.

---

### Task 12: Update TO-DOS.md and Commit

**Step 1: Update the todo entry**

Edit `TO-DOS.md` to mark the dog CRUD todo as complete (`[x]`). Add a summary of results and any bugs found/fixed, following the same format as the club CRUD entry.

**Step 2: Commit all changes**

```bash
git add docs/plans/2026-02-25-dog-crud-e2e-test-design.md docs/plans/2026-02-25-dog-crud-e2e-test-plan.md TO-DOS.md [any-bug-fix-files]
git commit -m "test(dogs): verify full CRUD lifecycle via E2E testing

- Tested create, edit, delete flows with full field coverage
- Verified data round-trip persistence after page reload
- [Document any bugs found and fixed]

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
