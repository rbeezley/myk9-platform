# Account Page UX Remediation

## Why

A live UX audit of `/account` as an exhibitor (docs/ux-audits/account-page-exhibitor-2026-07-10.md) found the settings surface advertises capabilities it does not deliver: theme mode saves but never applies, the Devices tab shows a hardcoded "Mock Device", font size selection has no effect, and Data & sync / presence toggles control behavior that is automatic or was deleted (#576). Silent-failing and placeholder controls erode trust with the retired, low-tech exhibitor audience and directly conflict with fall 2026 launch readiness — Account is one of the first pages every new user visits. This is a consolidation change: it deletes dead surface area and fixes the few controls that should work.

## What Changes

- **Fix theme-mode apply-on-save**: selecting Light/Dark/System in Appearance applies the theme trio immediately (same code path as the header toggle) and the two controls stay in sync — single source of truth.
- **Fix font-size setting**: either wire the root scale variable so text visibly changes, or remove the control (decide in design; audit showed it inert).
- **Delete mock/dead controls** (**BREAKING** for the settings UI surface, all removals):
  - Devices tab (backed by hardcoded `Mock Device` in `userPreferencesService.getDevices`)
  - Data & sync "Synchronization Mode" and "Cache Settings" strategy radios (replication is automatic and per-show by architecture)
  - Privacy "Share Presence" / "Online Status" toggles (presence feature deleted in #576)
- **Toast auto-dismiss**: profile "updated successfully" toast dismisses after a timeout instead of persisting across navigations indefinitely.
- **"Saved" banner no longer shifts layout**: render as overlay/fixed element so section nav doesn't move mid-click.
- **Install app detection**: on desktop Chrome without a captured `beforeinstallprompt` (or when already installed), show an accurate message instead of "your browser doesn't support app installation, try Chrome".
- **Delete-account confirm hardening**: require typed confirmation (e.g. type "DELETE") before the irreversible call; keep the existing two-step inline pattern.
- **Password form feedback**: visible inline validation on empty/short/mismatched submit.

## Capabilities

### New Capabilities

- `account-settings-integrity`: Every control on the Account page observably does what it claims — theme/font settings apply on selection, no placeholder or dead controls are rendered, save feedback is transient and non-layout-shifting, and destructive account actions require explicit typed confirmation.

### Modified Capabilities

<!-- none — no existing spec covers the account settings surface -->

## Impact

- **Code**: `apps/myk9show/src/components/preferences/` (ThemeSelector, DataSettings, Devices/Install sections, privacy settings component), `apps/myk9show/src/services/preferences/userPreferencesService.ts` (remove mock device APIs), Account page section nav, toast usage in profile save path.
- **Duplication check**: no new surfaces — this change only removes surface area and repairs existing controls; the theme fix consolidates two competing theme controls onto one store.
- **Non-goals**: no new settings, no email-change flow work, no push-notification permission rework, no mobile-specific redesign, no export/import changes. Anything not listed above stays as-is.
- **Launch readiness**: removes placeholder data ("Mock Device") and silent failures from a first-session page; shrinks the pre-launch audit surface.
