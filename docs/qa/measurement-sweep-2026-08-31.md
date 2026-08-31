# Route measurement sweep — 2026-08-31

> **Status:** Reference — a snapshot of measurements, not a work plan.

Measurement only. Nothing here was fixed, and the sweep asserts nothing. It
exists to answer the question that prompted it: is there value in running the
impeccable page playbook on all ~40 routes?

**Short answer: not the playbook — the measuring.** The full playbook is
expensive and has generated work as well as found it (round 3's headline finding
was wrong and its fix was a reverted net regression; round 5's first probe
reported 1,113 defects that did not exist). Measuring is cheap, and it is the
half rounds 1–4 could not do at all, because Vercel was rate-limited for the
whole of #1890 and no browser preview ever came up. This sweep is that half,
generalised across every route.

## How to reproduce

```bash
cd apps/myk9show
pnpm exec playwright test src/test/e2e/qa/measurementSweep.spec.ts \
  --project=chromium --reporter=list --retries=0 --workers=1
```

Writes `test-results/measurement-sweep/findings.json` and `report.md`. The run
below took 14.1 minutes for 84 measurements.

## Why these numbers can be believed

Round 5 established that the harness lies more readily than the app does, so
this one was made to prove itself three ways before its output was read:

1. **Known-answer checks on every page.** The probe measures black-on-white
   (must be 21), white-on-white (must be 1) and `#767676`-on-white (must be
   4.54) alongside the real page, and any measurement whose answers moved is
   excluded rather than reported. All 84 returned `21 / 1 / 4.54`.
2. **A positive control.** The dark `--muted-foreground` fix from #1901 was
   reverted and the sweep re-run: it reported the step caption "Current" at
   **3.96:1 on rgb(48,38,32)** — byte-identical to the round-5 measurement that
   originally found it. The probe detects a defect known to be there.
3. **An independent hand-check.** The top cluster below, `#6b6358` at 70% alpha
   over `rgb(250,250,247)`, computes to **3.06:1** by hand against the WCAG
   formula. The probe reported 3.04.

It also carries two standing guards for the failure modes that burned round 5:

- **Implausible-failure-rate guard.** A page where more than half its text fails
  is treated as a broken measurement, not as findings. This is not theoretical —
  during development the registration wizard produced **1,277 findings out of
  1,291 text nodes**, every one an artefact of being caught mid-fade-in. The
  known-answer checks stayed green throughout, because the arithmetic was
  correct; only the ratio of findings to content gave it away.
- **Failed-theme-flip guard.** A "dark" run that actually rendered light is
  excluded. Light mode uses a darker muted token that clears AA nearly
  everywhere, so a failed flip is otherwise indistinguishable from a clean dark
  theme.

Fixing that wizard result also meant replacing the readiness gate.
Route-health's "body text > 20 chars, then settle" is too weak for
authenticated, data-driven pages — the same route measured 1,291 text nodes on
one run and 16 on the next. The sweep now waits for the app's API reads to go
idle, for text length to stop changing between samples, and for running
animations to finish, each capped.

## Coverage

Two measurements per route, light and dark. Club-admin is absent because
`E2E_CLUB_ADMIN_PASSWORD` is local-only and wired into no workflow.

| Metric | Value |
| --- | --- |
| Routes | 42 |
| Route × theme measurements attempted | 84 |
| Usable | 80 |
| Excluded | 4 |
| Text nodes measured for contrast | 31,047 |
| Text nodes not measurable (image/gradient backdrop) | 164 |
| Contrast findings | 947 |
| Small-target findings | 676 |
| Controls with no accessible name | 4 |
| **Measurements with horizontal overflow** | **0** |

The four exclusions are all the same honest result: `/secretary/tasks` and
`/secretary/waitlist` redirect to `/secretary/dashboard` in both themes. Those
routes are declared in the router but do not resolve to their own page for this
account — worth a look, but not a measurement.

## Two results that are good news

**No horizontal overflow anywhere.** Eighty measurements, zero. The responsive
work that `shell-integrity-responsive.spec.ts` and the round-4 registration pass
pinned is holding across every route, not just the pinned ones.

