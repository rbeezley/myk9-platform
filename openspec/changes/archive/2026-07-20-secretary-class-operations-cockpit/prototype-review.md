# Secretary Cockpit Prototype Review

> Archived review artifact. After the production cockpit passed the browser,
> offline, and shared-staging gates below, the development-only prototype route
> and fixture components were removed to avoid leaving a duplicate Show Desk.

## Question

Does the approved stable-schedule cockpit let a busy secretary orient, focus one
Class, follow an exact issue destination, return without losing context, and
coordinate physical printing across desktop and tablet?

## Run

```bash
pnpm dev:show
```

During the prototype approval phase, the review route was:

```text
http://127.0.0.1:5173/prototype/secretary-cockpit?variant=scent
```

The route existed only in development builds. It used fixture data, kept all
state in memory or the URL, performed no query or mutation, and did not alter or
replace the production Show Desk.

Use the floating arrows or keyboard Left/Right to switch among:

- `scent` — named and multiple Search Areas, concurrent preparation/scoring/closeout.
- `rings` — numbered Rings plus an explicitly unassigned Operational Area.
- `offline` — the same secretary workflow with `Saved on this device` print coordination.

## Walkthrough

1. In ten seconds, identify the running Class, urgent request, next preparation,
   completed closeout, and stale or unconfirmed paperwork.
2. Select several schedule rows. Focus must change only when selected and must
   stay in schedule order.
3. Use All, In progress, Needs attention, and Needs closeout filters. Confirm the
   controls sit directly above the schedule they filter, not above the focused
   Class panel.
4. Open the move-up attention item. Verify the exact Entry Management
   destination, then use Back to Show Desk and confirm the Class focus returns.
5. Select Container Novice A and print its check-in sheet. Opening the report or
   simulating browser Print must not create confirmation. Mark printed must show
   `Printed <time> by You` and add an in-memory history entry.
6. Repeat in the offline scenario. The confirmation must say it is saved on
   this device.
7. At desktop or landscape width, confirm schedule and focused panel are visible
   together. At portrait-tablet width, confirm only the selected row expands
   inline and the primary action remains visible.
8. Switch to numbered Rings and confirm Ring is metadata, the schedule structure
   is unchanged, and the missing Ring is not inferred from Judge.
9. Focus a Class with no attention item. Confirm `Class work` still exposes
   Entries & results, Paper score entry, and Run order; each must identify its
   existing owner rather than reproduce the workflow in Show Desk. Results
   review must not route to Results Control, which owns visibility/release.
10. Confirm same-day Classes are grouped under Trial number and Trial date.
    Collapse each Trial and verify its In progress, attention, and focused summaries
    remain visible; initial load must leave every Trial expanded.
11. Edit Container Novice A's Revised Expected Start inline. Confirm the schedule,
    focused Class, and attention item update while Scheduled Start remains visible
    and the Class stays in its original schedule position. Confirm Use scheduled
    time clears only the revision.

## Current Evidence

- myK9Show TypeScript application and test-project typechecks pass.
- Focused ESLint passes for all prototype and route files.
- Production Vite build passes; existing CSS, dynamic-import, and bundle-size
  warnings remain unchanged in kind.
- Automated Chrome walkthrough passed at 1440×1000 and 820×1180 in both light
  and dark themes with no console errors. It verified readable semantic status
  surfaces, same-day Trial date/number grouping, expanded-by-default collapse
  behavior with visible summaries, exact issue destination and return URL,
  responsive inline focus, print confirmation timestamp, all three scenarios,
  and missing-area truthfulness. The final timing pass also verified contained
  inline editing, shared Expected/Scheduled display, attention-text updates, and
  zero console errors; the only warnings were the existing unused hero preload.

## Verdict

Product owner approved the prototype direction on July 20, 2026, including the
final Revised Expected Start interaction. The owner exercised the five-Class
schedule, attention strip, focused-Class navigation, Trial grouping, paperwork
state, and revised-time behavior and confirmed the orientation model before
approving implementation. Proceed to the production implementation gates. Keep
the current production Show Desk in place until the real cockpit passes
verification, then delete or absorb the fixture prototype rather than leaving a
parallel surface.
