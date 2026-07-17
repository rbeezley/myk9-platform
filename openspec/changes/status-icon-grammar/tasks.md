## 1. Inventory

- [x] 1.1 Enumerate the entry, class, and trial status enums and every value each can take.
- [x] 1.2 Grep and list all entry/class/trial status renderings and maps: `EntryStatusBadge`, both `CheckInStatusBadge`, `ClassResultsTable/StatusBadge`, `utils/entryStatusUtils.ts`, `utils/entryManagementUtils.ts`, and per-surface maps in trials/schedule/offline-checkin/cards.
- [x] 1.3 Explicitly mark out-of-scope families (email-delivery, promo-code, system-health) so they are not touched.

## 2. Shared grammar

- [x] 2.1 Define the shared shape vocabulary (not-started / pending / in-progress / complete / needs-attention) and per-family status→(shape, color token, label) maps.
- [x] 2.2 Implement the `StatusIcon` component (presentation-only) and a lookup helper that returns the mapped descriptor or the `no-status` fallback — no direct map indexing.
- [x] 2.3 Wire colors to ux-contrast tokens; verify each status meets contrast in light and dark.

## 3. Migrate and delete

- [x] 3.1 Migrate entry status renderings (badges, Entry Management cards/tables, Show Desk, attention summary) to the shared component.
- [x] 3.2 Migrate class status renderings (Class Details readiness strip, class tables/cards) to the shared component.
- [x] 3.3 Migrate trial status renderings to the shared component.
- [x] 3.4 Delete each redundant badge component and inline map once its last caller has migrated (grep callers before deleting).

## 4. Tests

- [x] 4.1 Exhaustive coverage test: every entry/class/trial enum value has a mapped descriptor.
- [x] 4.2 Fallback test: unknown/undefined status renders `no-status` and does not throw.
- [x] 4.3 Source-level test: no per-surface entry/class/trial status icon map remains outside the shared grammar.
- [x] 4.4 Contrast/theme check for status colors in light and dark.

## 5. Verification

- [x] 5.1 `pnpm typecheck` and `pnpm lint` clean for touched code.
- [x] 5.2 OpenSpec validation passes for this change.
- [x] 5.3 Browser sweep across Entry Management, Class Management, Class Details, and Show Desk in both themes; confirm legibility at the smallest table/tablet size; capture evidence.
