# Comprehensive Settings Page — Design Spec

**Date:** 2026-03-27
**Status:** Draft
**Scope:** Reorganize PreferencesPage into grouped sidebar, add 3 new sections, fix 1 placeholder

## Problem

myK9Show's PreferencesPage has 7 flat tabs with no grouping. As settings grow, this doesn't scale. Additionally, several myK9Q settings features are missing: scoring voice configuration (judges/stewards), PWA install section, and a haptic feedback toggle. The "Clear Cache" button in Data & Sync is a non-functional placeholder.

## Decisions Made During Brainstorming

- **Developer tools:** Skipped — myK9Q's dev tools are ~90% dead code; myK9Show has superior debug infrastructure via env vars + `window.__replicationDiag`
- **Onboarding replay:** Skipped — no general welcome tour exists to replay (exhibitor/club-specific onboarding is separate)
- **Voice + Scoring:** Combined into a single "Scoring" section (voice config only matters in scoring context)
- **Tab organization:** Grouped by function into 4 sidebar categories
- **Role visibility:** Scoring section visible to judges, secretaries, stewards, and site_admins only

## Scope

### New sections (3)

1. **Scoring** — voice announcements toggle + voice selection/speed/test button
2. **Install App** — PWA install status, browser-specific instructions, benefits list
3. **General** — haptic feedback toggle

### Fix (1)

4. **Wire up "Clear Cache" button** in DataSettings — currently renders but does nothing

### Structural change (1)

5. **Reorganize sidebar** from flat tab list to 4 grouped categories

## Architecture

### Sidebar Groups

The flat `tabs` array in PreferencesPage becomes a grouped structure:

```
Appearance
  ├── Theme & Display     (existing ThemeSelector)
  └── General             (NEW — haptic feedback)

Alerts & Sound
  ├── Notifications       (existing NotificationSettings)
  └── Scoring ★           (NEW — voice announcements + voice config; role-gated)

Events
  └── Competition         (existing CompetitionSettings)

Account & Data
  ├── Privacy             (existing PrivacySettings)
  ├── Security            (existing SecuritySettings)
  ├── Data & Sync         (existing DataSettings — with cache clear fix)
  ├── Devices             (existing DeviceManager)
  └── Install App         (NEW — PWA install)
```

★ = Only visible to users with roles: `JUDGE`, `SECRETARY`, `STEWARD`, or `SITE_ADMIN`

### Data Model

No new database tables or columns. All new settings use existing infrastructure:

| Setting              | Store                                  | Key                  | Default                |
| -------------------- | -------------------------------------- | -------------------- | ---------------------- |
| `hapticFeedback`     | `settingsStore` (Zustand/localStorage) | `hapticFeedback`     | `true`                 |
| `voiceAnnouncements` | `settingsStore`                        | `voiceAnnouncements` | `false`                |
| `voiceName`          | `settingsStore`                        | `voiceName`          | `''` (browser default) |
| `voiceRate`          | `settingsStore`                        | `voiceRate`          | `1.0`                  |

All four fields already exist in `settingsStore.ts` (`AppSettings` interface). No schema changes needed.

### New Components

#### 1. `GeneralSettings.tsx`

**Location:** `apps/myk9show/src/components/preferences/GeneralSettings.tsx`

**Content:**

- **Haptic Feedback** — toggle, reads/writes `settingsStore.hapticFeedback`
  - Description: "Vibrate on touch interactions (mobile)"
  - Uses existing `useHapticFeedback` hook from `@myk9/scoring-ui` for test vibration on enable

Single setting for now. This section is the natural home for future general preferences (pull-to-refresh, etc.) without creating yet another tab.

#### 2. `ScoringSettings.tsx`

**Location:** `apps/myk9show/src/components/preferences/ScoringSettings.tsx`

**Content:**

- **Voice Announcements** — toggle, reads/writes `settingsStore.voiceAnnouncements`
  - Description: "Announce 30-second warning aloud during scoring"
- **Voice Configuration** subsection (divider + "VOICE CONFIGURATION" label):
  - **Voice** — `<select>` dropdown populated from `window.speechSynthesis.getVoices()`, filtered to English voices. Reads/writes `settingsStore.voiceName`
  - **Speed** — slider (range 0.5–2.0, step 0.1), reads/writes `settingsStore.voiceRate`. Labels: "0.5x" / "2x"
  - **Test Voice** — button that speaks "This is a test of your selected voice." using the selected voice + speed via Web Speech API

**Role gating:** The entire section is hidden unless the user has one of: `JUDGE`, `SECRETARY`, `STEWARD`, `SITE_ADMIN`. Check via `useAuth().hasRole()`.

#### 3. `InstallAppSettings.tsx`

**Location:** `apps/myk9show/src/components/preferences/InstallAppSettings.tsx`

**Content:**

