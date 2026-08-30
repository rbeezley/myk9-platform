/**
 * F26 — the High in Trial report's presentation duties.
 *
 * The ranking rules are pinned in `lib/reports/__tests__/highInTrial.test.ts`. What is
 * asserted here is what the SECRETARY has to be told, which the model can compute
 * correctly and the page can still fail to say:
 *
 *   - a tie must read as a tie, with the coin flip named, not as a quiet winner;
 *   - an unfinished level must be labelled provisional before anyone hands out a trophy;
 *   - a trial with no eligible level must say why, rather than render an empty page.
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';

import { HighInTrialReport } from '../HighInTrialReport';
import type { ReportEntry, ReportProps } from '@/lib/reports/types';

let seq = 0;

function entry(overrides: Partial<ReportEntry> & Pick<ReportEntry, 'classElement' | 'classLevel'>) {
  seq += 1;
  return {
    id: `entry-${seq}`,
    dogId: 'dog-1',
    armband: '101',
    runOrder: null,
    callName: 'Ranger',
    breed: 'Border Collie',
    handler: 'Alex Kim',
    registrationNumber: 'SW1',
    checkInStatus: 'checked-in',
    section: null,
    isScored: true,
    resultText: 'qualified',
    searchTimeSeconds: 30,
    totalFaults: 0,
    finalPlacement: null,
    entryStatus: 'confirmed',
    ...overrides,
  } as ReportEntry;
}

const TWO_ELEMENT_NOVICE: ReportProps['allClasses'] = [
  { id: 'c1', trialId: 't1', element: 'Container', level: 'Novice' },
  { id: 'c2', trialId: 't1', element: 'Interior', level: 'Novice' },
];

function renderReport(overrides: Partial<ReportProps> = {}) {
  return render(
    <HighInTrialReport
      showName="Heartland Scent Work"
      trial={{ date: '2026-07-20', trialNumber: '1', judgeName: 'Pat Lee' }}
      entries={[]}
      allClasses={TWO_ELEMENT_NOVICE}
      sortOrder=""
      organization="AKC"
      {...overrides}
    />
  );
}

/** A team qualifying in both Novice elements. */
function team(dogId: string, armband: string, callName: string, faults: number, time: number) {
  return [
    entry({
      dogId,
      armband,
      callName,
      classElement: 'Container',
      classLevel: 'Novice',
      totalFaults: faults,
      searchTimeSeconds: time,
    }),
    entry({
      dogId,
      armband,
      callName,
      classElement: 'Interior',
      classLevel: 'Novice',
      totalFaults: 0,
      searchTimeSeconds: time,
    }),
  ];
}

describe('HighInTrialReport', () => {
  it('names the winner and shows the totals it was ranked on', () => {
    renderReport({
      entries: [...team('dog-a', '101', 'Ranger', 0, 20), ...team('dog-b', '102', 'Juni', 2, 10)],
    });

    expect(screen.getByText(/Novice High in Trial/)).toBeInTheDocument();
    expect(screen.getByText('Ranger')).toBeInTheDocument();
    // Container + Interior elements are named as the ones counted.
    expect(screen.getByText(/Container, Interior/)).toBeInTheDocument();
  });

  it('reads a top-rank tie as a tie and names the coin flip', () => {
    // Resolving the tie silently is the failure mode: §8 makes the coin flip a human
    // act, so the page must hand the decision over rather than print one name.
    renderReport({
      entries: [...team('dog-a', '101', 'Ranger', 1, 30), ...team('dog-b', '102', 'Juni', 1, 30)],
    });

    expect(screen.getByText(/TIE/)).toBeInTheDocument();
    expect(screen.getByText(/coin flip/i)).toBeInTheDocument();
    expect(screen.getAllByText(/1 \(tie\)/)).toHaveLength(2);
  });

  it('labels a level provisional while an entry has no result', () => {
    renderReport({
      entries: [
        ...team('dog-a', '101', 'Ranger', 0, 20),
        entry({
          dogId: 'dog-b',
          armband: '102',
          classElement: 'Interior',
          classLevel: 'Novice',
          isScored: false,
          resultText: 'pending',
        }),
      ],
    });

    expect(screen.getByText(/PROVISIONAL/)).toBeInTheDocument();
    expect(screen.getByText(/do not award/i)).toBeInTheDocument();
  });

  it('does not label a fully scored level provisional', () => {
    renderReport({ entries: [...team('dog-a', '101', 'Ranger', 0, 20)] });

    expect(screen.queryByText(/PROVISIONAL/)).toBeNull();
  });

  it('explains itself when no level qualifies for the award', () => {
    // A single-element level confers no HIT (§8). An empty page would read as a bug.
    renderReport({
      allClasses: [{ id: 'c1', trialId: 't1', element: 'Container', level: 'Novice' }],
      entries: [entry({ classElement: 'Container', classLevel: 'Novice' })],
    });

    expect(screen.getByText(/more than one element/i)).toBeInTheDocument();
  });

  it('says no award is made when nobody qualified in every element', () => {
    renderReport({
      entries: [
        entry({ classElement: 'Container', classLevel: 'Novice' }),
        entry({ classElement: 'Interior', classLevel: 'Novice', resultText: 'nq' }),
      ],
    });

    expect(screen.getByText(/No team qualified in every element/i)).toBeInTheDocument();
  });

  it('states the two limits a secretary would otherwise assume away', () => {
    renderReport({ entries: [...team('dog-a', '101', 'Ranger', 0, 20)] });

    // HD exclusion is a rule, not an oversight...
    expect(screen.getByText(/Handler Discrimination is excluded/i)).toBeInTheDocument();
    // ...and HCD is deliberately not computed, because §9 is truncated in our copy.
    expect(screen.getByText(/High Combined Division/i)).toBeInTheDocument();
  });
});
