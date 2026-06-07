import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { JudgePresenceDot } from '@/features/show-presence/JudgePresenceDot';
import {
  judgesOnClass,
  filterPresenceForViewer,
} from '@/features/show-presence/presenceSelectors';
import type { ShowPresence } from '@/features/show-presence/types';

function p(overrides: Partial<ShowPresence> & { userId: string; name: string }): ShowPresence {
  return {
    role: 'judge',
    location: { page: '/', entityType: 'class', entityId: 'c1' },
    activity: 'scoring',
    ts: 0,
    ...overrides,
  };
}

describe('judgesOnClass', () => {
  it('returns only judges present on the given class', () => {
    const present = [
      p({ userId: 'j1', name: 'Judge One' }),
      p({ userId: 'j2', name: 'Judge Two', location: { page: '/', entityType: 'class', entityId: 'c2' } }),
      p({ userId: 's1', name: 'Sec', role: 'secretary' }),
    ];
    expect(judgesOnClass(present, 'c1').map(j => j.userId)).toEqual(['j1']);
    expect(judgesOnClass(present, 'c2').map(j => j.userId)).toEqual(['j2']);
    expect(judgesOnClass(present, 'c9')).toEqual([]);
  });
});

describe('filterPresenceForViewer (privacy, plan §10 #2)', () => {
  const roster = [
    p({ userId: 'sec', name: 'Sue', role: 'secretary' }),
    p({ userId: 'jud', name: 'Jane', role: 'judge' }),
    p({ userId: 'ex1', name: 'Ann', role: 'exhibitor' }),
    p({ userId: 'ex2', name: 'Bob', role: 'exhibitor' }),
  ];

  it('lets staff see everyone', () => {
    expect(filterPresenceForViewer(roster, 'sec', 'secretary').map(x => x.userId).sort()).toEqual([
      'ex1',
      'ex2',
      'jud',
      'sec',
    ]);
  });

  it('lets an exhibitor see only staff plus themselves', () => {
    expect(filterPresenceForViewer(roster, 'ex1', 'exhibitor').map(x => x.userId).sort()).toEqual([
      'ex1',
      'jud',
      'sec',
    ]);
  });
});

describe('JudgePresenceDot', () => {
  it('renders a labeled dot when a judge is on the class', () => {
    render(<JudgePresenceDot present={[p({ userId: 'j1', name: 'Judge One' })]} classId="c1" />);
    expect(screen.getByLabelText('Judge online: Judge One')).toBeInTheDocument();
  });

  it('renders nothing when no judge is on the class', () => {
    const { container } = render(
      <JudgePresenceDot present={[p({ userId: 's1', name: 'Sec', role: 'secretary' })]} classId="c1" />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
