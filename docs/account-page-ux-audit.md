# UX Audit: Exhibitor Account Page (`/account`)

> **Status:** Active

**Date:** 2026-07-23
**Auditor:** Claude
**Sources:** Live browser walk as `e2e-exhibitor@test.myk9.com` on this worktree's dev server + full code trace of every settings component and the preference persistence path.

## How settings are persisted (context for all findings)

Two unconnected systems back this page:

1. **`user_preferences` DB blob** (`useUserPreferences` → Supabase JSONB) — used by Appearance, Privacy, Data & sync. **Nothing else in the app ever reads this blob.** A value written here only has effect if the component _also_ applies it imperatively at click time.
2. **Zustand stores in localStorage** (`settingsStore`, `notificationStore`) — used by Appearance (partially), General, Notifications. These ARE consumed app-wide.

Export / Import / Reset-all operate only on system 1, so they silently exclude General and Notifications.

## Pass 1: Mental Model Alignment

**What UI suggests:** every toggle governs real behavior; "Saved" means the setting is now in effect.

**What it actually does:** several sections write a value to a blob no code reads, then flash "Saved."

| UI Element                                                                                                                                     | User Expects                                                 | Actually Does                                                                                                                                                            | Severity     |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| Privacy: Usage Analytics / Data Collection / Usage Statistics / Crash Reporting toggles + Maximum Privacy / Balanced / Full Experience presets | Controls what data the platform collects                     | **Nothing.** All four keys have zero readers. Verified live: toggle → "Saved" flash, no behavioral change anywhere.                                                      | **Critical** |
| Privacy Score meter ("Low Privacy — you have lower privacy with most features enabled")                                                        | Reflects real data collection                                | Scores dead toggles; defaults make a new user read "Low Privacy" about collection that doesn't happen                                                                    | **Critical** |
| Data & sync: Bandwidth & Quality (4 modes), Preload Images, Enable Offline Mode, Background Sync                                               | "Optimize data usage", "work without an internet connection" | **Nothing.** Zero readers for all four keys. The app's real offline behavior is the replication layer, ungated by these.                                                 | **Critical** |
| Appearance: Layout Density, Reduce Motion, High Contrast                                                                                       | Setting persists                                             | Applies live, saves to blob, **but is never re-applied on boot.** Verified live: after reload the High Contrast switch shows ON while the `high-contrast` class is gone. | High         |
| "Reset Theme Settings"                                                                                                                         | Everything returns to defaults                               | Resets the DB blob only; live accent/theme in settingsStore and applied density/contrast classes are untouched                                                           | Medium       |
| Export/Import/Reset all settings                                                                                                               | Covers all my settings                                       | Covers only the blob — excludes Notifications, Haptics, and the live theme store                                                                                         | Medium       |

**Jargon found:** "Data & sync" (means cache + dead toggles), "Background Sync", "Bandwidth & Quality" tiers — infrastructure language for behavior that doesn't exist.

## Pass 2: Information Architecture

**Current structure:** Your account (Profile, My dogs) · Display (Appearance, General) · Notifications · Privacy & security (Privacy, Security) · Advanced settings (Data & sync, Install app, Delete account) + Export/Import/Reset buttons.

| Issue                   | Location          | Problem                                                                                       | Recommendation                                                                |
| ----------------------- | ----------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Single-toggle section   | General           | Whole nav item contains one switch (Haptic Feedback, mobile-only)                             | Fold into Appearance or Notifications; delete "General"                       |
| Duplicate surface       | My dogs           | Read-only mirror of `/dogs` (already in sidebar as "My Dogs") — violates one-concern-one-page | Replace section with a link, or drop it                                       |
| Overloaded group        | Advanced settings | Mixes a cache utility, PWA install, and account deletion — unrelated concerns                 | Install app → its own spot or Display; Delete account → its own "Danger zone" |
| Misleading section name | Data & sync       | Only working control is "Clear Cache"                                                         | Rename to "Storage" once dead toggles are removed                             |

