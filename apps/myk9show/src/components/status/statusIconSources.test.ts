import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = resolve(process.cwd(), 'src');
const WORKSPACE_ROOT = resolve(process.cwd(), '../..');

const OUT_OF_SCOPE_STATUS_SOURCE_SEGMENTS = [
  '/components/common/ResultBadge.tsx',
  '/components/secretary/PromoCodesSection.tsx',
  '/features/lifecycle-emails/',
  '/pages/admin/SystemHealthPage.tsx',
  '/utils/showCardUtils.ts',
] as const;

function productionSources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    if (!/\.(ts|tsx|css)$/.test(entry.name) || /\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }
    return [path];
  });
}

const REMOVED_DUPLICATES = [
  'components/exhibitor/CheckInStatusBadge.tsx',
  'components/common/checkin-icon-map.ts',
  'components/offline-checkin/check-in-utils.tsx',
  'components/common/detailHeroUtils.ts',
  'components/trials/TrialSidebar.tsx',
] as const;

const MIGRATED_RENDERERS = [
  'components/common/CheckInManagementOverlay.tsx',
  'components/common/CheckInStatusBadge.tsx',
  'components/common/CheckInStatusIndicator.tsx',
  'components/checkin/CheckInExhibitorCard.tsx',
  'components/checkin/CheckInProgressBar.tsx',
  'components/classes/EntriesStatisticsPanel.tsx',
  'components/classes/ClassResultsTable/StatusBadge.tsx',
  'components/scoring/ResultEntryNavigation.tsx',
  'components/entries/EntryStatusLine.tsx',
  'components/entries/EntryStatusHistory.tsx',
  'components/entries/EntryStatusStepper.tsx',
  'components/entries/management/PullReconciliationCard.tsx',
  'components/live/EntryRow.tsx',
  'components/live/LiveClassCard.tsx',
  'components/judges/JudgeCheckInInterface.tsx',
  'components/offline-checkin/StatisticsPanel.tsx',
  'components/schedule/ElementCard.tsx',
  'components/shows/tabs/ClassesTab.tsx',
  'components/shows/tabs/ClassCard.tsx',
  'components/shows/tabs/TrialsTab.tsx',
  'components/trials/TrialDetail/TrialClassesCards.tsx',
  'features/show-map/ShowMapStatusBadge.tsx',
  'features/pipeline/components/ClassPipelineCard.tsx',
  'features/pipeline/components/ScoringDaySummary.tsx',
  'features/show-desk-people-roster/ShowDeskPeopleRoster.tsx',
  'features/at-show/AtShowClassRow.tsx',
  'features/at-show/AtShowMyEntriesToday.tsx',
  'features/at-show/slots/CheckinStatusDialog.tsx',
  'features/at-show/slots/ClassDetailsPopoverSlot.tsx',
  'pages/ClassDetailsPage/ClassReadinessStrip.tsx',
  'pages/ClassDetailsPage/SecretaryRunSheet/RunSheetRow.tsx',
  'pages/judge/JudgeCheckInDashboard.tsx',
  'pages/MyEntriesPage/modules/entryTabDefs.ts',
  'components/classes/ClassLifecyclePresetTiles.tsx',
  'components/templates/secretary/RunOrderBoard.tsx',
  'components/stewards/GateStewardInterfaceComponents.tsx',
  'pages/TrialDetailsPage.tsx',
  'pages/secretary/WaitlistManagementPage/ClassStatsCards.tsx',
] as const;

