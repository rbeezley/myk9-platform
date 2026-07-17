## 1. Inventory

- [ ] 1.1 Enumerate the entry, class, and trial status enums and every value each can take.
- [ ] 1.2 Grep and list all entry/class/trial status renderings and maps: `EntryStatusBadge`, both `CheckInStatusBadge`, `ClassResultsTable/StatusBadge`, `utils/entryStatusUtils.ts`, `utils/entryManagementUtils.ts`, and per-surface maps in trials/schedule/offline-checkin/cards.
- [ ] 1.3 Explicitly mark out-of-scope families (email-delivery, promo-code, system-health) so they are not touched.

## 2. Shared grammar

- [ ] 2.1 Define the shared shape vocabulary (not-started / pending / in-progress / complete / needs-attention) and per-family status→(shape, color token, label) maps.
- [ ] 2.2 Implement the `StatusIcon` component (presentation-only) and a lookup helper that returns the mapped descriptor or the `no-status` fallback — no direct map indexing.
- [ ] 2.3 Wire colors to ux-contrast tokens; verify each status meets contrast in light and dark.

## 3. Migrate and delete

- [ ] 3.1 Migrate entry status renderings (badges, Entry Management cards/tables, Show Desk, attention summary) to the shared component.
- [ ] 3.2 Migrate class status renderings (Class Details readiness strip, class tables/cards) to the shared component.
- [ ] 3.3 Migrate trial status renderings to the shared component.
- [ ] 3.4 Delete each redundant badge component and inline map once its last caller has migrated (grep callers before deleting).

## 4. Tests

- [ ] 4.1 Exhaustive coverage test: every entry/class/trial enum value has a mapped descriptor.
- [ ] 4.2 Fallback test: unknown/undefined status renders `no-status` and does not throw.
- [ ] 4.3 Source-level test: no per-surface entry/class/trial status icon map remains outside the shared grammar.
- [ ] 4.4 Contrast/theme check for status colors in light and dark.

## 5. Verification

- [ ] 5.1 `pnpm typecheck` and `pnpm lint` clean for touched code.
- [ ] 5.2 OpenSpec validation passes for this change.
- [ ] 5.3 Browser sweep across Entry Management, Class Management, Class Details, and Show Desk in both themes; confirm legibility at the smallest table/tablet size; capture evidence.
