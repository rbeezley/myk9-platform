# Org Entry Form Generation — Design Spec

**Date:** 2026-04-07
**Status:** Approved
**Scope:** AKC Scent Work entry form generation for trial secretaries

---

## Problem

Trial secretaries must submit official entry forms to sanctioning organizations (AKC) on request. Today this requires manually transcribing online registration data onto the AKC's paper/PDF entry form — tedious, error-prone, and scales poorly with entry count.

## Solution

Generate pre-filled AKC Scent Work entry forms from the platform's registration data. The secretary selects a show, optionally narrows to a trial or individual dog, and prints a batch of entry forms — one per dog per show — from the existing Reports page.

## Key Decisions

| Decision                             | Choice                         | Rationale                                                                                                             |
| ------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Rendering approach                   | HTML-to-Print (Approach A)     | Extends proven report engine, zero new dependencies, ~90% visual fidelity is sufficient for an on-demand records tool |
| Form unit                            | One form per dog per show      | Matches AKC form layout (class grid covers all trials in a show)                                                      |
| Consumer                             | Secretary-only, on-demand      | AKC requests these occasionally; no exhibitor-facing need                                                             |
| Template layout                      | Full AKC grid always rendered  | Fill offered trials/elements, leave rest blank. Standard layout AKC expects                                           |
| Optional fields (breeder, sire, dam) | Fill what's available          | Pull from related tables if populated, leave blank if not                                                             |
| Signature line                       | Digital consent note           | "Entered via myK9Show — agreement accepted digitally on [date]"                                                       |
| Future orgs                          | New component + registry entry | Pattern scales without infrastructure changes                                                                         |

---

## Architecture

### Report Registry Integration

Registered as a standard report in the existing report registry (`reportRegistry.ts`). No new pages, infrastructure, or dependencies.

```typescript
{
  id: 'akc-scent-work-entry-form',
  name: 'AKC Scent Work Entry Form',
  category: 'organization',
  scopes: ['show'],
  sortOptions: [
    { id: 'armband', label: 'Armband Number' },
    { id: 'owner-name', label: 'Owner Last Name' },
    { id: 'dog-name', label: 'Dog Registered Name' },
  ],
  defaultSort: 'armband',
  component: AKCScentWorkEntryForm,
  enabled: true,
}
```

### Scope Selection

The secretary accesses entry forms from the existing Reports page (`/secretary/reports`):

1. Select show
2. Pick "AKC Scent Work Entry Form" from report dropdown
3. Optionally narrow scope:
   - **Show** (default) — all dogs, batch printed
   - **Trial** — dogs entered in a specific trial
   - **Dog** — individual dog via new searchable combobox
4. Preview in iframe, print via browser

The dog picker is a new optional filter on `ReportControlsBar`, shown only when the selected report supports it. Requires a small extension to `ReportProps` (new `dogId?: string` field) and `ReportControlsBar` (conditional combobox).

### Data Flow

```
Secretary selects show + scope
  → ReportsPage passes showId, trialId, dogId to component via ReportProps
  → AKCScentWorkEntryForm calls useEntryFormData internally
    (existing reports use ReportProps.entries; this report needs richer data
     so it fetches its own — same pattern as ShowFlyerReport)
  → Groups entries by dog
  → Renders one HTML form page per dog
  → CSS page-break-before separates pages
  → iframe preview + browser print
```

---

## Data Requirements

### Data Sources Per Form

| Form Field               | Source Table                                   | Source Column(s)                                                                           |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Secretary name & address | `people` (via `user_roles` secretary for show) | `first_name`, `last_name`, `street_address`, `city`, `state`, `zip_code`                   |
| Trial dates & numbers    | `trials`                                       | `date`, `trial_number`                                                                     |
| Elements/classes offered | `classes`                                      | `element`, `level`                                                                         |
| AKC Registered Name      | `dog_registrations`                            | `registered_name`                                                                          |
| Registration Number      | `dog_registrations`                            | `registration_number`                                                                      |
| Registration type        | `dog_registrations`                            | `organization` (AKC/PAL/Foreign)                                                           |
| Call Name                | `dogs`                                         | `call_name`                                                                                |
| DOB, Sex, Breed          | `dogs`                                         | `date_of_birth`, `sex`, `breed`                                                            |
| Variety                  | `dog_registrations`                            | `variety`                                                                                  |
| Breeder                  | `people` via `dogs.breeder_id`                 | `first_name`, `last_name`                                                                  |
| Sire                     | `pedigree_ancestors`                           | `name` (position = 'sire')                                                                 |
| Dam                      | `pedigree_ancestors`                           | `name` (position = 'dam')                                                                  |
| Owner name & address     | `people` via `dogs.owner_id`                   | `first_name`, `last_name`, `street_address`, `city`, `state`, `zip_code`, `phone`, `email` |
| Handler                  | `entries`                                      | `handler_name` (if different from owner)                                                   |
| Class selections (grid)  | `entries` joined to `classes` + `trials`       | Match dog's entries to trial/element/level combos                                          |
| Agreement date           | `registrations`                                | `submitted_at`                                                                             |

### Dedicated Data Hook: `useEntryFormData`

Existing `useReportData` fetches entries + class info but not dog registrations, pedigree, or owner details. A new `useEntryFormData(showId, trialId?, dogId?)` hook handles the fuller join:

