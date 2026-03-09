# Confirmation Number Persistence & Lookup

**Status:** Planned
**Created:** 2026-03-08

## Problem

Confirmation numbers are generated client-side only and never saved to the database:

- `showRegistrationStore.ts:361` generates `REG-{timestamp}` — collision-prone, not persisted
- `MyEntriesPage/useMyEntriesData.ts:152` derives from UUID slice — deterministic but not human-friendly
- No `confirmation_number` column exists on any table
- Secretary cannot look up an entry by confirmation number
- Numbers are inconsistent between the two systems

## Design Decisions

- **Scope:** Per person per show (one confirmation number covers all dogs/classes for that show)
- **Format:** `MK9-000001` (prefix + zero-padded sequence)
- **Uniqueness:** Database sequence + trigger (bulletproof)
- **Add-on entries:** Fold into the existing registration (same confirmation number)
- **[ADDED] Offline:** Registration confirmation requires online (payment already does). No offline generation needed.

## Implementation Plan

### Phase 1: Database Migration (054)

Create `registrations` table and link entries to it.

**New table: `registrations`**

```sql
CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_number TEXT UNIQUE NOT NULL,
  show_id UUID NOT NULL REFERENCES shows(id),
  handler_id UUID NOT NULL REFERENCES people(id),
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sequence for human-friendly confirmation numbers
CREATE SEQUENCE registration_confirmation_seq START 1;

-- Trigger to auto-generate confirmation number on insert
CREATE OR REPLACE FUNCTION generate_confirmation_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.confirmation_number := 'MK9-' || LPAD(nextval('registration_confirmation_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_confirmation_number
  BEFORE INSERT ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION generate_confirmation_number();

-- Unique constraint: one registration per person per show
CREATE UNIQUE INDEX idx_registrations_show_handler ON registrations(show_id, handler_id);

-- [ADDED] RLS policies (fully specified)
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- Handlers can read their own registrations
CREATE POLICY registrations_select_own ON registrations
  FOR SELECT USING (
    handler_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
  );

-- Handlers can insert their own registrations
CREATE POLICY registrations_insert_own ON registrations
  FOR INSERT WITH CHECK (
    handler_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
  );

-- Handlers can update their own registrations
CREATE POLICY registrations_update_own ON registrations
  FOR UPDATE USING (
    handler_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
  );

-- Platform admins and secretaries can read all registrations
CREATE POLICY registrations_select_admin ON registrations
  FOR SELECT USING (is_platform_admin());

-- Platform admins can insert/update any registration
CREATE POLICY registrations_insert_admin ON registrations
  FOR INSERT WITH CHECK (is_platform_admin());

CREATE POLICY registrations_update_admin ON registrations
  FOR UPDATE USING (is_platform_admin());
```

**Alter `entries` table:**

```sql
ALTER TABLE entries ADD COLUMN registration_id UUID REFERENCES registrations(id);
CREATE INDEX idx_entries_registration_id ON entries(registration_id);
```

**Files:**

- `supabase/migrations/054_registrations_table.sql`

---

### Phase 2: Types & Queries

Add TypeScript types and database query functions.

**Types:**

