# Exhibitor Walk — Test Seed State

Documented 2026-06-02. Reproduces the data state for walking the exhibitor
golden path (find → enter → add dog → check in → view results).

## Test Account

| Role      | Email                | Password      | Name        |
| --------- | -------------------- | ------------- | ----------- |
| Exhibitor | exhibitor1@myk9t.com | TestPass4567! | Alice Martin |

Other exhibitor accounts: `exhibitor2..5@myk9t.com` (same password).

## Sign-in note (unified SmartSignInPage)

`/sign-in` is a single field that accepts **either** an email **or** a 5-char
show passcode. Enter the email → click **Continue** → a password step appears
(with an **Edit** affordance to change the email) → enter password → **Sign in**.
Exhibitors land on `/exhibitor/entries` (MyEntriesPage).

## Shows for the walk

| Show     | UUID                                   | Entry window | Use for |
| -------- | -------------------------------------- | ------------ | ------- |
| Headline | `18802fc0-1558-4dc3-902d-989edef4df3c` | open, closes Jun 4, 2026 | **Enter a show** (clean upcoming show, Jun 12–14) |
| Heritage | `3b91e282-6e45-4a89-9446-f6ebeb0bf62c` | running "today" | Show Today banner / `/at-show` / results viewing |
| QA Walk Show 1777260779 | `a0505c45-64d0-4b04-b2b3-cb213ed738a6` | closed May 14 | Past entries already on exhibitor1 |

`get_account_today_entries` (RPC) drives the "Show today" banner — it is
date-range aware, so a multi-day show that started earlier but is still running
today counts as "today" even though its `start_date` is in the past.

## exhibitor1 entries as of the 2026-06-02 walk

6 entries across 3 distinct shows (Heritage ×1 pending, QA 1777261593 ×2 pending,
QA 1777260779 ×3 incl. 2 accepted) **plus** the walk created Headline entry
`#MK9-000047` (Dog 1, Container Novice A, Pending). exhibitor1 owns 4 dogs:
**Dog 1**, **Dog 2**, and two leftover automated-test dogs (`E2E Dog A …`,
`E2E Exhibitor Dog …`). Note: the dog whose **call name** is "Dog 1" has the
**registered name** "E2E Dog A …" — different surfaces show different names.

## Test-data hygiene caveats (not product bugs)

- Public `/shows` browse lists 4 leftover **"Update Test Show …"** rows.
- My Dogs shows 2 leftover **E2E** dogs.

Clean these before any real-user / demo session.