- Fetches all entries for the show (filtered by trial/dog if scoped)
- Joins dog details: `dogs` + `dog_registrations` (where `organization = 'AKC'`)
- Joins owner: `people` via `dogs.owner_id`
- Joins breeder: `people` via `dogs.breeder_id` (nullable)
- Joins pedigree: `pedigree_ancestors` for sire/dam (nullable)
- Fetches secretary info for the show header
- Fetches trial/class structure for the grid layout
- Groups result by dog, each dog carrying its entries, owner, registrations, and pedigree

Returns: `{ dogs: EntryFormDog[], secretary: EntryFormSecretary, trials: EntryFormTrial[], isLoading, isError }`

---

## Component Design

### `AKCScentWorkEntryForm.tsx`

Located at `apps/myk9show/src/components/reports/AKCScentWorkEntryForm.tsx`.

Receives the entry form dataset and renders N form pages (one per dog), separated by CSS page breaks.

**Form page layout per dog:**

```
┌──────────────────────────────────────────────┐
│  OFFICIAL ENTRY FORM                         │
│  Entries sent to: [secretary name & address]  │
├──────────────────────────────────────────────┤
│  Class Grid                                  │
│  Rows: up to 6 trials (2/day, Fri-Sat-Sun)  │
│  Cols: Cont. | Int. | Ext. | Buried |        │
│        Handler Disc. | Det.                  │
│  Cells: ☑/☐ Novice A/B, Adv, Exc, Master    │
├──────────────────────────────────────────────┤
│  AKC Registered Name    | Registration #     │
│  Call Name | DOB | Sex  | Breed | Variety    │
│  Breeder                | Sire               │
│  Dam                                         │
│  Owner                                       │
│  Address | City | State | Zip                │
│  Phone   | Email                             │
│  Handler (if different from owner)           │
├──────────────────────────────────────────────┤
│  AGREEMENT (static AKC text)                 │
│  INSTRUCTIONS (static AKC text)              │
│  "Entered via myK9Show — agreement accepted  │
│   digitally on [date]"                       │
└──────────────────────────────────────────────┘
```

**Class grid logic:**

- Build a 6-row (trials) x 6-column (elements) grid from the show's trial/class structure
- For each cell, check if this dog has an entry matching that trial + element + level
- Render ☑ for matched classes, ☐ for unmatched
- Novice entries: circle A or B based on entry data
- Empty rows/columns for trials or elements not offered at this show remain as blank checkboxes (per AKC standard template decision)

**Agreement text:** Static string matching the official AKC Scent Work entry form agreement, embedded in the component. Below the agreement: "Entered via myK9Show — agreement accepted digitally on [submitted_at date]".

**Sort options:** Dogs are sorted within the batch by the selected sort order (armband number, owner last name, or dog registered name).

### Styles

Inline styles in the component following the pattern of existing reports (CheckInSheet, ScoresheetReport). Uses `reportStyles.ts` base styles. Form-specific table borders, checkbox rendering, and font sizing are component-local.

---

## ReportControlsBar Extension

### Dog Picker

A new optional filter added to `ReportControlsBar`:

- Only shown when the selected report declares it supports dog-level filtering (new `supportsDogFilter?: boolean` on `ReportDefinition`)
- Searchable combobox listing all dogs entered in the selected show
- Display: "Call Name (Registered Name) — Armband #NNN"
- Default: "All Dogs" (no filter)
- Selection sets `dogId` on report props

### ReportProps Extension

```typescript
// Added to existing ReportProps interface
dogId?: string;         // Optional dog filter
dogName?: string;       // For display in header
```

### ReportDefinition Extension

```typescript
// Added to existing ReportDefinition interface
supportsDogFilter?: boolean;  // Show dog picker in controls
```

---

## Testing

- **Unit tests for class grid logic:** Given a dog's entries and the show's trial/class structure, verify correct checkbox mapping (☑ vs ☐)
- **Unit tests for data grouping:** Verify entries are correctly grouped by dog, sorted by selected sort order
- **Component tests:** Verify form renders with sample data — correct field values, correct number of pages, page breaks present
- **Dog picker tests:** Verify combobox filters report output to single dog
- **Edge cases:** Dog with no registration data (graceful blanks), dog entered in only one trial, show with only one element offered, missing breeder/sire/dam

---

## Files

| File                                                                           | Purpose                               |
| ------------------------------------------------------------------------------ | ------------------------------------- |
| `apps/myk9show/src/components/reports/AKCScentWorkEntryForm.tsx`               | Form component                        |
| `apps/myk9show/src/hooks/queries/useEntryFormData.ts`                          | Data fetching hook                    |
| `apps/myk9show/src/lib/reports/reportRegistry.ts`                              | Add registry entry                    |
| `apps/myk9show/src/lib/reports/types.ts`                                       | Extend ReportProps + ReportDefinition |
| `apps/myk9show/src/pages/secretary/ReportsPage/ReportControlsBar.tsx`          | Add dog picker                        |
| `apps/myk9show/src/components/reports/__tests__/AKCScentWorkEntryForm.test.ts` | Tests                                 |
| `apps/myk9show/src/hooks/queries/__tests__/useEntryFormData.test.ts`           | Hook tests                            |

---

## Out of Scope

- **Other organizations** (UKC, NACSW, CPE) — future work, same pattern
- **PDF template overlay** (Approach C) — upgrade path if pixel-perfect fidelity is ever needed
- **Exhibitor-facing form access** — secretary-only tool
- **Digital signature capture** — not needed; digital consent note suffices
- **Form template database table** — not needed for a single hardcoded form; add when second org is implemented
- **AKC logo embedding** — nice-to-have, not required for v1