```typescript
interface Registration {
  id: string;
  confirmationNumber: string;
  showId: string;
  handlerId: string;
  paymentStatus: string;
  paymentReference?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Queries:**

- `createRegistration(showId, handlerId)` → returns registration with generated confirmation number
- `getRegistrationByConfirmationNumber(confirmationNumber)` → registration + entries
- `getRegistrationByShowAndHandler(showId, handlerId)` → find existing registration (for add-ons)
- `getRegistrationsForShow(showId)` → all registrations (secretary view)

**[ADDED] Error handling in queries:**

- `createRegistration()` catches unique constraint violation (23505) on `idx_registrations_show_handler` → falls back to `getRegistrationByShowAndHandler()` and returns existing registration. This handles the concurrent-submission race condition.
- All queries return `{ data, error }` pattern consistent with existing query files. Callers check error before proceeding.

**Files:**

- `packages/supabase/src/types/database.types.ts` — add registrations table type
- `apps/myk9show/src/services/database/queries/registrationQueries.ts` (new)
- `apps/myk9show/src/services/mappers/registrationMappers.ts` (new)

---

### Phase 3: Registration Store Integration

Update `showRegistrationStore.confirmRegistration()` to persist a real registration.

**Flow change:**

1. `confirmRegistration()` calls `getRegistrationByShowAndHandler()` to check for existing
2. If none exists → `createRegistration(showId, handlerId)` → gets `MK9-000142` back
3. If exists (add-on) → reuse existing registration and its confirmation number
4. Create entries with `registration_id` FK
5. Store the real `confirmationNumber` on the local registration state

**[ADDED] Error handling:**

- If `createRegistration()` fails (network error, unexpected DB error), the confirmation flow aborts with a user-facing error message: "Registration could not be confirmed. Your entries have been saved and you can retry."
- Entries are NOT created without a `registration_id` — registration creation must succeed first, then entries are created/updated with the `registration_id`. This is a sequential dependency, not parallel.
- `confirmRegistration()` becomes async (it already implicitly is since payment requires online).

**[ADDED] Offline consideration:**

- Registration confirmation already requires online (payment processing hits Stripe via Edge Function). No offline path exists or is needed for this flow.
- Draft entries created while browsing offline do NOT get a `registration_id` until confirmation (this is correct — drafts aren't confirmed registrations).

**Files:**

- `apps/myk9show/src/store/showRegistrationStore.ts` — update `confirmRegistration` action
- `apps/myk9show/src/store/show-registration-types.ts` — update types if needed

---

### Phase 4: Display Updates

Replace all computed/fake confirmation numbers with the real persisted value.

1. **MyEntriesPage** (`useMyEntriesData.ts:152`) — query entry's `registration_id` → join to get `confirmation_number` instead of UUID slice
2. **MyEntriesPage/index.tsx** (line 332) — remove fallback UUID slice logic
3. **ConfirmationStep.tsx** (line 234) — display real `confirmationNumber` from store
4. **EntryReceipt.tsx** — pass real confirmation number

**[ADDED] Backward compat display:**

- Entries with `registration_id = NULL` (pre-existing data) fall back to UUID slice display (`entry.id.slice(0, 8).toUpperCase()`) with no label prefix — these are clearly legacy entries.
- New entries always show `MK9-XXXXXX` format.

**Files:**

- `apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesData.ts`
- `apps/myk9show/src/pages/MyEntriesPage/index.tsx`
- `apps/myk9show/src/components/shows/RegistrationWorkflow/ConfirmationStep.tsx`
- `apps/myk9show/src/components/entries/EntryReceipt.tsx`

---

### Phase 5: Secretary Lookup

Add confirmation number search to secretary-facing pages.

- Add search-by-confirmation-number to entry management page
- Secretary can type `MK9-000142` and see all entries for that registration
- **[ADDED]** Search input detects `MK9-` prefix and routes to confirmation number lookup vs. existing name/dog search. Case-insensitive matching (`mk9-000142` works).

**Files:**

- `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx`

---

### Phase 6: Tests

- Unit tests for `registrationQueries` (create, lookup, add-on detection)
- Unit tests for `registrationMappers`
- Unit tests for confirmation number generation (mock Supabase response)
- Update existing `showRegistrationStore` tests for new flow
- Update `useMyEntriesData` tests for real confirmation numbers
- **[ADDED]** Test: concurrent registration creation (unique constraint → fallback to existing)
- **[ADDED]** Test: registration creation failure → entries not created, error surfaced
- **[ADDED]** Test: backward compat — entries without `registration_id` show UUID slice fallback

## Migration Notes

- Existing entries will have `registration_id = NULL` — that's fine, they predate the system
- `MyEntriesPage` should fall back to UUID slice display for entries without a registration_id (backward compat)
- No backfill needed — old test data doesn't need real confirmation numbers
- **[ADDED]** Migration is additive only (new table, new column, new index) — safe to roll forward, trivial to roll back by dropping the table/column if needed
