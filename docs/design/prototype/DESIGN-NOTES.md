# myK9Show Redesign · Design Notes

> Running record of design decisions made across chats. Read this first in any new chat so you don't re-explore ground we've already covered.

---

## Context

- **Product:** myK9Show — web platform for AKC-style dog shows.
- **Primary initial focus:** **Scent Work** trials (4 elements × 6 levels, 1–2 trials per day).
- **Users:** Two roles with very different needs:
  - **Exhibitor** (handler/owner — often senior) — "Where do I go? How did we do?"
  - **Secretary** — runs the show: check-in, run order, results entry.
- **Codebase (attached at `myk9-platform/`):** pnpm monorepo. Has `apps/`, `packages/`, `CLAUDE.md`, `DESIGN.md`. Not yet read into the design iteration — current mockups are standalone. If future work should align with the real components, start by reading those files.

---

## Design system in use

- **Tokens:** `assets/colors_and_type.css` (Claude-inspired warm palette — ivory/stone neutrals + terracotta brand + teal accents).
- **Extended tokens:** `tokens.css` (senior-friendly scale: 18px body default, 48–64px tap targets, chip color variants, layout vars).
- **Fonts:** Serif display (Cormorant or similar — see `colors_and_type.css`), sans body, mono for times/armbands/numeric data.
- **Icons:** Lucide, via CDN.
- **No Tailwind.** Inline React styles + CSS variables for theming.

---

## Architecture of the mockup

```
myK9Show Redesign.html   ← root
├── tokens.css
├── assets/colors_and_type.css
├── data.js                    ← general dogs/shows/clubs data
├── scentwork-data.js          ← Scent Work-specific: elements, levels, dogs, classes, entries
├── design-canvas.jsx          ← starter: <DesignCanvas>, <DCSection>, <DCArtboard>
├── tweaks-panel.jsx           ← starter: <TweaksPanel>, useTweaks hook
├── components.jsx             ← shared primitives (Sidebar, TopBar, Button, Chip, Cover, etc.)
├── browse-templates.jsx       ← 3 browse directions A/B/C (committed to B)
├── screens.jsx                ← unified tabbed detail template for all entity types
├── secretary.jsx              ← secretary My Shows + context bar + in-show shell
├── scentwork-secretary.jsx    ← Class Run Sheet + drill-down classes page
├── scentwork-exhibitor.jsx    ← Exhibitor class detail + My Entries per show
└── app.jsx                    ← wires everything into the DesignCanvas
```

Every page sits inside a `<DCArtboard>` inside the `<DesignCanvas>` so we can compare variations side-by-side.

---

## Key design decisions (locked in)

### 1. Senior-first baseline
- Body font **18px default** (tweakable 14–22 via Tweaks panel).
- Primary CTAs **64px** tall (`size="xl"`).
- Sidebar nav is **icon + label + sub-label** — never icon-only.
- Breadcrumbs on every page, always visible.
- Plain-English copy everywhere: **"Sign up for this show"** not "Register entry"; **"Your team"** not "My Roster".
- Help card with phone number on every detail page.

### 2. Browse pattern: **Direction B (balanced row-cards)** ✅
- Killed A (photo-first grid) and C (dense table) — B wins because cover + facts + buttons are all visible in a single row without a tap.
- Every browse page (Shows / Dogs / Trials / Classes / Clubs / People) uses this pattern.

### 3. Unified tabbed detail template
- Same hero + tabs pattern for Show / Dog / Club / Person detail pages.
- Once a user learns one, they know them all.
- Tabs are 48px tall and count-labeled (e.g. "Trials (3)").

### 4. Role-awareness via `role` prop
- `PageShell` / `DetailShell` / `Sidebar` accept `role="exhibitor"` (default) or `role="secretary"`.
- Secretary gets: different sidebar items, terracotta accent (instead of teal), extra tabs (Setup, Reports), different primary CTAs ("Manage this show" vs "Sign up for this show").
- Exposed as a Tweak: user can toggle "Viewing as" to preview either role.

