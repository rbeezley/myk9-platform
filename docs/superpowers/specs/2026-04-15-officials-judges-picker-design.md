# Officials & Judges Picker — Design Spec

**Date:** 2026-04-15  
**Status:** Approved  
**Scope:** Show Creation Wizard — Show Officials and Show Judges sections

---

## Problem Summary

Two root bugs block the secretary golden path:

1. `userStore.people` is never loaded on wizard mount — all three pickers (chairman, secretary, judges) show empty lists when the store is cold.
2. `getAvailableJudges` hard-filters on `UserRole.JUDGE` — anyone without the platform JUDGE role is hidden from the judges picker, even if they exist in the system.

Beyond the bugs, the UX is actively confusing: the secretary dropdown shows all people unfiltered with no grouping, making it hard to find the right person. And the "Create New" button is always visible, steering secretaries toward creating duplicate records.

**Key context from domain:**
- Secretaries create shows and assign themselves as secretary — they shouldn't have to search for their own name.
- Chairmen and judges may not have platform accounts. They need to be on the show record for reporting, not for system access.
- Role assignment (JUDGE, CHAIRMAN, etc.) is admin-only. It must not be a bottleneck for show creation.
- Judge number is stored in `judge_qualifications` (separate from `people`), not on the platform JUDGE role.

---

## Approved Design: Grouped Combobox with Smart Suggestions

Replace the flat `SearchablePopover` with a `GroupedSearchablePopover` for all three pickers. Fixes both root bugs. Makes the right answer easy to find. Keeps the admin out of the critical path.

---

## Show Secretary Field

**Behavior:** Auto-filled with the logged-in user's name on wizard mount. A subtle "You" badge marks the auto-fill. The field remains overridable — opening the picker allows selecting any other person.

**Data source:** `AuthContext` (first name + last name already available at `AuthContext.tsx:171`).

**Fallback:** If `currentUser` has no name on record, field is empty and behaves like a normal search picker.

---

## Show Chairman Field

**Behavior:** Grouped combobox. Two sections:
- **Suggested — Club Officers:** People with the CHAIRMAN platform role, if any exist.
- **All People:** Everyone else, sorted alphabetically.

**"Add new chairman" footer button:** Always visible at the bottom of the popover. Clicking it expands an inline form directly beneath the popover. Clicking Cancel collapses it.

**Inline create form — required fields:**
- First name
- Last name
- Email

On save: creates a new `people` record. No platform role is assigned. The person is a name on the show, not a platform user.

---

## Show Judges Field

**Behavior:** Multi-select. Selected judges appear as removable chips (name + judge number) above the search trigger. Grouped combobox with two sections:
- **Qualified Judges — Credentials on File:** People who have at least one `judge_qualifications` row. Shows org + judge number in a badge, and disciplines in subtext.
- **All People — No Credentials Yet:** Everyone else.

**Selecting from "Qualified Judges":** Adds the person as a chip immediately. No additional form needed.

**Selecting from "All People":** Opens an inline "Add Judge Credentials" form for that specific person. The form title reads "Add Judge Credentials — [Full Name]". A green confirmation note reads: "Adding credentials to [Name]'s existing profile. No duplicate record will be created."

**Add credentials form — required fields:**
- Organization (AKC / UKC dropdown)
- Judge Number
- Email (pre-filled from existing `people` record if available)

On save: creates a `judge_qualifications` row linked to the existing `people.id`. Adds the person as a chip on the show.

**"Add new judge" footer button:** Labeled "(person not in system)". Always visible. Expands an inline form for creating both a `people` record and a `judge_qualifications` row in one step.

**Add new judge form — required fields:**
- First name
- Last name
- Organization (AKC / UKC dropdown)
- Judge Number
- Email

On save: creates `people` row + `judge_qualifications` row. Adds person as a chip on the show.

**No platform role is assigned in either case.** JUDGE role remains admin-managed and is not required for a person to be assigned to a show.

---

