# UX Audit: Account Page (Exhibitor)

**Date:** 2026-07-10
**Auditor:** Claude (UX-Audit skill, live walk in Chrome)
**Sources:** Live https://myk9show.com/account as `e2e-exhibitor@test.myk9.com` (desktop 1211px, dark mode) + source cross-check (`apps/myk9show/src/components/preferences/`, `apps/myk9show/src/services/preferences/userPreferencesService.ts`)

## Pass 1: Mental Model Alignment

**What UI suggests:** A power-user settings console — sync strategies, cache strategies, device management, settings import/export.

**What it actually does:** Profile + password + a handful of preferences. Several advertised capabilities are mock or inert.

**Misalignment gaps:**
| UI Element | User Expects | Actually Does | Severity |
|---|---|---|---|
| Theme Mode (Appearance) | Picking Light switches the app to light | Saves the preference, UI stays dark (even after reload) | High |
| Font Size Large/XL | Text gets bigger | Selection saves, text unchanged | High |
| Devices tab | List of my signed-in devices | Hardcoded "Mock Device" (`userPreferencesService.ts:397`) | High |
| Sync/Cache strategy radios (Data & sync) | Changes how the app syncs/caches | No observable effect; replication is per-show and automatic by architecture | Med |
| Install app | Installs the PWA | In desktop Chrome shows "Your browser doesn't support app installation. Try opening myK9Show in Chrome…" | Med |

**Jargon found:** "Aggressive caching", "Balanced caching", "Sync strategy", "Offline first", "medium impact / low impact" badges — implementation vocabulary aimed at a largely retired, low-tech exhibitor audience.

## Pass 2: Information Architecture

**Current structure:** Your account (Profile, My dogs) · Display (Appearance, General) · Notifications · Privacy & Security · Advanced (Data & sync, Devices, Install app, Delete account) · footer actions (Export/Import/Reset settings).