**Visibility problems:** Export/Import/Reset sit visually inside the nav rail with no header, looking like more nav items; their blob-only scope is invisible.

## Pass 3: Affordance Clarity

| Element                                | Looks Like             | Actually Is                                                               | Clear?                                                                  |
| -------------------------------------- | ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Privacy/Data toggles                   | Working switches       | No-ops with success feedback                                              | **No — worst kind: false affordance that confirms**                     |
| Theme "Preview" card                   | Live preview           | Static sample; doesn't reflect density/font choices                       | No                                                                      |
| Reduce Motion / High Contrast switches | —                      | No accessible label (`aria-label` empty on both `role="switch"` elements) | No (a11y)                                                               |
| Email field (Profile)                  | Editable-looking input | Read-only                                                                 | Borderline — style it read-only or add "contact support to change" hint |

## Pass 4: Cognitive Load

- **Privacy section**: 4 toggles + 3 presets + a score meter + 3 reassurance alerts — heavy apparatus for zero function. Removing it removes ~10 decisions.
- **Data & sync**: 4-way bandwidth radio + 3 toggles the user must reason about ("should I enable offline mode for show day?") with no actual consequence — anxiety-inducing at a dog show where offline matters.
- Working sections (Profile, Notifications, Security) are appropriately lean; Notifications has good progressive disclosure (voice options only when enabled).

**Cognitive load score:** High — driven almost entirely by dead surface area.

## Pass 5: State Coverage

