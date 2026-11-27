/**
 * MYK9-2488: AKC Nationals is hidden. These tests run with the real switch
 * (no stand-in), so they describe what the app does today: no way to flag a
 * show, and nothing Nationals-specific even on a show still flagged in the
 * database.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';

vi.mock('@/components/ui/tabs', () => import('@/components/common/__tests__/mockTabs'));

import { ShowEditFeesTab } from '@/components/panels/edit/ShowEditFeesTab';
import type { ShowEditFormData } from '@/components/panels/edit/ShowEditPanel.types';
import { ringsideMenuExtensions } from '@/features/at-show/menu/ringsideMenuExtensions';
import { isNationalsLeaderboardView } from '@/features/results-tab/resultsTabRoutes';
import { applyShowNationals } from '@/pages/scoring/scoresheetNationals';
import { deriveSportType, mapSportType, toRegistryKey } from '@/pages/scoring/types';
import { AKC_NATIONALS_ENABLED, isAkcNationalsEnabled, showIsNationals } from '../akcNationals';

const FLAGGED_SHOW = { organization: 'AKC', isNationals: true };

const FORM_DATA: ShowEditFormData = {
  name: 'Test Show',
  status: 'draft',
  organization: 'AKC',
  clubId: 'c1',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  location: 'Dogtown',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-04-15',
  preEntryFee: '15',
  dayOfShowFee: '20',
  assignedJudges: [],
  acceptCheckPayments: false,
  acceptCashPayments: false,
  style: 'monogram',
};

describe('AKC Nationals is hidden (MYK9-2488)', () => {
  it('ships switched off', () => {
    expect(AKC_NATIONALS_ENABLED).toBe(false);
    expect(isAkcNationalsEnabled()).toBe(false);
  });

  it('offers no way to flag a show as Nationals in show setup', () => {
    render(
      <ShowEditFeesTab
        data={{ ...FORM_DATA, isNationals: true }}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );

    // The rest of the tab is there; the Nationals checkbox and its wording are not.
    expect(screen.getByLabelText('Pre-Entry Fee')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /nationals/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/nationals/i)).not.toBeInTheDocument();
  });

  it('treats a show still flagged in the database as a regular show', () => {
    expect(showIsNationals(FLAGGED_SHOW)).toBe(false);
    expect(showIsNationals({ isNationals: false })).toBe(false);
    expect(showIsNationals(null)).toBe(false);
  });

  it('keeps a flagged AKC Scent Work show on the regular scoresheet', () => {
    expect(applyShowNationals('akc-scent-work', FLAGGED_SHOW)).toBe('akc-scent-work');
  });

  it('scores a trial typed "Scent Work Nationals" on the regular AKC sheet', () => {
    const code = deriveSportType('AKC', 'Scent Work Nationals');
    const { organization, sportType } = mapSportType(code ?? '');

    expect(toRegistryKey(organization, sportType)).toBe('AKC_SCENT_WORK');
  });

  it('adds no Nationals Leaderboard to the Ringside menu, even for staff on a flagged show', () => {
    const items = ringsideMenuExtensions.map(extension =>
      extension.build({
        showId: 'show-1',
        isNationals: showIsNationals(FLAGGED_SHOW),
        isStaff: true,
        canManageShow: true,
        isOnline: true,
        hasAccount: true,
      })
    );

    expect(items.every(item => item === null)).toBe(true);
  });

  it('does not open the leaderboard from its Results tab address on a flagged show', () => {
    const params = new URLSearchParams('view=leaderboard');

    expect(isNationalsLeaderboardView(params, showIsNationals(FLAGGED_SHOW))).toBe(false);
  });
});