**IA issues:**
| Issue | Location | Problem | Recommendation |
|---|---|---|---|
| Two theme controls, two sources of truth | Header moon toggle vs Appearance card | Header toggle applies instantly; Appearance card saves but doesn't apply — they disagree | Make Appearance the single owner; header toggle writes the same store |
| Single-toggle tab | General | Whole tab holds one mobile-only haptics toggle | Fold into Appearance or Notifications; delete tab |
| Duplicated surface | My dogs tab vs `/dogs` page | Read-only list re-implements sidebar "My Dogs" (consolidation-phase smell); View links do go to `/dogs/:id`, which is right | Keep as pure links or drop the tab for a deep-link |
| Privacy toggles for deleted feature | Privacy → Share Presence / Online Status | Presence/collaboration cluster was deleted (#576); toggles likely control nothing | Remove toggles until presence exists |
| Settings-transport actions orphaned | Export/Import/Reset at nav footer | Floating below Delete account with no section header; Reset adjacent to Delete is a risky neighborhood | Group under "Advanced", move Delete last and visually separated |

## Pass 3: Affordance Clarity

| Element | Looks Like | Actually Is | Clear? |
|---|---|---|---|
| Theme mode cards | Working selector (check moves) | Selection persists but does nothing | No — silent failure |
| "Current" badges (density/font) | Applied state | Saved-but-possibly-inert state | No |
| Email field (Profile) | Editable like name fields | Auth-critical field; unclear if change triggers re-confirmation | Partially |
| Push notifications toggle | Instant on/off | Flipped on with no browser-permission prompt or feedback | No |

**False affordances:** Theme Light/Dark cards, Font Size, Sync/Cache strategy radios — all accept input without effect.
**Hidden affordances:** none found.

## Pass 4: Cognitive Load

- Data & sync asks exhibitors to choose sync and cache strategies they cannot reasonably evaluate; the correct value is architectural (automatic, per-show replication). Recommendation: delete the section.
- Impact badges ("medium impact") on Privacy add a decision dimension without explaining consequences.
- Profile smart defaults are fine; Save/Discard appearing only when dirty is good.

**Cognitive load score:** Medium — driven almost entirely by Advanced sections exposing internals.

## Pass 5: State Coverage

### Profile
| State | Implemented? | Quality | Issue |
|---|---|---|---|
| Success | Yes | Poor | Toast "Profile updated successfully" **never auto-dismisses** — persisted across navigations for the whole session until manually closed |
| Error | Untested | — | |

### Appearance
| State | Implemented? | Quality | Issue |
|---|---|---|---|
| Success | Yes | Poor | "Saved" banner inserts above the nav and **shifts the whole layout down**, causing misclicks on the section nav (reproduced twice) |

### Security (password)
| State | Implemented? | Quality | Issue |
|---|---|---|---|
| Error | Weak | Poor | Submitting empty form gives no visible inline feedback |
| Design | — | — | No current-password / re-auth step before change (session-only auth) |

**Dead ends found:** Install app on desktop Chrome tells the user to use Chrome.

## Pass 6: Flow Integrity

**Primary flow tested:** Edit profile → save; change theme; toggle notifications; walk every section; open Delete account.

| Step | Action | Friction | Severity |
|---|---|---|---|
| 1 | Edit first name, Save | None — Save/Discard pattern works, persists | None |
| 2 | Pick Light theme | Saves, never applies (reload included) | High |
| 3 | Section nav after save | "Saved" banner shifts nav; clicked wrong section | Med |
| 4 | Delete account | Two-step inline confirm present ("Are you sure?") — good; but for a permanent, irreversible action there's no type-to-confirm or password gate | Med |

**Recovery gaps:** Reset all settings — confirmation behavior untested; sits one row from Delete account.
**Flow verdict:** Completable with friction; Appearance flow effectively **broken**.

---

## Summary

**Overall UX health:** Needs Work — core Profile flow is solid, but the settings surface advertises far more than it delivers, and the dead controls silently fail.

### Critical
| Finding | Pass | Impact | Effort |
|---|---|---|---|
| Theme Mode saves but never applies (`ThemeSelector.handleModeChange` only calls `onUpdate({mode})`, never touches DOM/settings store — accent color handler does both) | 1/3 | Users think theme is broken; conflicts with header toggle | Low |

### High Priority
| Finding | Pass | Impact | Effort |
|---|---|---|---|
| Devices tab shows hardcoded "Mock Device" (`userPreferencesService.getDevices`) | 1 | Placeholder data in production; erodes trust | Low (delete tab) |
| Font Size selection has no visible effect | 1 | Accessibility promise unkept for elderly audience | Med |
| Success toast never auto-dismisses | 5 | Stale "updated successfully" shown indefinitely, across pages | Low |
| Sync/Cache strategy + Privacy presence toggles control removed/automatic behavior | 2/4 | Dead controls; consolidation-phase debt | Low (delete) |

### Medium Priority
| Finding | Pass | Impact | Effort |
|---|---|---|---|
| "Saved" banner layout shift causes nav misclicks | 5 | Wrong-section navigation | Low (overlay, don't push) |
| Install app misdetects desktop Chrome, tells user to use Chrome | 5 | Confusing dead end | Med |
| Delete account: no type-to-confirm/password gate | 6 | One misclick pair from irreversible action | Low |
| Password form: no visible empty-submit validation; no re-auth | 5 | Confusion + weak security posture | Low |
| Push toggle flips on with no permission prompt/feedback | 3 | User can't tell if push actually works | Med |

### Low Priority
- General tab = one haptics toggle; fold elsewhere.
- "medium impact / low impact" badges unexplained.
- Two nav items can appear active simultaneously after save-banner render.

### Quick Wins
- Wire `handleModeChange` to apply the theme trio (same path as header toggle) — one function.
- Delete Devices tab (mock), Data & sync strategies, and presence toggles — pure removals aligned with consolidate-don't-duplicate.
- Add auto-dismiss timeout to the success toast.

### Recommendations
1. Fix theme apply-on-save and make the Appearance card the single theme source of truth.
2. Run a "dead-control purge": every Advanced/Privacy control that doesn't observably change behavior gets deleted, not documented.
3. Re-test Font Size end-to-end (CSS var is set on `:root` but nothing consumes it visibly).

**Not tested** (out of session scope): Export/Import settings (file download/upload), actual email-change flow, mobile viewport, photo upload.