### 5. Dashboard → **folded into My Shows** ✅
- We killed the standalone secretary dashboard.
- My Shows is now the secretary's home. An **"Attention needed"** strip at the top does the dashboard's real job (surface what needs eyeballs today) right where she's already looking.

### 6. Secretary context-scoping system
Secretary is always in one of two modes:
- **Across mode** (My Shows page): viewing her portfolio.
- **In-show mode**: working inside ONE show. Triple-redundancy keeps her anchored:
  1. **Sticky "IN SHOW" bar** above breadcrumbs — terracotta left edge, show name, date, entry count, "Switch show ▾" dropdown with other active shows.
  2. **Sidebar chip** at the top of the nav showing the show cover + "IN SHOW" + name. Below it, nav items are show-scoped ("Trials · 3 in this show", "Classes · 24 in this show").
  3. **Breadcrumbs** read `My shows › Lehigh Valley › Classes` — show name is always a link back.
- Plus a "**Back to all my shows**" button at the bottom of the sidebar as the escape hatch.

### 7. My Shows layout: 4 phase groups
- 🔴 **Happening today** (live) — inline live stats: checked-in / expected / progress bar / absent.
- 🟢 **Upcoming · entries open** — entries-in, trials, classes, judges, days-to-show.
- 🟡 **Draft** (not yet published) — setup-progress bar + what's missing. Primary action: "Continue setup".
- ⚫ **Past shows** — collapsed by default, expandable.

---

## Scent Work-specific model

### Data structure
```
Show
 └─ Days (Sat, Sun)
    └─ Trials (1–2 per day — Trial 1 AM, Trial 2 PM)
       └─ Classes (Element × Level × Section)
          └─ Entries (Dog × Class, many-to-many)
             └─ Result (qualified, time, faults, placement, notes)
```
- **Elements:** Container, Interior, Exterior, Buried
- **Levels:** Novice, Advanced, Excellent, Master, Detective, Handler Discrimination
- A single dog can enter up to ~24 classes at one weekend.
- **Result model:** pass/fail with a time. Placements 1st–4th go to fastest qualifying times per class.

### Drill-down pattern
Classes page uses **stacked drill-down:** Day → Trial → Element (optional) → Level (optional). Each level is a row of pill buttons. Terracotta = selected.

### Secretary: **Class Run Sheet** — the magic page
One page does check-in + run order + result entry:
- Header: element glyph + class name + ring/judge/start/time-limit + Start/Close class button.
- Run order modes: **Custom (drag), Armband ↑ (default preset), Armband ↓, Random.** Default is Custom with drag handles.
- Per row: position #, dog avatar, name/armband/owner, **check-in toggle** (big tappable), **Enter result** button, scratch button (X).
- **Result entry is inline (expand-in-place, Option A).** Row expands to show:
  - Qualified / NQ big color-coded toggle (green/red)
  - Search time — huge mono input (MM:SS.ss)
  - Faults — +/− stepper
  - Placement — 1/2/3/4/none pills (gold/silver/bronze/4th colors)
  - Notes textarea
  - Cancel / Save — saves inline, row flips to show result badge.

### Exhibitor: three views

**a. My entries at this show** — grouped by dog.
- Top: **"Where to be & when"** timeline — chronological across the weekend, every class the user's dogs are in, with time/ring/trial.
- Then per-dog sections with every class they're in. Upcoming = "Upcoming" chip; finished = time + Q/NQ + placement.

**b. Class detail BEFORE**
- **"Your dogs in this class"** callout (terracotta accent) — run position, dogs ahead, approximate minutes to ring. "You're up next!" red chip for first up.
- Run order list with YOUR dogs highlighted (terracotta-50 bg + left border + "Yours" chip).

**c. Class detail AFTER**
- Same page flipped: "Your dogs" → **"Your results"** — big green/red callouts per dog (qualified chip, mono search time, faults, placement pill in gold/silver/bronze, Score sheet button).
- Below: full class results table.

---

## Not in v1 — do NOT build these

Explicit cut list so nothing gets invented during build-out. If any of these become priorities later, they're separate design phases.