- **Install status banner** — shows whether app is installed (standalone mode), previously dismissed, or not installed
- **Benefits list** — push notifications, offline access, faster loading, full-screen experience
- **Install button** — triggers `beforeinstallprompt` (Chrome/Edge) or shows browser-specific manual instructions (Safari iOS, Firefox, etc.)
- **Browser-specific instructions** — conditional display based on user agent

Reuses the existing `usePWAInstall` hook (`apps/myk9show/src/hooks/usePWAInstall.ts`) which already handles:

- `beforeinstallprompt` event capture
- Standalone mode detection
- iOS Safari detection
- 7-day dismiss persistence

The hook is currently mounted in the `PWAInstallBanner` component in `App.tsx`. The settings section provides a permanent, discoverable location for the same functionality (the banner auto-dismisses after 7 days).

### Sidebar Refactor

#### Type Changes

```typescript
// New group + section types
interface SettingsGroup {
  id: string;
  label: string;
  sections: SettingsSection[];
}

interface SettingsSection {
  id: string; // used as TabValue
  label: string;
  icon: LucideIcon;
  description: string;
  roleRequired?: UserRole[]; // if set, section hidden unless user has one of these roles
}
```

#### Desktop Layout

The existing layout structure stays the same (260px sidebar + flex content). The sidebar `<nav>` changes from a flat list of buttons to grouped sections with uppercase category labels and indented section buttons. The active section gets `bg-primary/10 text-primary` styling (same as current).

#### Mobile Layout

Replace the current collapsible dropdown with a two-level nav:

1. **Group tabs** — horizontal scrollable pill bar at top (Appearance | Alerts | Events | Account)
2. **Section chips** — horizontal row of chips below, showing sections in the active group

This prevents a long dropdown on mobile while keeping all sections accessible.

### Cache Clear Fix

In `DataSettings.tsx`, the "Clear Cache" button needs to be wired to actual functionality:

1. Clear React Query cache (`queryClient.clear()`)
2. Clear localStorage entries for app caches (preserve auth + settings)
3. Clear IndexedDB replication databases
4. Show confirmation dialog before clearing
5. Reload page after clear completes

Reference myK9Q's `dataExportService.clearAllData()` for the implementation pattern, but adapt for myK9Show's storage layout:

- Preserve: `myK9Q_settings` (Zustand settings), auth session
- Clear: React Query cache, `myk9-notification-preferences`, replication IndexedDB, any `scroll_*` keys

## Testing

Each new component gets a unit test file:

- `GeneralSettings.test.tsx` — toggle renders, reads/writes store, haptic test fires on enable
- `ScoringSettings.test.tsx` — toggle renders, voice dropdown populates from mock speechSynthesis, speed slider updates, test button speaks, role gating hides section for exhibitors
- `InstallAppSettings.test.tsx` — status banner states (installed/not installed/dismissed), install button triggers prompt, browser-specific instructions render
- `PreferencesPage.test.tsx` — update existing tests: grouped sidebar renders, sections navigate correctly, scoring hidden for exhibitor role, mobile group tabs render
- `DataSettings.test.tsx` — update: cache clear shows confirmation, clears stores, reloads

## Files Changed

### New files

- `apps/myk9show/src/components/preferences/GeneralSettings.tsx`
- `apps/myk9show/src/components/preferences/ScoringSettings.tsx`
- `apps/myk9show/src/components/preferences/InstallAppSettings.tsx`
- `apps/myk9show/src/components/preferences/__tests__/GeneralSettings.test.tsx`
- `apps/myk9show/src/components/preferences/__tests__/ScoringSettings.test.tsx`
- `apps/myk9show/src/components/preferences/__tests__/InstallAppSettings.test.tsx`

### Modified files

- `apps/myk9show/src/pages/PreferencesPage.tsx` — grouped sidebar, new tab values, mobile two-level nav, import new components
- `apps/myk9show/src/components/preferences/DataSettings.tsx` — wire cache clear button
- `apps/myk9show/src/components/preferences/__tests__/PreferencesPage.test.tsx` — update for grouped layout
- `apps/myk9show/src/components/preferences/__tests__/DataSettings.test.tsx` — add cache clear tests

### Unchanged

- `apps/myk9show/src/stores/settingsStore.ts` — all needed fields already exist
- `apps/myk9show/src/types/user-preferences.ts` — no new preference types needed
- `apps/myk9show/src/hooks/usePWAInstall.ts` — reused as-is
- `packages/scoring-ui/src/hooks/useHapticFeedback.ts` — reused as-is

## Out of Scope

- Search/filter across settings (myK9Q has this; could add later but not needed at current scale)
- Import/export settings (already exists in sidebar actions — no changes)
- General onboarding tour / replay (no tour exists to replay)
- Developer tools (dead code in myK9Q; myK9Show has better debug infra)
- New database migrations or Supabase changes
