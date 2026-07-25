# myK9Q vs. myK9Show `/at-show` — User-Perspective Comparison

> **Date:** 2026-07-24
> **Scope:** User experience only (screens, flows, look & feel) — not database schema.
> **Sources:** `/Users/richardbeezley/AI Projects/myK9Qv3` (standalone PWA, v3) vs. this monorepo's `apps/myk9show` `/at-show` surface + `packages/ringside` + `packages/scoring-ui`.

myK9Q was a complete standalone app; `/at-show` is a focused ringside _surface_ inside myK9Show. The core ringside loop — passcode in, find your class, check dogs in, run the timer, score, sync offline — was ported nearly verbatim, often down to the same millisecond thresholds and vibration patterns. What changed is the _shell around that loop_: myK9Q's dashboard, secretary tools, stats, results podium, and TV mode were deliberately not rebuilt inside `/at-show` because myK9Show already has those concerns on other pages. A handful of genuine gaps remain (timer sounds, class-card live preview, completion celebration, push notifications) — recommendations at the end.

---

## 1. What's the same (ported faithfully)

These are the things a returning myK9Q user will recognize immediately:

| Area                      | Shared behavior                                                                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Passcode entry**        | Role-prefixed passcodes (`a`=admin, `j`=judge, `s`=steward, `e`/other=exhibitor). Same role → permission matrix: judge scores, steward checks in + manages run order but **cannot score**, exhibitor self-check-in only.                           |
| **Entry cards (DogCard)** | Prominent armband badge, call name, breed, handler, A/B section badges, result accent bars with gold/silver/bronze placement colors (`#ffd700`/`#c0c0c0`/`#cd7f32`).                                                                               |
| **Check-in statuses**     | Identical set: No Status, Checked-in, Conflict, Pulled, At Gate, Come to Gate (staff-only), In Ring, Completed. Same interaction: tap the status badge → status dialog; In Ring/Completed gated behind ring-management permission.                 |
| **Run-order reorder**     | Long-press a card (500 ms) to enter drag mode, `navigator.vibrate(50)` haptic, in-ring dog can't be dragged.                                                                                                                                       |
| **Timer**                 | Large `M:SS.ss` display, Start → Stop → Resume, reset disabled while running, color thresholds green → amber ≤ 40 s → red ≤ 30 s, "30 Second Warning" and "Time Expired" banners, auto-stop at max time → NQ, warning suppressed for Master level. |
| **Result entry**          | Same `ResultChoiceChips` pattern: Qualified / NQ / Absent / Excused chips, fault +/- counter revealed on Q, NQ/Excused reason chips, per-org reason lists (ASCA differs). Save → confirmation dialog → Confirm & Submit.                           |
| **Scoresheet variants**   | Same sport coverage: AKC Scent Work, AKC Nationals (point counter), AKC FastCAT, UKC Obedience/Rally/Nosework, ASCA Scent Detection. In myK9Show these live in `@myk9/scoring-ui` and are shared with the secretary's scoresheet page.             |
| **Offline-first**         | Optimistic scoring, per-status sync indicators (synced / syncing / pending count / offline / failed + Retry), scores queue locally and reconcile on reconnect.                                                                                     |
| **Haptics**               | Same graduated pattern (light/medium/heavy, success/error/warning sequences) on chips, cards, and timer buttons.                                                                                                                                   |
| **Favorites**             | Dog favorites keyed by armband in localStorage (`dog_favorites_<key>`), class favorites with star toggle, favorites sorted first.                                                                                                                  |
| **Self check-in**         | Per-class toggle; disabled state shows the same explanatory `SelfCheckinDisabledDialog`.                                                                                                                                                           |
| **Sort/search/filter**    | Search by armband/name/breed/handler; sort by armband/name/handler/run order; pending vs. completed views; section A/B filter.                                                                                                                     |
| **Status colors**         | Largely the same palette: briefing `#ff6b00`, in-progress `#0066ff`, completed `#00cc66`, conflict amber `#f59e0b`, pulled red.                                                                                                                    |

The fidelity here is intentional — `docs/INTENT.md` §6 records that myK9Q was absorbed into `/at-show`, and shared packages (`@myk9/ringside`, `@myk9/scoring-ui`) were built by porting myK9Q's components.

---

## 2. What's different — and why

### 2.1 Standalone app → embedded surface (the big one)

**myK9Q:** a whole app — landing page, login, Home dashboard, dog details, stats dashboards, Secretary Tools (Kanban, schedule, volunteers), public Results "Podium," TV display, AskQ chatbot, settings with accent themes.

