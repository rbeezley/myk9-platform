# Handler Search Dialog — Design Spec

**Date:** 2026-03-18
**Status:** Approved

## Problem

The handler assignment dialog in the registration wizard (step 3) is a plain text input. When a user types an existing person's name (e.g., "test exhibitor"), it stores only the text — no link to their person record. Additionally, when a dog has no owner, `handlerId` defaults to `''`, causing the display to show "Not assigned" even after a successful save (because `!!''` is `false`).

## Solution

Replace the plain text input in `HandlerSelectionDialog` with a **combobox-style search** that queries the people table. If a match exists, selecting it captures the person's `id` and name. If no match exists, the typed text is accepted as free-text.

Fix the `hasHandler` display check and wizard validation to use `handlerName` (always present) instead of `handlerId` (empty for free-text entries).

## Scope

### In scope

- Replace `Input` with searchable combobox in `HandlerSelectionDialog`
- Search all people by name/email (no role filter)
- Allow free-text fallback when no match is found
- Fix `hasHandler` check in `HandlerAssignmentStep` and `InlineHandlerSection` (use `handlerName`)
- Fix `canProceed` validation in `RegistrationWizardPage` (use `handlerName`)

### Out of scope

- Creating new person records from the dialog
- Role-based filtering of handler candidates
- Visual distinction between person-linked and free-text handlers
- Full ARIA combobox semantics / keyboard arrow-key navigation (defer to future polish)

## Design

### HandlerSelectionDialog changes

**Current:** One `<Input>` per dog for typing a handler name.

**New:** One combobox per dog that:

1. Shows an input field where the user types
2. As the user types (≥2 characters), displays a dropdown of matching people from `useUserStore().people`, filtered via `filterPeopleByName()`
3. Each result row shows: full name, email (if available)
4. Clicking a result fills the input with the person's name and stores their `id`
5. If no results match, the dropdown shows "No matches — press Enter to use this name"
6. Pressing Enter or clicking Confirm accepts whatever is in the input (person or free text)
7. Reset-to-owner button remains unchanged

**Data output (unchanged shape):**

```typescript
// Person selected:
{ handlerId: "person-uuid", handlerName: "Jane Smith", isOwner: false }

// Free text:
{ handlerId: "", handlerName: "Some Handler", isOwner: false }

// Owner match (by person ID or name):
{ handlerId: "owner-uuid", handlerName: "John Owner", isOwner: true }
```

### Component approach

Rather than using the existing `SearchablePopover` (which is a button-triggered popover), build the search inline within the existing dialog layout. The dialog already has a card-per-dog structure with the input field — we replace the `Input` with a combobox that has a dropdown list beneath it. This keeps the dialog layout identical while adding search.

Use a simple controlled pattern:

- `handlerNames: Record<string, string>` — the input value per dog (existing state, unchanged)
- `selectedPersonIds: Record<string, string>` — tracks the person ID when a dropdown match is selected; cleared when the user edits the text (new state)
- `useMemo` to filter people as the user types, capped at 10 results
- A dropdown div (absolutely positioned) that appears when the input is focused and has ≥2 characters
- Click on a match to fill name + store person ID; pressing Enter or clicking Confirm accepts whatever is in the input
- The filtering threshold (≥2 chars) is enforced in the component, not in `filterPeopleByName()`

### handleSubmit rewrite

The current `handleSubmit` unconditionally sets `handlerId: dog?.ownerId || ''`. This must change to use the selected person's ID from the combobox:

```typescript
assignments[dogId] = {
  handlerId: selectedPersonIds[dogId] || '', // person ID from dropdown, or empty for free text
  handlerName: name,
  isOwner,
};
```

### isOwner determination

Currently `isOwner` is true when the typed name matches `dog.ownerName` (case-insensitive). Update to also check person ID:

```typescript
const isOwner =
  (dog?.ownerId && selectedPersonIds[dogId] === dog.ownerId) ||
  (!!dog?.ownerName && name.toLowerCase() === dog.ownerName.trim().toLowerCase());
```

### Bug fixes

**HandlerAssignmentStep.tsx line 55:**

```typescript
// Before:
hasHandler: !!handler?.handlerId,
// After:
hasHandler: !!handler?.handlerName,
```

**RegistrationWizardPage.tsx line 298:**

```typescript
// Before:
allEntryKeys.every(key => handlerAssignments[key]?.handlerId);
// After:
allEntryKeys.every(key => handlerAssignments[key]?.handlerName);
```

**RegistrationWizardPage.tsx line 291 (class-selection step fallback):**

```typescript
// Before:
return allKeys.every(key => handlerAssignments[key]?.handlerId);
// After:
return allKeys.every(key => handlerAssignments[key]?.handlerName);
```

**InlineHandlerSection.tsx line 52:**

```typescript
// Before:
hasHandler: !!handler?.handlerId,
// After:
hasHandler: !!handler?.handlerName,
```

### People data access

`HandlerSelectionDialog` needs access to the people list. Add `useUserStore` inside the dialog (same pattern as `ShowDetailsStep`). Call `loadPeople()` on mount if the list is empty.

### Files changed

| File                         | Change                                                |
| ---------------------------- | ----------------------------------------------------- |
| `HandlerSelectionDialog.tsx` | Replace Input with combobox search, add people lookup |
| `HandlerAssignmentStep.tsx`  | Fix `hasHandler` check                                |
| `InlineHandlerSection.tsx`   | Fix `hasHandler` check (same bug)                     |
| `RegistrationWizardPage.tsx` | Fix `canProceed` validation (2 places)                |

No type changes needed — `HandlerInfo` shape is unchanged, `handlerId` was already a string that could be empty.

### Loading state

If `people` is empty when the dialog opens, call `loadPeople()` on mount. While loading, show a "Loading..." indicator in the dropdown instead of "No matches."

## Testing

- Unit test: `HandlerSelectionDialog` — selecting a person from dropdown sets `handlerId` to their ID
- Unit test: `HandlerSelectionDialog` — free-text entry sets `handlerName` with empty `handlerId`
- Unit test: `HandlerAssignmentStep` — `hasHandler` returns true when `handlerName` is present but `handlerId` is empty
- Unit test: `InlineHandlerSection` — same `hasHandler` fix verified
- Unit test: `isOwner` determination — person ID match, name match, and neither
- Unit test: `canProceed` validation passes with empty `handlerId` but valid `handlerName`
- Manual test: reproduce original bug (dog with no owner → "Set all" → type name → verify display updates)
- Manual test: search for existing person → select → verify `handlerId` is populated
