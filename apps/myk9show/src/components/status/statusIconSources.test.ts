import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = resolve(process.cwd(), 'src');
const WORKSPACE_ROOT = resolve(process.cwd(), '../..');

const REMOVED_DUPLICATES = [
  'components/exhibitor/CheckInStatusBadge.tsx',
  'components/common/checkin-icon-map.ts',
  'components/offline-checkin/check-in-utils.tsx',
  'components/common/detailHeroUtils.ts',
] as const;

const MIGRATED_RENDERERS = [
  'components/common/CheckInManagementOverlay.tsx',
  'components/common/CheckInStatusBadge.tsx',
  'components/common/CheckInStatusIndicator.tsx',
  'components/classes/ClassResultsTable/StatusBadge.tsx',
  'components/live/EntryRow.tsx',
  'components/live/LiveClassCard.tsx',
  'components/schedule/ElementCard.tsx',
  'components/shows/tabs/ClassesTab.tsx',
  'components/shows/tabs/TrialsTab.tsx',
  'components/trials/TrialDetail/TrialClassesCards.tsx',
  'features/show-map/ShowMapStatusBadge.tsx',
  'pages/ClassDetailsPage/ClassReadinessStrip.tsx',
  'pages/TrialDetailsPage.tsx',
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
      expect(source, sourcePath).toContain('@/components/status');
      expect(source, sourcePath).not.toMatch(
        /CHECKIN_ICON_MAP|STATUS_ICONS|STATUS_BADGE_COLORS|CLASS_STATUS_CONFIG|ENTRY_STATUS_BADGE/
      );
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

    expect(existsSync(sharedGrammar)).toBe(true);
    const ringsideSource = readFileSync(ringsideRenderer, 'utf8');
    expect(ringsideSource).toContain('StatusIcon');
    expect(ringsideSource).toContain("from '@myk9/ui'");
    expect(ringsideSource).not.toMatch(/function getIcon|switch \(config\.iconName\)/);
  });
});
