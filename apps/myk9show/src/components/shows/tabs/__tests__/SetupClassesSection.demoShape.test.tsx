/**
 * MYK9-986: the Select classes table on the demo show's data shape. The trial
 * type is the STORED value (`scent_work`), which the old display-label compare
 * never matched, so the always-zero Ring column showed; and the Level cell ran
 * "Novice" and "A" together.
 */
import { render, screen, userEvent, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trial } from '@/components/trials/types/trial.types';
import type { ClassInfo } from '../ClassesTab';
import { SetupClassesSection } from '../SetupClassesSection';

vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: true }),
}));
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => true }) }));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => ['table', vi.fn(), true],
  CARD_TABLE_MODES: [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ],
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: () => ({ data: { id: 's1', organization: 'AKC' } }),
}));
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));

const trial = (trialType: string) => [{ id: 't1', trialType }] as unknown as Trial[];

const demoClass: ClassInfo = {
  id: 'c1',
  name: 'Interior Novice A',
  element: 'Interior',
  level: 'Novice',
  section: 'A',
  judgeName: 'Pat Donovan',
  trialId: 't1',
  trialDate: '2026-10-10',
  trialNumber: '1',
  time: '7:30 AM',
  ring: 0,
  status: 'Scheduled',
  entryCount: 1,
  userHasEntry: false,
};

describe('Select classes table, demo show data shape (MYK9-986)', () => {
  beforeEach(() => {
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it.each(['scent_work', 'nosework', 'scent_detection'])(
    'hides the Ring column for the stored trial type %s',
    trialType => {
      render(
        <SetupClassesSection
          showId="s1"
          trials={trial(trialType)}
          classes={[demoClass]}
          userHasEntries={false}
        />
      );

      expect(screen.getByRole('columnheader', { name: /^Time/ })).toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: /^Ring/ })).not.toBeInTheDocument();
    }
  );

  it('keeps the Ring column for a sport that has rings', () => {
    render(
      <SetupClassesSection
        showId="s1"
        trials={trial('agility')}
        classes={[demoClass]}
        userHasEntries={false}
      />
    );

    expect(screen.getByRole('columnheader', { name: /^Ring/ })).toBeInTheDocument();
  });

  it('reads the level and section as one label, "Novice A", with its time and entry count', () => {
    render(
      <SetupClassesSection
        showId="s1"
        trials={trial('scent_work')}
        classes={[demoClass]}
        userHasEntries={false}
      />
    );

    const row = screen.getByRole('row', { name: /Interior/ });
    expect(within(row).getByRole('cell', { name: 'Novice A' })).toBeInTheDocument();
    expect(within(row).queryByText('NoviceA')).not.toBeInTheDocument();
    expect(within(row).getByRole('cell', { name: '7:30 AM' })).toBeInTheDocument();
    expect(within(row).getByRole('cell', { name: '1' })).toBeInTheDocument();
  });

  it('sorts the Time column by clock time, not as text ("9:00 AM" before "10:00 AM")', async () => {
    const user = userEvent.setup();
    render(
      <SetupClassesSection
        showId="s1"
        trials={trial('scent_work')}
        classes={[
          { ...demoClass, id: 'late', element: 'Exterior', time: '10:00 AM' },
          { ...demoClass, id: 'early', element: 'Container', time: '9:00 AM' },
          { ...demoClass, id: 'none', element: 'Buried', time: '' },
        ]}
        userHasEntries={false}
      />
    );

    await user.click(
      within(screen.getByRole('columnheader', { name: /^Time/ })).getByRole('button')
    );

    const order = screen
      .getAllByRole('row')
      .map(row => within(row).queryAllByRole('cell')[2]?.textContent)
      .filter(Boolean);
    expect(order).toEqual(['Container', 'Exterior', 'Buried']);
  });
});