## GroupedSearchablePopover Component

New shared component extending the existing `SearchablePopover`. Props:

```typescript
interface GroupedSearchablePopoverProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: string;
  searchPlaceholder: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  groups: Array<{
    label: string;
    items: T[];
    groupKey: string;          // passed to onSelect so parent knows which group
    emptyMessage?: string;
  }>;
  renderItem: (item: T, groupKey: string) => React.ReactNode;
  onSelect: (item: T, groupKey: string) => void;
  footer?: React.ReactNode;   // "Add new" button rendered as popover footer
}
```

Each group renders a section header and its items. Groups with zero items are hidden. The footer slot renders after all groups.

**Parent-managed form state:** `GroupedSearchablePopover` does not own the inline forms. The parent component (`ShowDetailsStep`) owns two additional state flags: `addCredentialsFor: User | null` (set when user selects from the "All People" group) and `showNewJudgeForm: boolean` (set when "Add new judge" footer is clicked). The forms render below the trigger in the parent, not inside the popover. This keeps the popover component generic and reusable.

---

## Data Loading Fix

Add `loadPeople()` call on wizard mount in `ShowDetailsStep.tsx` — same pattern as the existing `loadClubs()` call:

```typescript
useEffect(() => {
  if (people.length === 0) {
    loadPeople();
  }
}, [people.length, loadPeople]);
```

This ensures the people list is populated when the wizard opens regardless of how the user navigated to it.

---

## Suggested Section Logic

| Picker | "Suggested" criteria |
|--------|----------------------|
| Chairman | `person.roles?.includes(UserRole.CLUB_ADMIN \| UserRole.CHAIRMAN)` |
| Secretary | `person.roles?.includes(UserRole.SECRETARY)` |
| Judges | `person has at least one judge_qualifications row` |

Suggested criteria are hints for discoverability only — they do not restrict selection. Anyone from "All People" can be assigned to any role.

The judges "Suggested" section uses `judge_qualifications` presence as the signal, not the JUDGE platform role. This is more accurate: a person can have the JUDGE role without credentials, or have credentials without the role.

---

## Inline Form UX Rules

- "Add new" button is always visible as a popover footer.
- Clicking "Add new" expands the form inline below the popover. The popover itself closes.
- Clicking Cancel collapses the form, no changes saved.
- All required fields must be filled before save is enabled.
- On successful save, the new person/credentials are immediately reflected — the person appears as a chip (judges) or as the selected name (officials).

---

## What This Does Not Change

- Platform role assignment remains admin-only. Show creation never grants roles.
- The JUDGE role is not required to be assigned to a show as a judge.
- The existing `resolveSelectedJudges`, `filterClubs`, and `filterPeopleByName` helpers are reused where applicable.
- The existing "Create New" panel flows (opened via `panelManager.openPanel`) are removed from the wizard — replaced by the inline forms described above.

---

## Pre-Production Data Task (out of scope for this feature)

Pre-loading the AKC and UKC judge directories before launch would significantly reduce the need for secretaries to create new judge entries. Format TBD — need to check what download/export options AKC and UKC provide. When available, this would be a one-time migration script creating `people` + `judge_qualifications` rows. Email would not be available from the directory; it would be collected the first time a secretary assigns that judge to a show (prompted by the "Add credentials" inline form showing an empty email field).

---

## Testing Requirements

- Unit tests for `GroupedSearchablePopover`: renders groups, hides empty groups, footer slot renders, search filters across all groups.
- Unit tests for the secretary auto-fill: logged-in user is pre-selected on mount; overridable.
- Unit tests for judge selection paths: (a) select from Suggested → chip added, (b) select from All People → credentials form opens, (c) Add new judge → full form, (d) form validation fires on missing fields.
- Unit test for `loadPeople` trigger on mount when store is empty.
- E2E: open wizard cold (empty store), confirm all three pickers show results; assign self as secretary; assign a judge from Suggested; create a new judge inline.
