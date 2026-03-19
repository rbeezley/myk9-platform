# Icon Consistency Policy — Design Spec

**Date:** 2026-03-19
**Goal:** Establish and apply a consistent icon policy across myK9Show buttons and tabs for a polished, professional look.
**Approach:** Moderate coverage — icons on all tab triggers and all standalone action buttons. No icons on inline links, dialog footer dismissals, minor toggles, or filter chips.

---

## Rules

### Where icons go

- **All tab group triggers** — every `TabsTrigger` gets a Lucide icon before the label
- **All standalone action buttons** — Create, Add, Save, Cancel, Delete, Export, Edit, Back, Next
- **Empty state call-to-action buttons** — primary actions in empty/error states

### Where icons don't go

- Inline text links (`<a>` or `Link` within paragraphs)
- Dialog footer Cancel buttons (dismissals, not actions — text-only keeps them visually subordinate)
- Minor toggles and filter chips
- Dropdown menu items (already have icons where appropriate — no blanket change)

### Placement and sizing

- Icon **before** text (existing pattern, no change)
- Standard size: `h-4 w-4` for all buttons and tabs
- Icon-only buttons must have `aria-label`
- All icons from `lucide-react` (no other icon libraries)

---

## Icon Mappings

### Common action buttons

| Action            | Lucide Icon  | Notes                                              |
| ----------------- | ------------ | -------------------------------------------------- |
| Create / Add      | `Plus`       | Already used in AddDogButton, wizards              |
| Save              | `Save`       | Already used in WizardNavigation                   |
| Cancel            | `X`          | Standalone cancel buttons only, not dialog footers |
| Delete            | `Trash2`     | Destructive actions                                |
| Edit              | `Pencil`     | Consistent with existing edit patterns             |
| Export / Download | `Download`   | Already used in RunOrderHeader                     |
| Back / Return     | `ArrowLeft`  | Already used in wizards, nav                       |
| Next / Continue   | `ArrowRight` | Already used in WizardNavigation                   |
| Browse / View     | `Eye`        | Already used in MyEntryCard                        |
| Clear Filters     | `RotateCcw`  | Reset semantics                                    |
| Checkout          | `CreditCard` | Cart/payment flow                                  |

### Tab groups needing icons

| Tab Group               | File                                | Tabs → Icons                                                                                                 |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| ClubDetails             | `ClubDetails/index.tsx`             | Upcoming Shows → `Calendar`, Past Shows → `History`, About → `Info`, Members → `Users`, Branding → `Palette` |
| JudgeDashboard          | `JudgeDashboard.tsx`                | Today → `CalendarDays`, Upcoming → `Calendar`, Completed → `CheckCircle`                                     |
| TrialManagementTabs     | `TrialManagementTabs.tsx`           | Active → `Play`, Upcoming → `Calendar`, Completed → `CheckCircle`                                            |
| CompetitionsTabs        | `CompetitionsTabs.tsx`              | Upcoming → `Calendar`, Past → `History`, Achievements → `Award`                                              |
| SyncMonitoringDashboard | `SyncMonitoringDashboard/index.tsx` | Overview → `LayoutDashboard`, Performance → `Gauge`, Conflicts → `AlertTriangle`, Network → `Wifi`           |
| DogDetailsTabs          | `DogDetailsTabs.tsx`                | Competitions → `Trophy` (only tab missing a content icon)                                                    |

### Already consistent (no changes needed)

- ShowDetailsPage tabs (Overview, Trials, Classes, My Entries — all have icons)
- AddDogPanel TabNavigation (all 3 tabs have icons + validation checkmarks)
- Sidebar navigation (every item has an icon)
- WizardNavigation buttons (Next, Back, Save Draft — all have icons)
- CartPage: Back (`ArrowLeft`), Clear Cart (`Trash2`) — already have icons
- CartSummary: Proceed to Checkout (`CreditCard`), Continue Shopping (`ArrowRight`) — already have icons
- BrowseClubsPage: Add Club (`Plus`), Clear Filters (`X`) — already have icons
- CheckoutCancelPage: Return to Cart (`ShoppingCart`), Go Back (`ArrowLeft`) — already have icons
- ClubMembersPage: Add Member (`UserPlus`), Assign Officer (`Shield`) — already have icons
- PreferencesPage: Export (`Download`), Import (`Upload`), Sync Now (`Wifi`), Reset All (`RotateCcw`) — already have icons
- TrialManagementTabs: Create New Show (`Plus`), Manage Trial (`ChevronRight`), Prepare Trial (`Settings`), Start Setup (`ChevronRight`) — already have icons

---

## Files to Change

### Tab components (add icons to triggers)

1. `apps/myk9show/src/components/clubs/ClubDetails/index.tsx` — 5 tabs (Upcoming Shows, Past Shows, About, Members, Branding — all text-only)
2. `apps/myk9show/src/pages/JudgeDashboard.tsx` — 3 tabs (Today, Upcoming, Completed — all text-only)
3. `apps/myk9show/src/pages/SecretaryDashboard/TrialManagementTabs.tsx` — 3 tab triggers (Active, Upcoming, Completed — all text-only)
4. `apps/myk9show/src/components/dogs/DogDetails/Competitions/CompetitionsTabs.tsx` — 3 tabs (all text-only)
5. `apps/myk9show/src/components/sync/SyncMonitoringDashboard/index.tsx` — 4 tabs (Overview, Performance, Conflicts, Network — all text-only)
6. `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.tsx` — "Competitions" tab (only tab missing a content icon; premium tabs use `Crown` for premium status, not content)

### Button components (add icons to text-only buttons)

7. `apps/myk9show/src/pages/CartPage.tsx` — "Browse Shows" empty state button → `Eye`
8. `apps/myk9show/src/pages/CheckoutCancelPage.tsx` — "Continue Shopping" → `ArrowRight`, "Browse Shows" → `Eye`
9. `apps/myk9show/src/pages/SecretaryDashboard/TrialManagementTabs.tsx` — "View Results" → `Eye`, "Export Report" → `Download`, "Quick Actions" → `Zap`
10. `apps/myk9show/src/pages/JudgeDashboard.tsx` — "View Results" (completed class action) → `Eye`

### Accessibility fix

11. `apps/myk9show/src/components/trials/TrialDetail/TrialHeader.tsx` — add `aria-label="Trial options"` to icon-only MoreVertical button

### Dead code cleanup

12. `apps/myk9show/src/components/clubs/ClubTabs.tsx` — delete (dead code, not imported anywhere; replaced by `ClubDetails/index.tsx`)

---

## Out of Scope

- No new components or abstractions — just adding Lucide imports and inline icons
- No changes to Button or TabsTrigger primitives
- No changes to dialog footer Cancel buttons
- No icon policy documentation outside this spec — rules enforced by convention
- No changes to myK9Q (separate app)

---

## Testing

- `pnpm typecheck` passes after all changes
- `pnpm lint` passes after all changes
- No duplicate icon imports (check each file before adding an import)
- Visual spot-check of each changed tab group and button in the browser
- Verify `aria-label` fix on TrialHeader icon-only button
