# Tasks — Account Page UX Remediation

## 1. Theme mode apply-on-save

- [x] 1.1 Extend `src/context/ThemeContext.tsx` + `themeClasses.ts` to support `'system'` (resolve via `prefers-color-scheme`, listen for changes); keep the `<html>` class trio (`theme-light`/`theme-dark`/`dark`) synced for all three modes
- [x] 1.2 Wire `ThemeSelector.handleModeChange` to call the ThemeContext setter in addition to `onUpdate({ mode })`; header toggle and selector must share this single state
- [x] 1.3 Apply persisted theme mode on app boot (reload keeps chosen mode)
- [x] 1.4 Unit tests: trio sync for light/dark/system transitions; selector→context wiring; boot-time application (extend `themeClasses.test.ts`)

## 2. Font size wiring (with removal fallback)

- [x] 2.1 Consume the root font-scale variable (`html { font-size: calc(16px * var(--font-scale, 1)) }` or equivalent) and apply the saved scale on boot
- [ ] 2.2 Visual spot-check at 1.2x across Account, My Shows, dog detail; if rem cascade is unacceptable, remove the Font Size control instead (design Decision 2 gate — record outcome here). Implementer confirmed Tailwind utilities are rem-based (cascade sound); visual check deferred to task 7.3 live verify.
- [x] 2.3 Unit tests for scale application + boot hydration (or control-removal tests if the fallback fires)

## 3. Delete mock and dead controls

- [ ] 3.1 Grep first (`rg -l`, plus `--include="*.md"` docs sweep) for `DeviceManager`, sync/cache strategy strings, presence toggle names
- [ ] 3.2 Remove Devices nav item + section and `DeviceManager.tsx`; strip mock `getDevices`/`registerDevice`/`removeDevice` from `userPreferencesService.ts`
- [ ] 3.3 Remove Synchronization Mode + Cache Settings selectors from `DataSettings.tsx` (keep any real storage-usage display); remove the Data & sync section entirely if nothing real remains
- [ ] 3.4 Remove Share Presence / Online Status toggles from `PrivacySettings.tsx` (presence feature deleted in #576)
- [ ] 3.5 Update `components/preferences/index.ts`, `AccountPage` nav config, and delete/adjust affected tests (`DeviceManager`, `DataSettings`, `PrivacySettings` tests)

## 4. Feedback polish

- [ ] 4.1 Profile save toast: auto-dismiss (~4s) at the callsite in the profile save path
- [ ] 4.2 Appearance "Saved" banner: render as overlay/absolute (or in-card) so section nav never reflows; verify no layout shift
- [ ] 4.3 Tests: toast called with duration; banner container does not alter nav geometry (snapshot or style assertion)

## 5. Install app detection

- [ ] 5.1 Branch `InstallAppSettings.tsx` on: captured `beforeinstallprompt` → install button; standalone display-mode → "already installed"; otherwise honest "not currently available" copy (never "try Chrome" when in Chrome)
- [ ] 5.2 Unit tests for all three states (mock the event/media query)

## 6. Destructive-action hardening

- [ ] 6.1 `DeleteSection` (AccountPage.sections.tsx): add type-to-confirm input ("DELETE") gating the destructive button; keep two-step inline pattern
- [ ] 6.2 Surface server rejection reason (e.g., owns-live-dogs trigger error code) in the failure state
- [ ] 6.3 Password form: inline validation (empty / <8 chars / mismatch) before network call in `SecuritySettings.tsx`
- [ ] 6.4 Unit tests: gate disabled until exact text; validation messages; no request on invalid submit (assertion-first for the update call)

## 7. Verification & ship

- [ ] 7.1 `pnpm typecheck` (clear stale `app.tsbuildinfo` first) and `pnpm lint`
- [ ] 7.2 `cd apps/myk9show && pnpm test` — full unit suite green
- [ ] 7.3 Live verify on dev server as exhibitor: theme applies from Appearance, no dead sections, toast dismisses, install copy accurate, delete gated
- [ ] 7.4 PR → CI green → review (user-visible behavior change: run `/codex:review` per repo default) → merge
- [ ] 7.5 Update docs/ux-audits/account-page-exhibitor-2026-07-10.md findings table with fixed/deferred status; sync OPEN-TODOS.md if applicable
