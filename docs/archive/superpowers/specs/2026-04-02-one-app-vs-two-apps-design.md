# One App vs Two Apps: Platform Architecture Decision

**Date:** 2026-04-02
**Status:** Approved
**Decision:** Keep both apps with a clear boundary

---

## Decision

Keep myK9Show and myK9Q as separate applications with distinct roles. No merge.

## App Boundaries

### myK9Show -- The Platform

The single app for the entire dog show lifecycle: discovery, registration, payment, show management, analytics, and trial-day features for exhibitors. All roles use it: exhibitors, secretaries, club admins, judges (for non-ringside tasks like viewing assignments), and site admins. OAuth authentication with persistent identity.

### myK9Q -- The Ringside Tool

Purpose-built for people actively working the ring during a trial. Judges score, stewards manage flow, timers run clocks, exhibitors track run order and results. Passcode authentication for frictionless, ad-hoc access -- anyone can be handed a device and be productive in seconds. Offline-first for unreliable venue connectivity.

### The Rule

If a feature is used _at the ring during a trial_, it belongs in myK9Q (and optionally also in myK9Show for exhibitors who prefer one app). If a feature is used _before, after, or away from the ring_, it belongs in myK9Show only.

## What Changes

### Features to Port TO myK9Show (not yet there)

- **TV run order display** -- Public live view of current class, run order, results podium
- **Voice announcements / settings** -- Audio notifications for exhibitors at the trial

### Features to Strip FROM myK9Q (already ported to myK9Show)

- Secretary tools (results control, Kanban board, volunteer scheduling)
- Reports (trial secretary report, judge certification, etc.)
- Show management / admin features
- In-app chat (now in myK9Show)
- Announcement _creation_ (keep read-only display for exhibitors; creation is a secretary function in myK9Show)

### Features That Stay in BOTH Apps

- Run order / entry list viewing (exhibitors use whichever app they prefer)
- Results viewing
- Turn notifications / "on deck" alerts
- Scoring + scoresheets (myK9Q is primary; myK9Show has ported versions)
- AskQ AI assistant (rules lookup is valuable at the ring)
- Offline-first data via `@myk9/replication`

### Shared Packages (No Changes)

`@myk9/core`, `@myk9/scoring`, `@myk9/scoring-ui`, `@myk9/secretary`, `@myk9/ui`, `@myk9/supabase`, `@myk9/replication` continue serving both apps.

## Priorities & Dependencies

### 1. Port TV Run Order + Voice Announcements to myK9Show

No dependency on myK9Q alignment. Exhibitors benefit immediately. Mobile-first design since phones are the primary device at a show.

### 2. Align myK9Q to Platform Database

The myK9Q in this monorepo was copied from the standalone production repo and likely points to a different Supabase project. Work required:

- Point myK9Q at the `myk9-platform` Supabase project (URL + anon key)
- Reconcile schema differences (table names, column names that diverged)
- Verify replication and scoring work against the unified database
- Test edge function references

This is the heavy lift and a prerequisite for passcode generation and feature stripping.

### 3. Build Passcode Generation in myK9Show

Secretary generates per-show passcodes from myK9Show. Passcodes stored in the shared Supabase database, myK9Q validates against them via existing edge function. Depends on priority #2 (shared database).

### 4. Strip Secretary/Admin Features from myK9Q

Low-priority cleanup. Remove ported features when naturally touching those files. No urgency -- both apps continue working throughout.

## Migration Strategy

- **No big bang.** Both apps continue working throughout the transition.
- **Port first, strip second.** Exhibitors get trial-day features in myK9Show before anything is removed from myK9Q.
- **Exhibitors choose.** myK9Q remains fully functional for exhibitors who prefer it. myK9Show becomes the recommended single app over time.

## Key Design Decisions

### Why not merge?

1. **Passcode auth is essential at ringside.** Ad-hoc participants (timers, substitute stewards) need instant access without accounts. Grafting passcode auth onto an OAuth app adds complexity for marginal benefit.
2. **Offline-first depth.** myK9Q has 17 replicated tables with battle-tested conflict resolution. myK9Show has 7. The gap is closable but represents real complexity that would bloat the platform app.
3. **Different UX priorities.** Ringside needs one-handed mobile operation, haptic feedback, big touch targets. Platform needs desktop-friendly dashboards, tables, and forms. Serving both well in one app means compromise or conditional UX that's hard to maintain.
4. **Connectivity reality.** Trial venues range from good Wi-Fi to no cell service. A purpose-built offline tool handles this better than a general-purpose platform with offline bolted on.

### Why not keep both unchanged?

1. **Exhibitors juggle two apps.** Registration in myK9Show, run order in myK9Q. One app for the full lifecycle is better.
2. **Secretary tools are duplicated.** Results control, reports, and admin features in myK9Q duplicate what's now in myK9Show. Maintaining both wastes effort.
3. **Unclear ownership.** Without a boundary rule, every new feature triggers a "which app?" debate.

### myK9Show mobile performance

myK9Show uses `React.lazy()` with priority-based route preloading, so exhibitors at a trial only download the routes they need. The PWA service worker caches the app shell after first load. New exhibitor trial-day features (run order, turn notifications, results) should be designed mobile-first since phones are the primary device at a show.
