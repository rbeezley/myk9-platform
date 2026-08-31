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
MYK9_MEASUREMENT_SWEEP=1 pnpm exec playwright test src/test/e2e/qa/measurementSweep.spec.ts \
  --project=chromium --reporter=list --retries=0 --workers=1
```

The `MYK9_MEASUREMENT_SWEEP=1` gate is required, not decorative: without it every
group skips. `playwright.config.ts` matches every spec under `src/test/e2e`, so
without the gate a plain `pnpm test:e2e` would silently gain this run's ~15
minutes plus a dependency on live seeded data and four sets of credentials.

Writes `test-results/measurement-sweep/findings.json` and `report.md`. The run
below took 13.4 minutes for 84 measurements.

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

Seven further harness defects were found across three rounds of review on this
PR, each of which would have made the report state something false. All were
fixed before these numbers were taken, and the sweep was re-run in full after
every round — five runs in total, because a fix that could move a published
number is not finished until the number has been re-measured:

- **Clustering read truncated data.** The probe samples at most 12 findings per
  category per page, and the cross-route grouping was built from those samples.
  The report would therefore have ranked by severity while claiming to rank by
  spread — a colour pair used 400 times on a page contributed nothing unless it
  happened to be among that page's worst dozen readings. Clustering now reads
  untruncated per-page aggregates, and the report carries an **Instances**
  column so the difference is visible. It mattered: the `L0` class-code badges
  below appear **200 times** on one route and were invisible in the first run.
- **The spacing exception was under-strict.** It compared centre distances only,
  which tests circle-against-circle and misses WCAG 2.5.8's other half — the
  24px circle must not intersect *another target* either. A 16px control beside
  a large button 20px away passed a test that was not looking. Now checked
  against neighbouring bounding boxes as well. The conclusion below survived the
  stricter check, which is the only reason it is stated.
- **Visibility ignored opacity.** A dialog or menu that stays mounted at
  `opacity: 0` still has a real bounding box, `display: block` and
  `visibility: visible`, so its buttons reached the target and accessible-name
  scans as findings about controls nobody can see. Worth recording that fixing
  this changed **no numbers at all** on this app — the counts below are
  byte-identical before and after — so it removed a latent class of false
  finding rather than a live one. That is only knowable because the sweep was
  re-run to check, instead of the fix being assumed to matter.
- **A failed sign-in erased a whole role group.** The exception was thrown before
  the route loop, so all of that group's routes vanished from the results while
  the report went on advertising the full route count: a credential problem
  rendered as clean coverage. Sign-in failures are now recorded as exclusions,
  one per route, and the coverage table carries an explicit
  **Never attempted** row for groups skipped for missing credentials. This one
  was a plain self-contradiction — the same file's exclusion list exists to stop
  exactly this, and the sign-in path went around it.
- **The opt-in was documentary only.** `playwright.config.ts` matches every spec
  under `src/test/e2e`, so describing this file as "run it deliberately" in prose
  changed nothing: a plain `pnpm test:e2e` picked it up and gained ~15 minutes
  plus a dependency on seeded data and four sets of credentials. Now gated on
  `MYK9_MEASUREMENT_SWEEP=1`, verified in both directions (without it the file
  reports "10 skipped").
- **A child route counted as its parent.** Reachability used a `startsWith`
  prefix test, so a redirect from `/shows/:id` into `/shows/:id/register` would
  have filed the wizard's findings under the show-detail row — and this table
  sweeps several parent/child pairs. Now an exact match; anything that
  normalises elsewhere appears in the exclusion table with the path it landed
  on, which is the more useful answer anyway.
- **An input's `value` was read as its accessible name, and then the correction
  overshot.** `value` names only the button-like input types; for a text input
  it is user data, so an unlabelled prefilled field reported as accessible and
  an identical empty one reported as a defect. Fixing that took the count from
  **4 to 28** — and 18 of those 24 were false, because `accessibleName` checked
  `label[for]` but never a *wrapping* `<label>`, which is an equally valid
  association. The landing page's waitlist radios and the sign-up consent
  checkbox are all correctly labelled that way. The probe already knew about
  implicit labels — `effectiveBox` walks to `closest('label')` for the target
  check — and simply did not use them here. Final count: **10**, all real.

  This one is the whole lesson in miniature. The first number was wrong, the
  correction was also wrong, and the only thing that separated them was
  re-running and reading the output instead of trusting that a fix which sounded
  right had made things better.

Fixing the wizard result also meant replacing the readiness gate.
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
| Route × theme measurements expected | 84 |
| Route × theme measurements attempted | 84 |
| Never attempted (group skipped) | 0 |
| Usable | 80 |
| Excluded | 4 |
| Text nodes measured for contrast | 31,046 |
| Text nodes not measurable (image/gradient backdrop) | 164 |
| Contrast findings | 947 |
| Small-target findings | 676 |
| Controls with no accessible name | 10 |
| **Measurements with horizontal overflow** | **0** |

The four exclusions are all the same honest result: `/secretary/tasks` and
`/secretary/waitlist` redirect to `/secretary/dashboard` in both themes. Those
routes are declared in the router but do not resolve to their own page for this
account — worth a look, but not a measurement.

## Two results that are good news

**No horizontal overflow anywhere.** Eighty measurements, zero. The responsive
work that `shell-integrity-responsive.spec.ts` and the round-4 registration pass
pinned is holding across every route, not just the pinned ones.

**No WCAG 2.5.8 AA target failures.** All 676 small-target instances are against
the **44px** bar this project adopted in round 5, not the 24px WCAG AA floor —
`under24` is zero across every one of them. Every undersized control either
clears 24px or satisfies 2.5.8's spacing exception, checked in both its halves
(the 24px circle intersects neither another undersized target's circle nor any
other target's bounding box). That distinction matters: 44px is a self-imposed
comfort standard, so these are polish, not conformance defects.

## Contrast — ranked by spread, not by severity

This is the ranking that answers the original question. A single low reading is
a page nit; the same colour pair across many routes is **one token edit**.

| Colour pair | Routes | Instances | Worst | Detail |
| --- | --- | --- | --- | --- |
| `--muted-foreground` @ 70% on card | **5 light + 5 dark** | 40 | 3.04 / 3.40 | 14px "Entries Close", "Total Entries" |
| `--muted-foreground` @ 60% on page bg | 2 light + 2 dark | 12 | 2.49 / 2.90 | 10px "Your account", "Notifications" |
| `--muted-foreground` @ 80% on card | 2 light + 2 dark | 16 | 3.80 / 3.99 | 14px form labels — "First name" |
| zinc/slate greys on dark cards | 1 | **200** | 1.88 | class-code badges "L0"–"L3", avatar initials "TJ" |
| `rgb(255,255,255)` on emerald `rgb(52,211,153)` | 2 | 12 | 1.92 | 14px badge "6 elements", admin/templates |
| near-white on `rgb(255,251,235)` | 1 | 4 | **1.03** | 16px "Directory drift", admin/help dark |
| `rgb(201,100,66)` ↔ `rgb(245,244,237)` | 2 | 32 | 3.54 | "Enter this show", "An A.K.C. Licensed Trial" |
| `rgb(255,255,255)` on terracotta `rgb(217,119,87)` | 2 | 2 | 3.12 | 16px "Table" toggle, browse-shows dark |
| amber on amber — `rgb(146,64,14)` on `rgb(165,69,45)` | 1 | 1 | **1.17** | "In progress" badge, secretary/show-desk |
| green/amber stat numbers | 3 | 3 | 2.06 | 36–42px bold "0", "2", "90%" — judge/stats, admin/sync |

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

`1.03:1` on `/admin/help` (dark) is the worst reading in the app — near-white
text on a near-white amber callout, invisible. `1.17:1` for the show-desk's
"In progress" badge is dark amber on mid-amber, equally unreadable.

The zinc/slate class-code badges on `exhibitor/show-detail` are the largest
single block: four hardcoded greys outside the token system, 200 rendered
instances, all around 1.9:1 on dark cards. This one is only visible because
clustering counts instances — by *route* spread it is a single-route finding,
and by worst-ratio it sits mid-table.

The 36–42px stat numbers only need 3:1 as large text, and miss it by a little.
Whether that is worth changing is a design call, not a defect report.

## Small targets — the 44px bar

| Control | Routes | Instances | Size | Examples |
| --- | --- | --- | --- | --- |
| `button` | 20 | 50 | 32px | "Change photo", "See classes", "Copy Admin code" |
| `button` | 20 | 50 | 40px | "Add Dog", "Copy link", "Print", "Regenerate codes" |
| `a` | 18 | 66 | 24px | sidebar / nav links |
| `a` | 14 | 28 | 36px | "Sign In", "Sign Up" |
| `button` | 14 | 138 | 36px | "More show actions", "Move up — #100 Willow" |
| `combobox` | 12 | 18 | 40px | "Trial", "Sort", "Report", "Organization *" |
| `input` | 8 | 24 | 40px | form fields on account and create-show |
| `checkbox` | 4 | 6 | 16px | "Select all registrations on this page" |

The shape here is a **shared-component** story, not a per-page one: the 32px and
40px button clusters each span 20 route-measurements, which means they are
`Button` size variants, not individual mistakes. Round 5 already found
one instance of exactly this (`size="default"` is `h-10` = 40px, despite its
"Comfortable touch target" comment) and fixed it at one call site. The variant
itself is still 40px everywhere else.

## Controls with no accessible name

Ten, across three surfaces: three form inputs on `/exhibitor/account`, the reply
input on `/admin/support`, and the search input on `/admin/help` — each counted
once per theme. All are inputs carrying a placeholder and no label, explicit or
wrapping. Placeholder text is deliberately not accepted as a name here: it
disappears the moment the field has content, which is exactly when a screen
reader user needs it.

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

## Filed

Every finding above is tracked. None is fixed in PR #1911 — that PR adds the
sweep and this report, and touches no application code.

| Issue | Priority | Scope |
| --- | --- | --- |
| [MYK9-274](https://linear.app/myk9-platform/issue/MYK9-274) | High | `text-muted-foreground` opacity family — 14 route-measurements, both themes |
| [MYK9-275](https://linear.app/myk9-platform/issue/MYK9-275) | High | The two unreadable badges — 1.03:1 on `/admin/help`, 1.17:1 on show-desk |
| [MYK9-276](https://linear.app/myk9-platform/issue/MYK9-276) | Medium | Hardcoded zinc/slate class-code badges, ~1.9:1, 200 instances |
| [MYK9-277](https://linear.app/myk9-platform/issue/MYK9-277) | Medium | Shared `Button`/input/combobox size variants under 44px |
| [MYK9-278](https://linear.app/myk9-platform/issue/MYK9-278) | Medium | Five placeholder-only inputs with no accessible name |
| [MYK9-279](https://linear.app/myk9-platform/issue/MYK9-279) | Low | `/secretary/tasks` and `/secretary/waitlist` redirect to the dashboard |

Already open from the round-5 pass, and not re-filed:
[MYK9-269](https://linear.app/myk9-platform/issue/MYK9-269) — sonner toast at
4.26:1 with a 20×20 close button. The toast is global styling from the library
rather than a route, so this sweep does not reach it.

Note that MYK9-277 deliberately asks whether the 44px bar is right before asking
anyone to meet it. 676 instances is a great deal of churn for a self-imposed
standard that no conformance criterion requires, and the sweep's own finding is
that the app has **zero** WCAG 2.5.8 AA failures. A measurement report is most
useful when it makes that distinction on the reader's behalf instead of
presenting every number as a defect.