describe('status icon grammar source ownership', () => {
  it('keeps removed duplicate maps and badge components deleted', () => {
    for (const sourcePath of REMOVED_DUPLICATES) {
      expect(existsSync(resolve(SOURCE_ROOT, sourcePath)), sourcePath).toBe(false);
    }
  });

  it('routes primary entry, class, and trial renderers through the shared status module', () => {
    for (const sourcePath of MIGRATED_RENDERERS) {
      const source = readFileSync(resolve(SOURCE_ROOT, sourcePath), 'utf8');
      expect(source, sourcePath).toMatch(/@\/components\/status|@myk9\/ui/);
      expect(source, sourcePath).not.toMatch(
        /CHECKIN_ICON_MAP|STATUS_ICONS|STATUS_BADGE_COLORS|STATUS_CLASS_BY_VALUE|CLASS_STATUS_CONFIG|ENTRY_STATUS_BADGE|BASE_STATUSES|RING_MANAGEMENT_STATUSES|getClassStatusColor|getFormattedClassStatus/
      );
    }
  });

  it('keeps class and check-in presentation out of local configuration maps', () => {
    const atShowHelpers = readFileSync(
      resolve(SOURCE_ROOT, 'features/at-show/slots/atShowChrome.helpers.ts'),
      'utf8'
    );
    const checkInTypes = readFileSync(resolve(SOURCE_ROOT, 'types/check-in-types.ts'), 'utf8');
    const resultsStatusBadge = readFileSync(
      resolve(SOURCE_ROOT, 'components/classes/ClassResultsTable/StatusBadge.tsx'),
      'utf8'
    );

    expect(atShowHelpers).not.toMatch(
      /STATUS_LABELS|STATUS_TIERS|CLASS_STATUS_COLOR_TIER|getClassStatusLabel|getClassStatusTier|getClassListStatusTier/
    );
    expect(checkInTypes).not.toMatch(
      /CHECK_IN_STATUS_CONFIG|getCheckInStatusConfig|backgroundColor|borderColor|\bicon\??:/
    );
    expect(resultsStatusBadge).not.toContain('variant="default"');
  });

  it('keeps lifecycle summary and tab icons on the shared grammar', () => {
    const entriesStatistics = readFileSync(
      resolve(SOURCE_ROOT, 'components/classes/EntriesStatisticsPanel.tsx'),
      'utf8'
    );
    const myEntriesTabs = readFileSync(
      resolve(SOURCE_ROOT, 'pages/MyEntriesPage/modules/entryTabDefs.ts'),
      'utf8'
    );
    const ringsideTabSources = [
      'packages/ringside/src/pages/EntryList/EntryListPage.tsx',
      'packages/ringside/src/pages/EntryList/CombinedEntryListPage.tsx',
    ].map(sourcePath => readFileSync(resolve(WORKSPACE_ROOT, sourcePath), 'utf8'));

    expect(entriesStatistics).not.toMatch(/icon:\s*(?:CheckCircle|Clock)/);
    expect(myEntriesTabs).not.toMatch(/icon:\s*(?:Clock|CheckCircle|Users|CircleCheck)/);
    for (const source of ringsideTabSources) {
      expect(source).not.toMatch(/icon:\s*<(?:Clock|CheckCircle)\b/);
      expect(source).toContain('StatusIcon');
    }
  });

  it('keeps the grammar in shared UI and routes ringside status content through it', () => {
    const sharedGrammar = resolve(
      WORKSPACE_ROOT,
      'packages/ui/src/components/StatusIcon/statusIconGrammar.ts'
    );
    const ringsideRenderer = resolve(
      WORKSPACE_ROOT,
      'packages/ringside/src/pages/EntryList/SortableEntryCardComponents.tsx'
    );
    const ringsideStatusApiSources = [
      resolve(WORKSPACE_ROOT, 'packages/ringside/src/pages/EntryList/sortableEntryCardUtils.ts'),
      resolve(WORKSPACE_ROOT, 'packages/ringside/src/pages/EntryList/index.ts'),
      resolve(WORKSPACE_ROOT, 'packages/ringside/src/index.ts'),
    ];

    expect(existsSync(sharedGrammar)).toBe(true);
    const ringsideSource = readFileSync(ringsideRenderer, 'utf8');
    expect(ringsideSource).toContain('StatusIcon');
    expect(ringsideSource).toContain("from '@myk9/ui'");
    expect(ringsideSource).not.toMatch(/function getIcon|switch \(config\.iconName\)/);
    for (const sourcePath of ringsideStatusApiSources) {
      expect(readFileSync(sourcePath, 'utf8'), sourcePath).not.toMatch(
        /\bgetStatusConfig\b|\bStatusConfig\b/
      );
    }
  });

  it('scans every in-scope source root for legacy entry/class presentation owners', () => {
    const roots = [
      resolve(WORKSPACE_ROOT, 'apps/myk9show/src'),
      resolve(WORKSPACE_ROOT, 'packages/core/src'),
      resolve(WORKSPACE_ROOT, 'packages/ui/src'),
      resolve(WORKSPACE_ROOT, 'packages/ringside/src'),
    ];
    const forbidden =
      /\bCHECKIN_STATUS\b|\bgetCheckinStatusConfig\b|\bCheckInStatusConfig\b|\bCLASS_STATUS_DISPLAY\b|\bgetClassStatusDisplay\b|\bgetClassStatusBadgeClasses\b|\bCLASS_DISPLAY_STATUS_LABELS\b|\bgetClassDisplayStatusLabel\b|\bgetFormattedStatus\b|\bgetClassStatusColor\b|\bgetFormattedClassStatus\b|\bBASE_STATUSES\b|\bRING_MANAGEMENT_STATUSES\b|\bSTATUS_PILL_BG\b|\bSTATUS_VARIANT_MAP\b|\bTV_STATUS_CONFIG\b|\bSUMMARY_BORDER_COLOR\b|\bCLASS_LIFECYCLE_LABELS\b|\bCLASS_LIFECYCLE_TONES\b|\bSTATUS_BORDER\b|\bSTAGE_STYLE\b|status\.replace\(\/\[-_\]\/g|h-2\s+w-2\s+rounded-full\s+bg-primary\s+animate-pulse|const\s+statusConfig\s*=\s*\[\s*\{\s*key:\s*'Scheduled',\s*title:[^}]+icon:|function\s+getStatusDisplay\s*\(\s*entry\s*:\s*ScoringEntry|myk9-entry-status-dot|myk9-judge-progress-dot|\.myk9-entry-card\.(?:pending|in-progress|completed)|\.myk9-entry-status-text\.(?:pending|in-progress)|\.myk9-class-status-(?:scheduled|in-progress|completed)|\.myk9-trial-status-(?:upcoming|in-progress|completed)|const\s+statusColors\s*:\s*Record<ClassStatus|const\s+statusBadgeColors\s*:\s*Record<ClassStatus|function\s+getStatusColor\s*\(\s*status:\s*(?:CheckInStatus|ClassEntry)/;

    for (const sourcePath of roots.flatMap(productionSources)) {
      if (OUT_OF_SCOPE_STATUS_SOURCE_SEGMENTS.some(segment => sourcePath.includes(segment))) {
        continue;
      }
      const source = readFileSync(sourcePath, 'utf8');
      expect(source, sourcePath.replace(`${WORKSPACE_ROOT}/`, '')).not.toMatch(forbidden);
    }
  });

  it('normalizes warm-store class statuses before computing trial completion', () => {
    const showDetails = readFileSync(
      resolve(WORKSPACE_ROOT, 'apps/myk9show/src/pages/ShowDetailsPage.tsx'),
      'utf8'
    );

    expect(showDetails).toContain('normalizeClassStatus(cls.status) === CLASS_STATUS.COMPLETED');
    expect(showDetails).toContain('normalizeClassStatus(cls.status) === CLASS_STATUS.IN_PROGRESS');
  });

  it('derives Trial Details status when the stored trial status is missing', () => {
    const trialDetails = readFileSync(
      resolve(WORKSPACE_ROOT, 'apps/myk9show/src/pages/TrialDetailsPage.tsx'),
      'utf8'
    );

    expect(trialDetails).not.toContain('if (!currentTrial?.status) return undefined;');
    expect(trialDetails).toContain('trialStatus: currentTrial?.status');
  });
});
