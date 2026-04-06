# myK9Q Passcode Generation in myK9Show — Design Spec

**Date:** 2026-04-06
**Status:** Approved

## Problem

Secretaries create shows in myK9Show but have no way to see or share the myK9Q access passcodes for those shows. myK9Q uses passcodes (5-character role-prefixed codes) derived from a show's identifier to authenticate judges, stewards, and exhibitors at ringside. Without passcode generation in myK9Show, secretaries must use myK9Q directly or compute codes manually — neither is acceptable.

## Key Decision: Show UUID as the License Key

The show's UUID (`shows.id`) is the passcode source. No separate `license_key` value needs to be generated, stored, or copied. The derivation is pure client-side math — no DB writes, no API calls. The `license_key` column on `shows` remains in the schema but is unused going forward.

## Algorithm

A UUID has this structure:

```
63165809-e025-25c6-6cf9-979f63165809
──────── ──── ──── ──── ────────────
 8 hex   4    4    4    12 hex chars
```

Splitting by `-` gives 5 segments. Passcodes are derived from segments 1–4:

| Role      | Source                      | Example result |
| --------- | --------------------------- | -------------- |
| Admin     | `a` + segment[1]            | `ae025`        |
| Judge     | `j` + segment[2]            | `j25c6`        |
| Steward   | `s` + segment[3]            | `s6cf9`        |
| Exhibitor | `e` + segment[4].slice(0,4) | `e979f`        |

Each passcode is 5 characters: 1 role prefix + 4 hex chars. Same length and format as the legacy system.

## Approach

Duplicate the algorithm in each location that needs it. The edge function is Deno and cannot import from shared packages, so it is always a standalone copy. The algorithm is a stable 10-line pure function — the overhead of a shared package is not justified.

## Scope

### 1. Algorithm updates

Three files need the updated derivation logic (UUID format: 5 parts, not 4):

**`apps/myk9show/src/utils/passcodes.ts`** (new file)

```typescript
export interface ShowPasscodes {
  admin: string;
  judge: string;
  steward: string;
  exhibitor: string;
}

export function generatePasscodesFromShowId(showId: string): ShowPasscodes | null {
  const parts = showId.split('-');
  if (parts.length !== 5) return null;
  return {
    admin: `a${parts[1]}`,
    judge: `j${parts[2]}`,
    steward: `s${parts[3]}`,
    exhibitor: `e${parts[4].slice(0, 4)}`,
  };
}

export function getExhibitorLoginUrl(showId: string): string {
  const passcodes = generatePasscodesFromShowId(showId);
  if (!passcodes) return '';
  return `https://app.myk9q.com/login?code=${passcodes.exhibitor}`;
}
```

**`apps/myk9q/src/utils/auth.ts`** — update `generatePasscodesFromLicenseKey` to detect UUID format (5 parts) vs legacy format (4 parts, `myK9Q1-8hex-8hex-8hex`) and handle both.

**`apps/myk9q/supabase/functions/validate-passcode/index.ts`** — same algorithm update. The function already iterates all shows to find a match; change the derivation inside that loop from `show.license_key` to `show.id`. No change to the query itself — filtering by a 4-char fragment is not possible.

### 2. myK9Show UI

#### `MyK9QAccessCard` component

**Location:** `apps/myk9show/src/components/secretary/MyK9QAccessCard.tsx`

**Props:** `{ showId: string; showName?: string }`

Derives passcodes synchronously from `showId`. No loading state needed.

**Renders:**

- Card with title "myK9Q Access Codes" and description "Share these with your team to access this show in the myK9Q ringside app"
- 4 rows (Admin, Judge, Steward, Exhibitor), each with:
  - Role label
  - Monospace code badge
  - Copy button — calls `navigator.clipboard.writeText(code)`, shows toast on success
- Exhibitor row additionally has:
  - **Copy link** button — copies `https://app.myk9q.com/login?code=<exhibitor>` to clipboard
  - **Print slip** button — opens a new window with print-ready HTML containing show name, date, exhibitor code in large monospace, and a QR code pointing to the login URL

**QR code:** Use the `qrcode` npm package (lightweight, ~7kb gzipped) added to myK9Show's dependencies. Render as an inline SVG or data URL into the print window.

#### ShowSettingsPage (`/secretary/settings`)

Add `<MyK9QAccessCard showId={selectedShowId} />` at the bottom of the existing card list in `apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx`. The `selectedShowId` is already available from `useShowStore()`.

#### Show creation wizard success screen

After `handleCreateShow` resolves successfully, instead of immediately navigating to `/secretary/dashboard`, show a completion overlay within the wizard page.

**Implementation:** Add `createdShowId: string | null` state to `ShowCreationWizardPage`. In `useShowCreationWizardActions`, after the successful save, set this state with the new show's ID before navigating. When `createdShowId` is non-null, render a full-page overlay showing:

- Success heading with show name
- `MyK9QAccessCard` (condensed variant without the card wrapper, just the rows)
- "Go to Dashboard" button — clears `createdShowId`, resets wizard, navigates to `/secretary/dashboard`

The overlay replaces the immediate `navigate('/secretary/dashboard')` call for the non-draft path only. Draft saves continue to navigate to `/shows/:showId` immediately (no passcode screen needed for drafts).

### 3. Testing

- **`src/utils/passcodes.test.ts`** — `generatePasscodesFromShowId` with a known UUID produces expected 4 codes; returns `null` for malformed input; `getExhibitorLoginUrl` returns the correct URL
- **`MyK9QAccessCard.test.tsx`** — renders all 4 codes from a given showId; Copy button calls `clipboard.writeText`; Print slip button calls `window.open`
- **`apps/myk9q/src/utils/auth.test.ts`** — update existing tests to cover UUID 5-part format; add cases verifying legacy 4-part format still works
- **Wizard success screen** — after `handleCreateShow` resolves, the completion overlay renders with the show's passcodes; "Go to Dashboard" clears it and navigates

No E2E tests for this feature — the wizard E2E suite is currently broken and out of scope.

## Out of Scope

- Regenerating passcodes (the show UUID is permanent; regeneration is not supported)
- Populating the `license_key` column (unused going forward)
- Passcode display for exhibitors in myK9Show (exhibitors use myK9Show natively, not myK9Q)
- Push notification auth reconciliation (tracked separately as a deferred item)