- **Mobile / tablet breakpoints.** Everything is desktop-first at 1400px. Responsive comes later.
- **Judge app / digital scoresheets.** Judges keep paper scoresheets. The only adjacent thing is the Detective class map (out of scope unless requested).
- **Social login.** Email + password + magic link only. Dog-show demographic skews older and email-first.
- **Messaging / DMs between users.** Contact happens via phone numbers on detail pages.
- **Public (unauthenticated) show results pages.** Results live inside authenticated show detail. SEO / public sharing is a later phase.
- **Payment refunds / cancellations flow.** Scratches don't auto-refund in v1 — clubs handle manually.
- **Other competition types.** Only Scent Work in v1. Conformation, obedience, agility, barn hunt, fast CAT etc. are later phases (the data model is designed to extend, but don't build UI for them).
- **Bulk data import** (e.g. migrating an existing club's show history). Manual entry only.
- **Multi-language / internationalization.** English / US only.
- **Admin / superuser tools.** Out of scope — handled via database access for v1.

## Open questions / not yet built

- **Real-component alignment:** mockup is standalone. Haven't read `myk9-platform/apps/` or `packages/` yet — Claude Code will do this mapping at build time.

## Resolved — spec for handoff

### Absent vs Scratched
Same underlying state (dog does not run), different origin:
- **Scratched** — set by the **exhibitor** ahead of time ("we're not coming / not running"). Visible as Scratched chip; removed from the run order.
- **Absent** — set by the **judge on the scoresheet** at run time (dog didn't show up to the line). Applied from the Class Run Sheet during/after the class.
Both suppress placement eligibility. UI shows distinct chip colors (Scratched = stone gray, Absent = amber) but the result record stores the same `didNotRun: true` plus a `reason: 'scratched' | 'absent'`.

### Score sheet (clarification)
Not needed in this app — the **judge keeps the physical scoresheet**. The only adjacent thing is the **Detective class map** (hide locations diagram), which the judge may share post-class. Treat as out-of-scope unless map-sharing is requested later.

### Bulk check-in
Exhibitor action: **"Check in [Dog] for all classes"** button on the exhibitor's "My entries at this show" page (per dog) and as a top-level "Check in everyone" for all of a user's dogs at the show.
Secretary still sees individual per-class check-in toggles on the Class Run Sheet — bulk check-in just pre-sets them.

### Rolling title progress
Lives on the **Dog detail page**. Shows current progress toward the next title in each element/level the dog has started:
- e.g. "Novice Container — 2/3 Qs" with a 3-pip progress row (filled / filled / empty)
- One row per in-progress title track; completed titles show as a solid chip with the title abbreviation (NW1, NW2, etc.)
- Placed **above the shows/results tab** so it's the first thing the owner sees.

---

## Tweaks panel (live in the mockup)
- Base font size (14–22px)
- High contrast mode
- Density (spacious / comfortable / compact)
- Card style (photo-first / text-first / icon only)
- Show/hide secondary info
- Button size (default / xl)
- Role (exhibitor / secretary) — swaps rendered role across pages

---

## Terminology cheat sheet (use this copy)

| Don't say | Say |
|---|---|
| Register entry | Sign up for this show |
| My Roster | Your team / Your dogs |
| Event | Show |
| NQ | Not qualified (long form) / NQ (chip) |
| Premium | Premium list |

---

## Deferred pages — build directly, no mock needed

These flows follow obvious patterns from the mocked screens. One-paragraph spec each; Claude Code should build them using the existing components (`Card`, `Chip`, `Icon`, `SectionTitle`, `eyebrow`, etc.) and tokens (`--teal-500`, `--ivory-*`, `--stone-*`, `--ink-*`).

### Auth (sign in / sign up / forgot password / reset)
Standard email+password with magic-link option. Single centered card, `max-width: 440px`, on ivory-100 background with the myK9 wordmark above. Sign up collects: name, email, password, role (exhibitor / club officer / secretary — multi-select, most users are exhibitors only). No social login for v1 — dog show community skews older and email-first. Post-signup lands on **Browse shows**; post-sign-in lands on whatever they had open (or Browse shows if first session). Forgot password → email with magic link → set new password card. Use the teal-500 primary button throughout.

### Settings / account
Left rail of section links (Profile, Notifications, Payment methods, Linked dogs, API/exports, Delete account), right pane as stacked `Card` sections with inline edit. Profile = name, email, phone, default location (for "near me" filtering), profile photo, bio. Mirrors the Person detail page shape but every field is editable in place. Save button appears only when dirty; autosave on blur for single-field changes. No tabs — the left rail *is* the tab.

### Notifications center
Top-nav bell icon → slide-in panel (not a new page) listing the last 30 days of events: "Maggie moves up to Advanced Container after today's Q", "Your entry for Lehigh Valley Scent Work was confirmed", "Ring 2 running 20 min behind", "Judge Carla Mendez assigned to your class tomorrow". Grouped by day with eyebrow date headers. Each row has an icon chip (color-coded: teal=entry, green=Q, amber=schedule, blue=assignment), one-line message, relative timestamp right-aligned. Clicking a row deep-links to the relevant show/class/dog. Mark-all-read button in panel header. Full page at `/notifications` for history beyond 30d with same row design.

### Add a dog / edit a dog
Reached from Dog list "+ Add dog" or Dog detail "Edit" button. Single-column form inside a `Card`, max-width 720px. Fields in groups: **Identity** (call name, registered name, breed autocomplete, sex, DOB, color, microchip), **Registration** (primary registry dropdown + number, additional registrations as repeatable rows), **Photo** (drag-drop upload, square crop), **Ownership** (owner name — defaults to current user, co-owners as chips). Submit = teal-500 button bottom-right; Cancel is a text link. Edit mode pre-fills everything and shows "Archive dog" as a destructive outlined button at the bottom. Breed autocomplete uses a static AKC breed list for v1.

### Payment / checkout for entry fees
Reached from the entry sign-up confirmation step. Shows a summary `Card` (show name, dog, list of class line-items with fees, subtotal, processing fee line, total) then a Stripe Payment Element embedded below. Use Stripe's hosted Payment Element (don't rebuild card UI). One teal-500 "Pay $XX.XX and confirm entry" button. On success → entry confirmation page with receipt number + "View My Entries" + "Add another dog to this show" actions. Failed payment → inline error above the Payment Element, entry stays in a 24h "pending payment" state rather than being discarded.

### Premium list / publish show form (club officer)
Multi-step wizard (not a single mega-form) since shows have lots of fields. Steps: **1. Basics** (name, club, venue, dates, location), **2. Events** (which elements/levels offered — AKC Scent Work / NACSW / barn hunt / etc., use the same chip patterns as the Class detail), **3. Judges** (assign judges to classes — reuses the Person chip pattern), **4. Entry fees & limits** (fee per class, entry cap, opens/closes dates), **5. Premium list upload** (PDF upload + "Generate from above" option), **6. Review & publish**. Progress indicator at top; each step is a `Card`; Back / Continue buttons bottom-right. Save-as-draft at every step. Published shows appear in Browse within 5 min.

### Receipts / confirmation emails
Transactional emails (rendered server-side) but design pattern: plain white background, myK9 wordmark header, one-column 600px table, teal-500 accent line above key info blocks. Sections: confirmation header ("Your entry is confirmed"), show summary card, dog + classes list, total paid, "View in myK9" teal-500 button, secondary details (venue, check-in instructions, contact secretary link), small footer with unsubscribe + manage notifications links. Entry confirmation, payment receipt, and result notifications all follow this shell — only the header message + body content change.

---

## Where to pick up

If starting fresh, open `myK9Show Redesign.html`, scroll through the design canvas top-to-bottom:
1. Browse templates (A/B/C — B is committed)
2. Unified detail template (all 6 entity types)
3. Secretary My Shows
4. Secretary in-show mode (Entries + Show detail)
5. Scent Work Secretary (Drill-down + Class Run Sheet)
6. Scent Work Exhibitor (My Entries + Class BEFORE + Class AFTER)

All component names, CSS vars, and data-model shapes are consistent across files so adding the next flow is "find the right starter, copy its shell, scope the data."
