import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { ShowMapTree } from '../showMapTypes';
import { buildSecretaryCockpitSnapshot } from '../cockpit/buildSecretaryCockpitSnapshot';
import { CockpitAttentionStrip } from '../cockpit/CockpitAttentionStrip';
import { computeShowDeskPendingSignals } from '../showDeskPendingSignals';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

const tree = {
  nodesById: {
    'class:c-early': { id: 'class:c-early', type: 'class', parentId: 'trial:t-early' },
    'class:c-late': { id: 'class:c-late', type: 'class', parentId: 'trial:t-late' },
  },
  rootIds: [],
  diagnostics: [],
} as unknown as ShowMapTree;

// 8:00 AM Eastern on 2026-11-21 is 13:00 UTC.
const trials = [
  {
    id: 't-early',
    trialDate: '2026-11-21',
    plannedStartTime: '08:00',
    timezone: 'America/New_York',
  },
  {
    id: 't-late',
    trialDate: '2026-11-21',
    plannedStartTime: '13:00',
    timezone: 'America/New_York',
  },
];
const requested = (classId: string) => ({ entry_status: 'move-up-requested', class_id: classId });
const NOW = new Date('2026-11-21T12:45:00.000Z');

function pill(entries: Array<Record<string, unknown>>, now: Date | null = NOW) {
  return computeShowDeskPendingSignals({
    showId: 'show-1',
    tree,
    entries,
    currentDate: now,
    trials,
  }).find(signal => signal.id === 'class-changes-waiting');
}

describe('Show Desk class changes pill (MYK9-2122)', () => {
  it('shows no pill when no request is waiting', () => {
    expect(pill([])).toBeUndefined();
    expect(
      pill([{ entry_status: 'confirmed', class_id: 'c-early' }, { entry_status: 'pending' }])
    ).toBeUndefined();
    expect(pill([{ ...requested('c-early'), deleted_at: '2026-11-20T00:00:00Z' }])).toBeUndefined();
  });

  it('counts the waiting requests and opens the Class changes list', () => {
    const found = pill([requested('c-late'), requested('c-late'), { entry_status: 'confirmed' }]);
    expect(found?.count).toBe(2);
    expect(found?.label).toBe('2 class changes waiting');
    expect(found?.href).toContain('/shows/show-1/entries?');
    expect(found?.href).toContain('exception=move-ups');
    expect(found?.destinationName).toBe('Class changes');
    expect(pill([requested('c-late')])?.label).toBe('1 class change waiting');
  });

  it('says how many are for a trial starting within 30 minutes', () => {
    expect(pill([requested('c-early'), requested('c-late')])?.label).toBe(
      '2 class changes waiting · 1 for a trial starting soon'
    );
  });

  it('does not call a trial soon before the half hour, after its start, or with no clock', () => {
    expect(pill([requested('c-early')], new Date('2026-11-21T12:29:00.000Z'))?.label).toBe(
      '1 class change waiting'
    );
    expect(pill([requested('c-early')], new Date('2026-11-21T13:01:00.000Z'))?.label).toBe(
      '1 class change waiting'
    );
    expect(pill([requested('c-early')], null)?.label).toBe('1 class change waiting');
  });

  it('renders in the Needs attention strip as a link to the Class changes list', () => {
    const pendingSignals = computeShowDeskPendingSignals({
      showId: 'show-1',
      tree,
      entries: [requested('c-early'), requested('c-late')],
      currentDate: NOW,
      trials,
    });
    const snapshot = buildSecretaryCockpitSnapshot({
      showId: 'show-1',
      trials: [],
      classes: [],
      tree,
      pendingSignals,
      returnTo: '/shows/show-1',
      now: NOW,
    });
    const attention = snapshot.administrativeAttention ?? [];
    render(
      <CockpitAttentionStrip
        items={attention}
        all={attention}
        overflowCount={0}
        classNameById={new Map()}
        onCommand={vi.fn()}
      />
    );
    expect(
      screen.getByRole('link', {
        name: '2 class changes waiting · 1 for a trial starting soon, opens Class changes',
      })
    ).toHaveAttribute('href', expect.stringContaining('exception=move-ups'));
  });
});
