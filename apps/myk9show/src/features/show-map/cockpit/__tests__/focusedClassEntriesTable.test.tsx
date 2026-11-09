import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { SecretaryCockpit } from '../SecretaryCockpit';
import type { SecretaryCockpitClassEntry } from '../cockpitClassEntries';
import type { SecretaryCockpitSnapshot } from '../secretaryCockpitTypes';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: 1200 }),
}));

const entries: SecretaryCockpitClassEntry[] = [
  {
    nodeId: 'entry:a',
    armband: '101',
    dogName: 'Piper',
    breed: 'Border Collie',
    handler: 'Dana Lee',
    checkIn: { value: 'completed', label: 'Complete', kind: 'complete' },
    state: 'scored',
    counted: true,
    notCheckedIn: false,
    place: null,
    result: 'Q',
  },
  {
    nodeId: 'entry:b',
    armband: '102',
    dogName: 'Willow',
    handler: 'Sam Ortiz',
    checkIn: { value: 'in-ring', label: 'In ring', kind: 'active' },
    state: 'in-ring',
    counted: true,
    notCheckedIn: false,
    place: null,
    result: null,
  },
  {
    nodeId: 'entry:c',
    armband: '103',
    dogName: 'Moss',
    handler: 'Kim Wu',
    checkIn: { value: 'no-status', label: 'Not checked in', kind: 'neutral' },
    state: 'waiting',
    counted: true,
    notCheckedIn: true,
    place: 1,
    result: null,
  },
  {
    nodeId: 'entry:d',
    armband: '104',
    dogName: 'Juno',
    handler: 'Pat Roe',
    checkIn: { value: 'pulled', label: 'Pulled', kind: 'muted' },
    state: 'pulled',
    counted: false,
    notCheckedIn: false,
    place: null,
    result: null,
  },
];

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  printTrackingInUse: false,
  checklistInUse: false,
  trials: [{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }],
  classes: [
    {
      id: 'class-1',
      trialId: 'trial-1',
      name: 'Container Novice',
      classOrder: 0,
      lifecycle: 'in-progress',
      entryCount: 4,
      scoredCount: 1,
      actions: [],
      attention: [],
      paperwork: [],
      entryRows: [],
      entries,
    },
  ],
};

describe('the focused class entries table (MYK9-1782)', () => {
  it('lists every entry in run order with its run status, result and check-in', () => {
    render(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />, {
      initialRoute: '/shows/show-1',
    });
    const rows = screen.getAllByTestId('class-entry-row');
    expect(rows).toHaveLength(4);
    expect(within(rows[0]!).getByText('Border Collie')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Scored')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Q')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Willow')).toBeInTheDocument();
    expect(within(rows[1]!).getAllByText('In ring')).toHaveLength(2);
    expect(within(rows[2]!).getByText('Not checked in')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Waiting')).toBeInTheDocument();
    expect(within(rows[3]!).getAllByText('Pulled')).toHaveLength(2);
    // Place in line (a dash once a dog is scored, in the ring or pulled), then the reserved empty last column.
    expect(rows.map(row => within(row).getAllByRole('cell')[0]!.textContent)).toEqual([
      '—',
      '—',
      '1',
      '—',
    ]);
    expect(within(rows[0]!).getAllByRole('cell').at(-1)).toBeEmptyDOMElement();
  });

  it('counts entered, scored, in ring and still to run from the same rows', () => {
    render(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />, {
      initialRoute: '/shows/show-1',
    });
    const tiles = screen.getByTestId('class-count-tiles');
    const value = (label: string) =>
      [...tiles.querySelectorAll('dt')].find(term => term.textContent === label)?.nextElementSibling
        ?.textContent;
    // The pulled dog is listed but is not in the expected set.
    expect(value('Entered')).toBe('3');
    expect(value('Scored')).toBe('1');
    expect(value('In ring')).toBe('1');
    expect(value('Still to run')).toBe('1');
  });

  it('shows the schedule row phrase with the dog in the ring', () => {
    render(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />, {
      initialRoute: '/shows/show-1',
    });
    expect(screen.getByTestId('class-status-line')).toHaveTextContent(
      'Running · 1 of 3 scored · Willow in ring'
    );
  });
});
