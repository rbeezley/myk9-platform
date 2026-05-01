# Secretary Walk — Test Seed State

Documented 2026-05-01. Reproduces the data state needed to walk the
secretary's Accept / Waitlist / Bulk-email flows.

## Test Accounts

| Role      | Email                | Password      |
| --------- | -------------------- | ------------- |
| Exhibitor | exhibitor1@myk9t.com | TestPass1234! |
| Secretary | secretary@myk9t.com  | testpass123   |

## Seeded Show

**Name:** QA Walk Show 1777260779  
**Dates:** May 15–16, 2026  
**Show ID:** `a0505c45-64d0-4b04-b2b3-cb213ed738a6`  
**Entry fee:** $30.00 · Card payments · entries close May 15  
**Club:** Test Club 1  
**Location:** Memorial Coliseum, 1234 Main St, Wichita, KS 67202

## Seeded Entries (as of 2026-05-01)

3 entries from exhibitor1@myk9t.com (Alice Martin), all **Pending**:

| Dog   | Class              | Trial                   | Status  |
| ----- | ------------------ | ----------------------- | ------- |
| Dog 1 | Container Novice A | Friday Trial 1 (May 15) | Pending |
| Dog 1 | Container Novice B | Friday Trial 1 (May 15) | Pending |
| Dog 2 | Container Novice A | Friday Trial 1 (May 15) | Pending |

## How to Walk the Secretary Accept/Waitlist/Bulk-Email Flows

1. Sign in as `secretary@myk9t.com` / `testpass123`
2. Go to **Secretary → Entry Management** (`/secretary/entries`)
3. Select **QA Walk Show 1777260779 (May 14, 2026)** from the show picker
4. All 3 entries appear under the **Pending (3)** tab
5. Exercise: Accept, Waitlist, bulk-email from the entry list

## Repro Notes

- If entries show 0 after selecting the show, wait ~5s for replication to hydrate then re-select
- The show picker overlay (z-30 div) blocks regular clicks in Playwright — use `eval` to `.click()` the combobox directly