| Component           | Empty                                       | Loading                | Success                                                                            | Error                                                                               |
| ------------------- | ------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Profile             | n/a                                         | No initial-fetch state | **Missing** — verified live: Save works, buttons clear, but no "Saved" flash/toast | **Missing** — save/upload failures not surfaced                                     |
| My dogs             | Good                                        | Good (spinner)         | n/a                                                                                | **Missing** — query error renders as "You don't have any dogs yet" (masks failures) |
| Preference sections | n/a                                         | Parent FormSkeleton    | Flash "Saved"                                                                      | Flash banner only                                                                   |
| Security            | n/a                                         | Good                   | Good (auto-clearing alert)                                                         | Good                                                                                |
| Delete account      | n/a                                         | Good                   | Good                                                                               | Good (retry path for the two-phase delete)                                          |
| Install app         | Good (installed / can't-install / iOS copy) | n/a                    | Good                                                                               | n/a                                                                                 |

**Dead ends found:** none. **Missing error handling:** Profile save/photo upload; DogsSection error-as-empty.

## Pass 6: Flow Integrity

**Primary flow tested:** sign in → /account → edit phone → save → revert; toggle High Contrast → reload; toggle Privacy switch → observe; navigate every section.

| Step | Action                       | Friction                                                          | Severity          |
| ---- | ---------------------------- | ----------------------------------------------------------------- | ----------------- |
| 1    | Open /account                | None — deep-linkable `?section=` works, nav state syncs both ways | None              |
| 2    | Edit profile field           | Save/Discard appear on dirty — good pattern                       | None              |
| 3    | Save                         | Works, but no confirmation → "did it work?"                       | Medium            |
| 4    | Change appearance            | Applies instantly, "Saved" flash                                  | None              |
| 5    | Reload                       | Density/motion/contrast silently revert while switches claim ON   | High              |
| 6    | Toggle privacy/data settings | "Saved" confirms a no-op                                          | Critical (trust)  |
| 7    | Delete account               | Type-DELETE confirm, double-submit guard, retry path              | None — well built |

**Recovery gaps:** none structural (Discard, Cancel, confirm-text all present).

**Flow verdict:** Completable with friction — the page _feels_ fine to use; the damage is invisible (settings that don't do anything).

---

## Summary

**Overall UX health:** Needs Work — solid skeleton (nav, deep links, profile, security, notifications, delete flow) undermined by two effectively fake sections and non-persistent appearance options.

### Critical

| Finding                                                                                                           | Pass | Impact                                                              | Effort       |
| ----------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------- | ------------ |
| Privacy section is entirely dead (4 toggles, 3 presets, score meter) yet confirms "Saved" and asserts protections | 1/3  | Trust/compliance risk: users believe they've opted out of analytics | Low (delete) |
| Data & sync toggles (bandwidth, preload, offline mode, background sync) are dead; copy promises offline behavior  | 1    | Exhibitors may rely on "Offline Mode" at a show                     | Low (delete) |

### High

| Finding                                                                              | Pass | Impact                                                                       | Effort                                                                   |
| ------------------------------------------------------------------------------------ | ---- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Layout Density / Reduce Motion / High Contrast lost on reload while switches show ON | 1/6  | Accessibility settings silently failing hits exactly the users who need them | Medium (boot hydration in ThemeProvider, mirroring the fontSize pattern) |
| DogsSection shows query errors as "no dogs"                                          | 5    | Alarming false empty state                                                   | Low                                                                      |

### Medium

| Finding                                                                       | Pass | Impact                                                 | Effort                     |
| ----------------------------------------------------------------------------- | ---- | ------------------------------------------------------ | -------------------------- |
| Profile save has no success/error feedback                                    | 5    | "Did it work?" uncertainty                             | Low (reuse flash)          |
| Export/Import/Reset only cover the blob, not Notifications/General/live theme | 1    | Partial backup masquerading as full                    | Medium (or relabel/remove) |
| "General" section holds a single toggle                                       | 2    | Nav noise                                              | Low                        |
| "My dogs" duplicates /dogs                                                    | 2    | Fragmented workflow (violates consolidation principle) | Low                        |
| Reset Theme doesn't reset live store/classes                                  | 1    | Confusing partial reset                                | Low–Medium                 |

### Low

- Unlabeled switches (Reduce Motion / High Contrast) — add `aria-label`s.
- Theme preview card is static; either make it react or drop it.
- Email field looks editable; style read-only.
- Unused sync plumbing in `useUserPreferences` (1s polling, `preferences-updated` listener with no emitter, mocked device APIs) — dead code to prune.

### Keep / Remove decisions (per the "is it needed?" question)

| Setting                                                                              | Verdict                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy section (all 4 toggles, presets, score)                                      | **Remove.** No analytics pipeline exists to gate. If/when analytics ship, add one honest opt-out toggle then.                                                                                                             |
| Bandwidth & Quality, Preload Images                                                  | **Remove.** No image-quality pipeline; speculative feature surface.                                                                                                                                                       |
| Enable Offline Mode / Background Sync                                                | **Remove.** Offline is the replication layer's job and is always-on by design; a user-facing off switch would be harmful. Replace section content with Clear Cache + a short "This app works offline automatically" note. |
| Layout Density / Reduce Motion / High Contrast                                       | **Keep and fix** (hydrate on boot). Accessibility-relevant.                                                                                                                                                               |
| General → Haptic Feedback                                                            | **Keep the toggle, kill the section** — move it.                                                                                                                                                                          |
| My dogs section                                                                      | **Remove**; link to /dogs.                                                                                                                                                                                                |
| Export/Import settings                                                               | **Questionable.** Once Privacy/Data are gone the blob holds only theme; consider removing both buttons and keeping only "Reset all".                                                                                      |
| Everything else (Profile, Appearance core, Notifications, Security, Install, Delete) | **Keep** — verified working.                                                                                                                                                                                              |

### Recommendations (ordered)

1. **Delete the dead surfaces** (Privacy section, 4 Data toggles, My dogs mirror, General section) — one PR, pure removal, immediately makes every remaining control trustworthy.
2. **Hydrate density/motion/contrast on boot** in ThemeProvider using the same localStorage-cache pattern fontSize uses; make Reset Theme clear those too.
3. **Feedback + error polish**: profile save flash, surface DogsSection/profile errors, aria-labels on the two switches.