**myK9Show:** `/at-show` is a chromeless, tablet-first surface with exactly five screens: show chooser → class list → entry list → scoresheet (+ combined A/B). Everything else lives elsewhere in myK9Show: secretary work on Show Desk, results on the public show pages, stats in dog/show records.

**Why:** the consolidation principle ("one concern, one page"). myK9Q had to be everything because it was the only app at the show. myK9Show already has a secretary workbench, public results, and dog records — rebuilding them inside `/at-show` would create the duplicate-surface problem the whole platform phase is trying to eliminate. Back-links stitch it together instead: staff get "Back to Show Desk," everyone else "Back to Ringside" / dashboard.

### 2.2 Navigation: hamburger menu → drill-down + back links

myK9Q used a slide-out hamburger (Home, Podium, Announcements, Inbox, AskQ, Secretary Tools, TV, Settings…). `/at-show` has no menu at all — card-tap drill-down with per-page back buttons.

**Why:** with only five screens in a linear flow, a menu is overhead. The hamburger existed to hold the ten destinations `/at-show` no longer owns.

### 2.3 Auth: passcode-only → two-path (account or passcode)

myK9Q: 5 auto-advancing passcode boxes, QR deep-link, rate limiting, that's it. myK9Show: signed-in users get in via their account role (RBAC) with no passcode at all; passcodes remain the anonymous front door (single field, Turnstile CAPTCHA, format `[a|j|s|e]XXXX`), and a passcode grant deliberately _overrides_ account RBAC.

**Why:** myK9Show has real accounts; forcing a logged-in secretary to type a passcode would be a regression. The passcode path is preserved precisely because it's what stewards and judges at the ring already know.

### 2.4 Home dashboard → smart landing + "Your dogs today"

myK9Q's Home showed trial progress cards plus a dog grid with All Dogs/Favorites tabs. `/at-show` instead auto-resolves: one live show → jump straight in; exhibitors land on **"Your dogs today"** — own dogs with armband, class, expected time, plain-language status ("I am here," "I have a conflict — tell the secretary"), and a one-tap **Check in** button, plus queue position ("You're next," "2 dogs ahead") and cross-ring conflict chips.

**Why:** this is a genuine redesign, not a port. myK9Q made exhibitors navigate trial → class → find their dog. `/at-show` inverts it: your dogs come to you. The plain-language exhibitor labels are new and better than the internal status names myK9Q showed everyone.

### 2.5 Announcements: full page + push → read-only sticky bar

myK9Q had an Announcements page, an Inbox with unread badges, and push notifications tied to favorited dogs. `/at-show` shows a collapsible read-only announcement bar with an unread pill; composing happens in Show Desk.

**Why:** composing belongs to the secretary surface (consolidation again). But the _push notification_ half of this didn't move anywhere — see gaps below.

### 2.6 Theming: teal + 4 accent themes → host design system + Ring Green rule

myK9Q: teal `#14b8a6` brand, Apple-glass styling, warm off-white light theme, four user-selectable accent themes. myK9Show: `/at-show` inherits the host tokens (terracotta primary) via `.ringside-root`, with one new rule myK9Q never had — **Ring Green `#4e7c53` is reserved exclusively for live judging**, so a gate steward can spot the live ring at a glance (enforced by test).

**Why:** one design system across the platform beats a per-app brand. The Ring Green rule is a net improvement in scanability. The cost: users lose the accent-theme personalization and the familiar teal — worth accepting, since the layout/interaction patterns (which are what muscle memory actually depends on) were kept.

### 2.7 Class list: rich cards → compact grouped rows

myK9Q class cards showed a progress bar, the **in-ring dog** (amber dot + armband), the **next 3 waiting armbands**, and "N of M remaining." `/at-show` class rows are leaner: name, judge, scheduled/expected time, status badge, completed/total count — grouped by trial with collapsible sections and smart sort (favorites → live → has entries).

**Why (partly):** the trial grouping and live-first sort are improvements for multi-trial weekends. But dropping the in-ring/up-next preview lost real information density that gate stewards and exhibitors used — recommendation below.

### 2.8 Realtime

myK9Q leaned on cache refresh + pull-to-refresh with staleness banners ("May be outdated (Xm)"). `/at-show` adds show-scoped realtime Broadcast with a 1.5 s debounce, so lists update live, with pull-to-refresh as fallback. A straight upgrade.

---

## 3. What myK9Q has that myK9Show lacks (the honest gap list)

