# Design — Account Page UX Remediation

## Context

`/account` (AccountPage.tsx + `components/preferences/*`) is a settings console with several inert or mock-backed controls, found in the 2026-07-10 exhibitor UX audit. Two theme systems coexist: the header toggle drives `ThemeContext` (which owns the `<html>` class trio `theme-light`/`theme-dark`/`dark` — see memory: trio must stay synced), while `ThemeSelector.handleModeChange` only persists a preference via `onUpdate({ mode })` and never touches the DOM or `ThemeContext`. `userPreferencesService.getDevices()` returns a hardcoded `Mock Device`. `DataSettings.tsx` exposes sync/cache strategy radios that map to nothing real; `PrivacySettings.tsx` exposes presence toggles for the presence feature deleted in #576. INTENT.md: exhibitor surfaces should feel trustworthy and effortless; silent-failing controls are the opposite.

None of the affected data is show-day replicated data — settings live in `user_preferences` and local stores, so there is no offline-first/replication impact.

## Goals / Non-Goals

**Goals:**

- One source of truth for theme; Appearance selection applies instantly and the header toggle reflects it.
- Zero placeholder or dead controls rendered on the Account page.
- Save feedback that is transient and does not shift layout.
- Accurate install-app messaging; hardened delete-account confirm; visible password validation.

**Non-Goals:**

- Email-change flow, push-permission rework, export/import settings, mobile redesign, new settings of any kind.
- Removing the underlying `user_preferences` columns (harmless to leave; UI-only removal keeps the change small and reversible).

## Decisions

1. **Theme: route ThemeSelector through ThemeContext** (`src/context/ThemeContext.tsx`), not a parallel apply path. Extend context/`themeClasses.ts` to accept `'system'` (resolve via `prefers-color-scheme` + listener) if it doesn't already; `handleModeChange` calls `setTheme(mode)` _and_ `onUpdate({ mode })`. Header toggle keeps working since it mutates the same context. Alternative rejected: having ThemeSelector manipulate `document.documentElement` directly — recreates the dual-source bug.
2. **Font size: fix, don't remove.** The handler already sets a root scale; audit shows no visible change, so the CSS variable is unconsumed. Wire `html { font-size: calc(16px * var(--font-scale, 1)) }` (rem-based cascade) and apply the saved value on app boot alongside theme. Rejected: removal — the elderly-audience accessibility promise is worth keeping and the fix is small. If implementation reveals rem usage is too inconsistent for a clean result, fall back to removing the control (decision gate in tasks).
3. **Deletions are file-level where possible**: remove `DeviceManager.tsx`, the Devices nav item/section, sync-mode + cache-strategy blocks in `DataSettings.tsx` (keep any real storage-usage display if present), presence/online-status rows in `PrivacySettings.tsx`, and the mock device methods in `userPreferencesService.ts`. Grep docs (`--include="*.md"`) before deletion per repo lesson; update `components/preferences/index.ts` and tests.
4. **Toast**: use the existing toast primitive's duration option (find the profile-save `toast(...)` call; set ~4s auto-dismiss). If the primitive defaults to persistent, fix the default at the callsite only — no global toast rework.
5. **Saved banner**: render the Appearance "Saved" confirmation as absolutely-positioned/overlay (or move into the section card header) so the settings nav never reflows. Rejected: reserving fixed space — wastes space for a rare state.
6. **Install app**: branch on the three real states — `beforeinstallprompt` captured (show install button), `display-mode: standalone` / `navigator.standalone` (show "already installed"), neither (show honest copy: "installation isn't available in this browser session" without recommending the browser the user is already in).
7. **Delete account**: add a type-to-confirm input ("DELETE") gating the destructive button inside the existing inline confirm in `AccountPage.sections.tsx` (`DeleteSection`). Keep server-side owns-dogs guard behavior; surface its error code if the RPC rejects.
8. **Password form**: client-side checks (min 8, match, non-empty) with inline field errors before calling the update; reuse existing form error styling from `SecuritySettings.tsx` patterns.

## Risks / Trade-offs

- [System theme resolution regressions across the class trio] → reuse/extend `themeClasses.ts` helpers and its existing tests; add a test asserting trio sync for each mode including `system` flips.
- [Global font-size rem cascade may distort tuned layouts] → apply behind the setting only (default 1.0 = pixel-identical); visual spot-check at 1.2x; fall back to removing the control if unacceptable (Decision 2 gate).
- [Deleting components breaks imports/tests] → `pnpm typecheck` (clear stale tsbuildinfo) + full vitest run; grep for component names in markdown docs too.
- [Type-to-confirm adds friction to delete] → intentional for an irreversible action; acceptable per audit severity.

## Open Questions

- None blocking. If `user_preferences` rows for removed controls are read elsewhere, leave the service read path intact and only strip the UI.
