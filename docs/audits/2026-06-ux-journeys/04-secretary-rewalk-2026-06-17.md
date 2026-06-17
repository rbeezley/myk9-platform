# UX Re-Walk: Secretary Golden Path (Lane 1, Step 2)

**Date:** 2026-06-17
**Auditor:** Claude (Opus 4.8), via `qa-feature` skill
**Scope:** Launch-gate Secretary golden-path re-walk against the **canonical Lane 1.1 seed**
(`Heartland Scent Work Classic`, PR #797). Supersedes the read-only baseline in
[`02-secretary-journey.md`](02-secretary-journey.md), which walked shows (`June 2026` /
`Monogram`) that the reseed hard-wiped.
**Intent target:** Trial Secretary — _"That was easy"_
**Account:** `secretary@myk9t.com` (live Playwright walk on `http://localhost:5173`, worktree dev server, shared Supabase `sojmvhhwsjxmfistvzbe`)
**Folds in (per plan):** announcement time-to-task baseline from Message Center; move-up **decision** walk (not just empty state).

---

## TL;DR

The consolidated secretary workbench is **genuinely strong** — Dashboard, Setup, Show Desk,
Entry Management, Results Control, and the Message Center announcement path all fit the
"That was easy" intent. Three of the prior audit's High findings have **resolved** on the clean
seed. But the walk surfaced **one launch-gate-blocking Critical** (no account holds the
`secretary` role) and **one High** (Entry Management mislabels scored/move-up entries as
"Pending," over-counting the review queue 7 vs the true 3).

**Scorecard recommendation: hold Secretary at Yellow** until F1 (RBAC seed) and F2 (status
mapping) land. Both are small, well-scoped fixes.

---

## Findings (ranked by severity)

### F1 — CRITICAL (launch-gate blocker): no account holds the `secretary` (or `club_admin`) role

**Surface:** `/secretary/dashboard`, global sidebar, post-login redirect.
**Symptom:** Signing in as `secretary@myk9t.com` lands on `/exhibitor/entries`; the sidebar
shows only exhibitor links; `/secretary/dashboard` renders **"You don't have permission to
access this page."** The entire golden path is unreachable with the canonical demo account.

**Root cause (verified in DB):** the `secretary` and `club_admin` roles exist in `public.roles`
but **zero users hold them**. Every account that should be a secretary/club admin holds only
`exhibitor`:

| Account | Roles held | Should also hold |
| --- | --- | --- |
| `secretary@myk9t.com` | `exhibitor` | `secretary` |
| `e2e-secretary@test.myk9.com` | `exhibitor` | `secretary` |
| `club@myk9t.com` | `exhibitor` | `club_admin` |
| `e2e-clubadmin@test.myk9.com` | `exhibitor` | `club_admin` |

The Lane 1.1 reseed (PR #797) restored the protected **accounts** but not their **role grants**
(`seed-demo.sql` explicitly "does NOT touch auth.users" and grants no roles). A trigger,
`enforce_club_id_for_scoped_roles()`, requires `secretary`/`club_admin` rows to be **club-scoped**
(a global/NULL-club grant raises `club_id is required for role "secretary"`).

The route guard ([`secretaryRoutes.tsx:191`](../../../apps/myk9show/src/routes/secretaryRoutes.tsx)
= `requiredRole={[SECRETARY, SITE_ADMIN]}`) matches by role **name**, scope-agnostic
(`getUniqueActiveRoleNames` flattens names) — so a single club-scoped `secretary` row satisfies it.

**Action taken to unblock this walk:** I inserted one club-scoped `secretary` `user_roles` row
for `secretary@myk9t.com` (scoped to the Heartland club `dededede-…0001`).

**FIXED — PR #804 (2026-06-17):** `seed-demo.sql` §10 now codifies idempotent club-scoped grants
for all four demo accounts (`secretary`→`secretary@`/`e2e-secretary@`, `club_admin`→`club@`/
`e2e-clubadmin@`), applied to staging. A reseed now restores them. The SQL template below is the
finding-time version; the shipped version sources `auth_user_id` from `people.auth_user_id`, uses
a literal `granted_at`, and adds `show_id IS NULL` to the NOT EXISTS guard.

**Durable fix (consolidation-safe — extend the existing reseed, do not add a surface):** add a
role-grant block to `seed-demo.sql` (or a companion seed) for the demo secretary/club-admin
accounts. Template:

```sql
-- Demo role grants (club-scoped; trigger enforce_club_id_for_scoped_roles requires club_id)
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id, granted_at)
SELECT p.id, r.id, 'dededede-0000-0000-0000-000000000001', true, u.id, now()
FROM public.people p
JOIN auth.users u  ON lower(u.email) = lower(p.email)
JOIN public.roles r ON r.name = 'secretary'
WHERE lower(p.email) IN ('secretary@myk9t.com', 'e2e-secretary@test.myk9.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.auth_user_id = u.id AND ur.role_id = r.id);
-- repeat with r.name='club_admin' for club@myk9t.com + e2e-clubadmin@test.myk9.com
```

**Blocks scorecard Green** — a real secretary cannot reach the workbench at all.

---

### F2 — HIGH: Entry Management over-counts "Pending" (7 vs true 3); scored & move-up entries badged "Pending / Need review"

**Surface:** `/shows/:id/entry-management` — Pending stat card, "Pending" tab, per-row status badge.
**Symptom:** The Pending stat and tab read **7 ("Need review")**, but only **3** entries are
actually awaiting an accept/reject decision (Ranger, Juniper, Maple — `submitted`). The other 4
shown as "Pending" are:

- Willow / Scout / Cooper — **Container Novice A**, which is `completed`, scored, with **released
  placements 1/2/3** (the dashboard even toasts "Results posted — Cooper").
- Scout — **Buried Master**, which is `move-up-requested`.

The **Dashboard** ("3 entries pending review") and **Show Desk** ("3 entries waiting for review")
both compute this correctly — so three secretary surfaces **disagree**, and Entry Management is
the wrong one. A secretary triaging "what needs review" is told 7, three of which already have
public results.

**Root cause:** [`entryManagementUtils.ts:14`](../../../apps/myk9show/src/utils/entryManagementUtils.ts)
`mapEntryStatus()` has **no `case` for `'completed'` or `'move-up-requested'`** — both fall through
`default: return EntryStatus.PENDING` (line 35). Classic silent-fallthrough value bug: the string
is valid so typecheck passes, but the enum mapping loses meaning. (Matches CLAUDE.md's
"assertion-first for value-sensitive bugs" pattern — a `toHaveBeenCalledWith`/return-value test
on `mapEntryStatus('completed')` would have caught it.)

**Fix:** add explicit cases — `'completed'` → a Completed/Scored UI status (not Pending), and
`'move-up-requested'` → its own status (or at minimum exclude both from the "needs review"
bucket). There's already a sibling test (`entryManagementUtils.test.ts`) to extend assertion-first.

---

### F3 — MEDIUM: move-up target-class picker offers semantically invalid targets

**Surface:** Entry Management → Move-Ups tab → **Approve** dialog ("Approve Move-Up Request").
**Positive:** the decision flow itself is a good "That was easy" fit — calm copy ("Move Scout from
Buried Master to the selected class"), Approve **disabled until a target class is chosen**, clear
Cancel. This **resolves the prior audit's "inconclusive" move-up state** (no seeded request existed
before).
**Problem:** for Scout's Buried **Master** request, the target picker offers Container **Novice** A,
Interior **Novice** B, Interior Advanced, Exterior Excellent — i.e. **lower levels and
cross-element** classes. Only the dog's current class is excluded. A Master-level dog being offered
a "move-up" to Novice is nonsensical and invites mis-filing.
**Fix:** constrain targets to valid move-up destinations (same element, higher level — or whatever
the registry rule is). Consolidation-safe: tighten the option list, no new UI.
**RESOLVED:** `getAvailableMoveUpTargets` ([`moveUpTargets.ts`](../../../apps/myk9show/src/components/entries/moveUpTargets.ts))
now scopes targets to the same element + strictly higher level (reusing the canonical level order in
`classOrder.ts`), with an empty-state Alert when no valid higher class exists. Unit-tested in
`moveUpTargets.test.ts`.

---

### F4 — MEDIUM: Submit Results still leads with raw XML (cognitively heavy closeout)

**Surface:** `/shows/:id/submit-results`. The raw AKC XML is the **primary** on-page preview.
Prior audit Medium persists. Move XML behind a "View electronic-submission details" disclosure;
lead with a human checklist/summary.
_(Data fidelity is good: the seeded Container Novice A placements export correctly — Willow
`resultCode 1` 38.5s, Scout `2` 41.2s, Cooper `3` 45.8s — and Maple's withdrawal shows
`numWithdrawals="1"`/`actionCode="WHLD"`.)_

---

### F5 — MEDIUM: Reports selectors display raw ids

**Surface:** `/shows/:id/reports`. The "Select report" and "Select sort" comboboxes show their
**raw values** — `check-in-sheet`, `run-order` — instead of "Check-in Sheet" / "Run Order".
**Scope note (reconciled):** this is a *different* selector from the trial/class/dog UUID echoes
fixed in #617/#737-era (those rendered UUIDs; `ReportControlsBar` now labels them). The
**report-type** and **sort** selectors carry kebab-case string ids and still echo them raw. (The
printable preview itself is clean: "AKC Container Check-in" etc.)

---

### F6 — LOW (cluster): polish & legacy

- **`AKC:scent_work` jargon** shown verbatim in the Submit Results Organization selector (prior). → "AKC Scent Work".
- ~~**Move-up picker "999 spots"** — unconfigured-looking class-capacity default in each option label.~~
  **RESOLVED** alongside F3: the spots badge now renders only when the class has a real configured
  `max_entries`; uncapped classes show entry count / "no entry cap set" instead of the 999 sentinel.
- ~~Legacy `?phase=show-desk` renders Setup, not Show Desk.~~ **RETRACTED on reconciliation.**
  PR #737 already redirects the real legacy bookmark shape — the **base** URL
  `/shows/:id?phase=show-desk` → `/show-desk` ([`showRouteRedirects.tsx:18`](../../../apps/myk9show/src/routes/showRouteRedirects.tsx)
  honors the phase query only when there is no subPath). The `/shows/:id/setup?phase=show-desk`
  shape I tested is synthetic — no old bookmark used it — and correctly renders Setup with a
  harmless dangling query. Not a finding.
- **Focused request queues render below the full 9-entry list.** The Move-Ups (and Pulled) tab
  shows the dedicated "Move-Up Requests (1)" / Approve-Deny card **beneath** the entire entry list,
  so the decision queue is buried. Same shape as the prior "Pulled tab buried below entry list"
  finding — extend that fix to Move-Ups.
- **Secretary sidebar still includes exhibitor "My Entries"** (→ `/exhibitor/entries`). Acceptable
  role-blending for a dual-role account; note only.

---

## Resolved / does-not-reproduce on the clean seed (good news)

| Prior finding (02-/03-) | Status now | Evidence |
| --- | --- | --- |
| Dashboard attention count disagrees with target page (High) | **Resolved** | Dashboard "3 entries pending review" deep-links to the exactly-3 `submitted` entries. The over-count is now isolated to F2's Entry Management tab, not the attention list. |
| "Send to AKC" stays enabled beside missing-registration warning (High) | **Resolved** | "Send to AKC" is now **`[disabled]`** beside "9 entries are missing AKC registration numbers…". The warning gates the risky action. |
| Refund/withdrawal disagrees across roles; "Partial Refund" for a full refund (High/Low) | **Resolved (secretary side)** | Maple / Exterior Excellent shows `Withdrawn` + **`Refunded $30.00`** + reason inline. The "Partial Refund for full amount" bug was data-driven (old `partial_refund` row) and the seed's `refunded` status renders the correct badge. Pairs with PR #800 (exhibitor side). |
| Day-of announcement had "no direct CTA found" (Medium, baseline incomplete) | **Resolved** | See baseline below. |

---

## Announcement time-to-task baseline (required deliverable)

Measured from anywhere in the secretary workbench (top-bar Message Center is global):

| Path | Clicks | Notes |
| --- | ---: | --- |
| Reach the compose form | **2** | top-bar **Message Center** → **Compose** ("Compose show message") |
| Send a **templated** announcement | **3–4** total | + one tap on a preset (**Lunch ready / Ring paused / Results posted / Report to gate / Class delayed**) which pre-fills Title+Message → **Send message** |
| Send a **custom** announcement | **3** clicks + 2 typed fields | Message Center → Compose → type Title, type Message → Send message |

**Baseline number: a day-of announcement is 2 clicks to compose and 3–4 clicks to send.**
Recipient defaults to `all_show`; "Send push alert" defaults on with plain-English guidance
("Use for time-sensitive updates. Otherwise this sends quietly."); opened from inside a show, the
form is already scoped to that show (no "Select a show" re-prompt — an improvement over the prior
cross-role finding). _(Not actually submitted — announcements push to real devices on the shared
DB.)_ This is a strong "That was easy" result and **clears the prior audit's open baseline**.

---

## Intent check — _"That was easy"_

Reinforced: Dashboard is calm and oriented (accurate attention list); Show Desk leads with
next-best-action + correct counts; Results Control uses plain-English visibility presets
(Immediately / After Class / After Review) with inheritance; the move-up Approve dialog is calm and
gated. Erodes the intent: F2's "7 need review" over-count and F1's hard 403 are the opposite of
"easy" — both are small fixes that protect the feeling.

---

## Walk method / caveats

- Read-only-preferred against the **shared** Supabase project. No mutating submit was sent
  (no announcement send, no move-up approval, no status change). Scout's move-up fixture verified
  intact post-walk (`entry_status='move-up-requested'`).
- One shared-DB write **was** made, with user approval: the F1 unblock grant (one club-scoped
  `secretary` row for `secretary@myk9t.com`). Codify via the F1 SQL, then it is reproducible.
- Dev server runs the **worktree** code (preview-MCP-pinning caveat does not apply — this is a real
  browser against `localhost:5173`). Root-cause file:line references are from the worktree tree.
