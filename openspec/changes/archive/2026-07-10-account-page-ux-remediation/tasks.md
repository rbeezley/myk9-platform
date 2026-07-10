# Tasks — Account Page UX Remediation

## 1. Theme mode apply-on-save

- [x] 1.1 Extend `src/context/ThemeContext.tsx` + `themeClasses.ts` to support `'system'` (resolve via `prefers-color-scheme`, listen for changes); keep the `<html>` class trio (`theme-light`/`theme-dark`/`dark`) synced for all three modes
- [x] 1.2 Wire `ThemeSelector.handleModeChange` to call the ThemeContext setter in addition to `onUpdate({ mode })`; header toggle and selector must share this single state
- [x] 1.3 Apply persisted theme mode on app boot (reload keeps chosen mode)
- [x] 1.4 Unit tests: trio sync for light/dark/system transitions; selector→context wiring; boot-time application (extend `themeClasses.test.ts`)

## 2. Font size wiring (with removal fallback)

- [x] 2.1 Consume the root font-scale variable (`html { font-size: calc(16px * var(--font-scale, 1)) }` or equivalent) and apply the saved scale on boot
- [x] 2.2 Visual spot-check at 1.2x — done in 7.3 live verify (html 19.2px, layout intact). Decision 2 gate outcome: KEEP the control; rem cascade sound. Amended post-review: Small (0.9x) removed and scale clamped ≥1 to preserve the tailwind 14px text-xs floor.
- [x] 2.3 Unit tests for scale application + boot hydration (or control-removal tests if the fallback fires)

## 3. Delete mock and dead controls

- [x] 3.1 Grep first (`rg -l`, plus `--include="*.md"` docs sweep) for `DeviceManager`, sync/cache strategy strings, presence toggle names — only code refs were AccountPage/PreferencesDialog/index/tests; docs hits are archives + this change's artifacts
- [x] 3.2 Remove Devices nav item + section and `DeviceManager.tsx`; strip mock `getDevices`/`registerDevice`/`removeDevice` from `userPreferencesService.ts`. Also deleted dead `PreferencesDialog.tsx` and preferences-local `SyncStatusIndicator.tsx` (only consumers were each other)
- [x] 3.3 Remove Synchronization Mode + Cache Settings selectors from `DataSettings.tsx` (keep any real storage-usage display); Data & sync section retained — Clear Cache / Bandwidth / Offline toggles are real
- [x] 3.4 Remove Share Presence / Online Status toggles from `PrivacySettings.tsx` (presence feature deleted in #576) — incl. quick-preset keys and Social & Visibility category
- [x] 3.5 Update `components/preferences/index.ts`, `AccountPage` nav config, and delete/adjust affected tests (`DeviceManager`, `DataSettings`, `PrivacySettings` tests)

## 4. Feedback polish

- [x] 4.1 Profile save toast: auto-dismiss (~4s) at the callsite in the profile save path
- [x] 4.2 Appearance "Saved" banner: render as overlay/absolute (or in-card) so section nav never reflows; verify no layout shift (fixed overlay, auto-clears 3s/5s; opacity spot-check in 7.3)
- [x] 4.3 Tests: toast called with duration; banner container does not alter nav geometry (snapshot or style assertion)

## 5. Install app detection

- [x] 5.1 Branch `InstallAppSettings.tsx` on: captured `beforeinstallprompt` → install button; standalone display-mode → "already installed"; otherwise honest "not currently available" copy — branching via usePWAInstall was already sound; only the dishonest third-branch copy needed rewriting
- [x] 5.2 Unit tests for all three states (mock the event/media query)

## 6. Destructive-action hardening

- [x] 6.1 `DeleteSection` (AccountPage.sections.tsx): add type-to-confirm input ("DELETE") gating the destructive button; keep two-step inline pattern
- [x] 6.2 Surface server rejection reason (e.g., owns-live-dogs trigger error code) in the failure state. Discovery: old button only called signOut() (fake delete); now calls deleteUser. Self-service delete RPC gap flagged as follow-up task (soft_delete_person requires admin/show-manager).
- [x] 6.3 Password form: inline validation (empty / <8 chars / mismatch) before network call in `SecuritySettings.tsx`
- [x] 6.4 Unit tests: gate disabled until exact text; validation messages; no request on invalid submit (assertion-first for the update call)

## 7. Verification & ship

- [x] 7.1 `pnpm typecheck` (fresh non-incremental tsc clean) and `pnpm lint` (one set-state-in-effect error found and fixed by deriving resolved theme during render)
- [x] 7.2 `cd apps/myk9show && pnpm test` — full unit suite green (1297 files, 11,768 tests passed)
- [x] 7.3 Live verify on worktree dev server (served code confirmed via Vite module fetch): theme boot verified for light/dark/system incl. trio classes + colorScheme; font scale 1.2 → html 19.2px, layout intact. Authed /account visuals (Appearance selector, toast, delete gate) covered by unit tests; final visual pass on staging after merge — localhost sign-in not performed (credential-entry restriction)
- [x] 7.4 PR #1256 → CI green (one flaky AskQPanel shard rerun) → codex review (1 P1 acknowledged/spun off as self-service delete RPC task, 3 P2s fixed in d5cc9e340) → merged 2026-07-10
- [x] 7.5 Updated docs/ux-audits/account-page-exhibitor-2026-07-10.md findings with fixed/deferred status; OPEN-TODOS.md not applicable (no open items added)