**No WCAG 2.5.8 AA target failures.** All 676 small-target findings are against
the **44px** bar this project adopted in round 5, not the 24px WCAG AA floor.
Every undersized control either clears 24px or passes 2.5.8's spacing exception
(a 24px circle centred on it touching no other target's circle). That
distinction matters: 44px is a self-imposed comfort standard, so these are
polish, not conformance defects.

## Contrast — ranked by spread, not by severity

This is the ranking that answers the original question. A single low reading is
a page nit; the same colour pair across many routes is **one token edit**.

| Colour pair | Routes | Worst | Detail |
| --- | --- | --- | --- |
| `--muted-foreground` @ 70% on card | **5 light + 4 dark** | 3.04 / 3.40 | 14px "Entries Close", "Total Entries" |
| `--muted-foreground` @ 60% on page bg | 2 light + 2 dark | 2.49 / 2.90 | 10px "Your account", "Notifications" |
| `--muted-foreground` @ 80% on card | 2 light + 2 dark | 3.80 / 3.99 | 14px form labels — "First name" |
| `rgb(255,255,255)` on emerald `rgb(52,211,153)` | 2 | 1.92 | 14px badge "6 elements", admin/templates |
| `rgb(255,255,255)` on terracotta `rgb(217,119,87)` | 2 | 3.12 | 16px "Table" toggle, browse-shows dark |
| `rgb(201,100,66)` ↔ `rgb(245,244,237)` | 2 | 3.54 | "Enter this show", "An A.K.C. Licensed Trial" |
| amber on amber — `rgb(146,64,14)` on `rgb(165,69,45)` | 1 | **1.17** | "In progress" badge, secretary/show-desk |
| zinc-600 `rgb(82,82,91)` on dark card | 2 | 1.88 | avatar initials "TJ", class codes "L0"–"L3" |
| green/amber stat numbers | 3 | 2.06 | 36–42px bold "0", "2", "90%" — judge/stats, admin/sync |

### What the top three rows mean

They are one family: **`--muted-foreground` composited through an opacity
utility.** `text-muted-foreground/70`, `/60` and `/80` each drop the token below
AA on the surfaces it is actually painted on, in **both** themes, across **13**
route-measurements. This is the same defect class as #1901 — that fix changed
the token itself, which was correct for the full-opacity uses and does nothing
for the faded ones.

This is also the cluster that vindicates the sweep. Round 5 flagged the `Label`
primitive's `text-muted-foreground/80` (112 importers) as "still open" from a
single page. The sweep shows it is not one page's problem, and it is not one
opacity — it is a pattern used at three different alphas on nine routes. One
decision fixes all of it; nine impeccable runs would have found it nine times.

### What the rest mean

`1.17:1` for "In progress" on the show-desk is the worst single reading in the
app: dark amber text on a mid-amber badge, effectively unreadable. The zinc-600
avatar initials are hardcoded outside the token system and vanish on dark
surfaces. Both are page-local and cheap.

The 36–42px stat numbers only need 3:1 as large text, and miss it by a little.
Whether that is worth changing is a design call, not a defect report.

## Small targets — the 44px bar

| Control | Routes | Size | Examples |
| --- | --- | --- | --- |
| `button` | 18 | 32px | "Change photo", "See classes", "Copy Admin code" |
| `a` | 18 | 24px | sidebar/nav links |
| `button` | 16 | 40px | "Copy link", "Print", "New Person" |
| `a` | 14 | 36px | "Sign In", "Sign Up" |
| `button` | 14 | 36px | "More show actions", "Move up — #100 Willow" |
| `combobox` | 8 | 40px | "Trial", "Sort", "Report", "Organization *" |
| `input` | 6 | 40px | form fields on account and create-show |
| `checkbox` | 4 | 16px | "Select all registrations on this page" |

The shape here is a **shared-component** story, not a per-page one: the 32px and
36px button clusters span 18 and 14 route-measurements respectively, which means
they are `Button` size variants, not individual mistakes. Round 5 already found
one instance of exactly this (`size="default"` is `h-10` = 40px, despite its
"Comfortable touch target" comment) and fixed it at one call site. The variant
itself is still 40px everywhere else.

## Controls with no accessible name

Four, and only two distinct: the reply input on `/admin/support` and the search
input on `/admin/help`. Both are placeholder-only inputs with no label.

## What this argues for

1. **Keep the sweep, run it periodically.** It is 14 minutes, it fixes nothing,
   and it found three cross-cutting issues that page-by-page work would have
   found one route at a time.
2. **Act on clusters, not on rows.** The `--muted-foreground` opacity family and
   the `Button` size variants are two decisions that clear most of this report.
3. **Reserve the full impeccable playbook** for money/trust-path pages, or for a
   page where the sweep shows a *cluster of its own* — that is the tell for a
   structural cause, as it was for MYK9-260.
4. **Do not turn this into a gate yet.** A gate needs a baseline nobody has
   established, and a gate that starts red gets suppressed rather than fixed.
   Measure first, decide the bar from real numbers, then pin the specific
   defects worth pinning — which is what `wizardVisualQA.spec.ts` does for the
   two the registration wizard had.
