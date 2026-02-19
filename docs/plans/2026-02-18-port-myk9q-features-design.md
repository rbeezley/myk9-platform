# Port myK9Q-React Features to Monorepo

**Date:** 2026-02-18
**Approach:** Semantic port — read standalone changes, apply to monorepo's refactored structure

## Scope

Port 3 features from standalone myK9Q-React (20 recent commits) into `apps/myk9q`.
MaxTimeDialog fix already exists in monorepo — skipped.

## Feature 1: Show Flyer

Printable 2-page handout with QR deep-link for exhibitors at dog shows.

### New Files

- `src/components/reports/ShowFlyer.tsx` — 2-page print layout (QR + passcode + getting started guide)

### Modified Files

- `src/services/reportService.ts` — Add `generateShowFlyer()` + ShowFlyer print CSS
- `src/pages/TrialSecretary/TrialSecretary.tsx` — "Print Show Flyer" button + handler

### New Dependency

- `qrcode.react` — QR code SVG generation

### Data Flow

```
TrialSecretary → handlePrintFlyer()
  → generatePasscodesFromLicenseKey(licenseKey)
  → replicatedShowsTable.getShowById(showId)
  → generateShowFlyer(showName, passcode, loginUrl, options)
    → renders ShowFlyer component to static HTML
    → opens print window
```

## Feature 2: Print Enhancements (Sort Order + A/B Sections)

Sort dialog before printing. Scoresheets show A/B section badges.

### New Files

- `src/components/dialogs/ScoresheetPrintDialog.tsx` — Modal: pick sort order before print

### New Types

```typescript
type ReportSortOrder = 'run-order' | 'armband' | 'placement';
type PrintSortOrder = 'run-order' | 'armband' | 'placement';
```

### Modified Files — Report Components

| File                   | Change                                     |
| ---------------------- | ------------------------------------------ |
| `reportUtils.ts`       | Add `sortByArmband()`                      |
| `CheckInSheet.tsx`     | Add `sortOrder` prop, conditional sort     |
| `ScoresheetReport.tsx` | Add `sortOrder` + `showSectionBadge` props |
| `ResultsSheet.tsx`     | Add `sortOrder` prop, conditional sort     |

### Modified Files — Service + Integration

| File                     | Change                                             |
| ------------------------ | -------------------------------------------------- |
| `reportService.ts`       | Add `options` param to all `generate*()` functions |
| `usePrintReports.ts`     | Pass sort order options through                    |
| ClassList print trigger  | Show ScoresheetPrintDialog before generating       |
| EntryList print triggers | Show ScoresheetPrintDialog before generating       |

### Print Dialog Flow

```
User clicks print → ScoresheetPrintDialog opens
  → User picks sort order
  → generate*(classInfo, entries, { sortOrder })
  → Report component renders with sorted entries
```

## Feature 3: PWA Update UX

Better visual feedback when checking for and applying updates.

### Modified Files

| File              | Change                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `AboutDialog.tsx` | Add `updating` state, improve `applyUpdate()` with SKIP_WAITING + controllerchange + fallback reload, enhance `checkForUpdates()` |
| `UpdateToast.tsx` | Add `isUpdating` prop, "Updating... reloading shortly" state                                                                      |
| `main.tsx`        | Add `applySwUpdate()` so toast Update button provides feedback                                                                    |

### Update Flow (improved)

```
AboutDialog "Check for Updates" → checkForUpdates()
  → checks for waiting SW
  → listens for updatefound + installing statechange
  → shows "Up to Date" or "Tap to Update"

"Tap to Update" → applyUpdate()
  → set state to "updating" (visual feedback)
  → post SKIP_WAITING to waiting SW
  → listen for controllerchange → reload
  → fallback reload after 3s

UpdateToast "Update Now" → applySwUpdate()
  → re-render toast with isUpdating=true
  → show "Updating... reloading shortly"
  → same SKIP_WAITING + reload flow
```

## Files Summary

| Action | File                                               | Feature |
| ------ | -------------------------------------------------- | ------- |
| CREATE | `src/components/reports/ShowFlyer.tsx`             | 1       |
| CREATE | `src/components/dialogs/ScoresheetPrintDialog.tsx` | 2       |
| MODIFY | `src/services/reportService.ts`                    | 1, 2    |
| MODIFY | `src/components/reports/reportUtils.ts`            | 2       |
| MODIFY | `src/components/reports/CheckInSheet.tsx`          | 2       |
| MODIFY | `src/components/reports/ScoresheetReport.tsx`      | 2       |
| MODIFY | `src/components/reports/ResultsSheet.tsx`          | 2       |
| MODIFY | `src/pages/ClassList/hooks/usePrintReports.ts`     | 2       |
| MODIFY | ClassList print triggers                           | 2       |
| MODIFY | EntryList print triggers                           | 2       |
| MODIFY | `src/pages/TrialSecretary/TrialSecretary.tsx`      | 1       |
| MODIFY | `src/components/dialogs/AboutDialog.tsx`           | 3       |
| MODIFY | `src/components/ui/UpdateToast.tsx`                | 3       |
| MODIFY | `src/main.tsx`                                     | 3       |
| MODIFY | `apps/myk9q/package.json`                          | 1       |

## Risk

- ClassList/EntryList print triggers were decomposed in monorepo — need to find correct sub-modules
- reportService changes span features 1 and 2 — coordinate to avoid conflicts
- PWA changes are additive to existing working code — low regression risk