| Gap                              | myK9Q behavior                                                                                                               | Status in myK9Show                                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Timer warning sound + voice**  | Audible 30-second warning tone and voice announcements (advertised feature: "Automated 30-second time limit warnings").      | `useStopwatch` exposes `onWarningChime`/`onVoiceAnnouncement` callbacks but the `/at-show` scoresheet **never wires them** — timers are silent. Visual banner only. |
| **Class-card live preview**      | In-ring dog (amber dot + `#armband`) + next 3 waiting armbands on every class card.                                          | Class rows show only status badge + counts.                                                                                                                         |
| **Class completion celebration** | Confetti + stats card (total/qualified, start/end time) when the last dog is scored.                                         | Absent.                                                                                                                                                             |
| **Push notifications**           | Web push tied to favorited armbands ("your dog is coming up").                                                               | Favorites exist but drive only sorting/highlighting; no push.                                                                                                       |
| **TV run-order display**         | `/tv/:licenseKey` big-screen run order + podium for venue monitors.                                                          | No equivalent surface.                                                                                                                                              |
| **Public results "Podium" page** | Dedicated results page with medal styling, no auth.                                                                          | Results shown inline on scored entries; public results exist elsewhere in myK9Show but without the podium presentation.                                             |
| **Stats dashboards**             | Breed performance, judge stats, fastest times (recharts).                                                                    | Not in `/at-show`; partial coverage in dog records.                                                                                                                 |
| **Onboarding / niceties**        | First-visit onboarding, one-handed mode, auto-logout warning, accent themes, AskQ chatbot, loading splash with fun messages. | None ported.                                                                                                                                                        |

---

## 4. Recommended changes to myK9Show

Ordered by (user impact at a live show) ÷ (build cost), and filtered against the consolidation principle — nothing here proposes a new duplicate surface.

### Do now (small, high-value, restores expected behavior)

1. **Wire the timer chime and voice announcements in `/at-show`.** The hook already supports it; the scoresheet just doesn't pass the callbacks. Stewards timing for a judge physically watch the dog, not the screen — the audible 30-second warning is the single most functional thing myK9Q users will miss. Add a mute toggle on the scoresheet for quiet venues.
2. **Restore the in-ring / up-next preview on class rows.** Show the in-ring armband (amber dot, as myK9Q did) and the next 2–3 waiting armbands on each class row in the class list. This is the at-a-glance "do I need to head to the ring?" signal exhibitors used constantly, and it fits the existing row layout as a second line.
3. **Class completion celebration.** Confetti + summary when the last entry is scored. Cheap, pure delight (SLC "Lovable"), and it was a beloved myK9Q moment for judges/stewards closing out a class.

### Do soon (moderate effort, real value)

4. **Push notifications for favorited dogs.** Favorites already persist by armband; myK9Q proved the "notify me when my dog's class nears" loop. This is the main reason exhibitors kept myK9Q installed as a PWA. Pairs with the existing "Add to Home Screen" nudge.
5. **Podium-style presentation for completed classes.** Not a new page — a completed-class view state (or section on the entry list's Completed tab) with the 1st–4th medal styling myK9Q's Podium had. Presentation only; data is already there.

### Consider / verify (larger or needs a decision)

6. **TV run-order display.** Venues used this. It's a genuinely new surface, so it deserves the explicit duplication question: it doesn't duplicate anything (no big-screen surface exists), but it's new scope during a consolidation phase. Suggest logging it as a Linear issue and deciding post-launch.
7. **Verify the reset-scored-entry flow.** myK9Q let staff reset a scored entry from the entry card (Reset menu + confirm dialog). Confirm `/at-show` has an equivalent path for fixing a mis-entered score without leaving ringside; if it's Show-Desk-only today, that's a long walk mid-class.
8. **Five-box passcode input.** Cosmetic, but the 5 auto-advancing boxes with auto-submit are what two years of users have typed into. The single-field form works; if passcode-entry friction ever shows up in feedback, this is the familiar shape to restore.

### Explicitly not recommended

- Rebuilding Secretary Tools, Stats, Announcements composing, or a Home dashboard inside `/at-show` — these were correctly relocated to their canonical myK9Show surfaces; re-adding them would recreate the duplication myK9Q's absorption was meant to eliminate.
- Accent color themes — conflicts with the single design system; the Ring Green rule depends on a controlled palette.

---

## 5. Bottom line

The port preserved what actually builds muscle memory — the check-in tap targets, the long-press reorder, the timer thresholds, the result chips, the confirmation flow, the offline calm — while correctly shedding the app shell that myK9Show already provides elsewhere. The differences fall into three buckets: **deliberate consolidation** (secretary tools, results, announcements composing — right call), **genuine improvements** (Your Dogs Today, plain-language statuses, realtime updates, Ring Green, trial grouping), and **unintentional losses** (silent timers, missing class-card preview, no celebration, no push). Closing the four items in "Do now / Do soon" would make `/at-show` feel like myK9Q's direct descendant rather than its replacement.
