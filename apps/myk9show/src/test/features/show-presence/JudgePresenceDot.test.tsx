import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { JudgePresenceDot } from '@/features/show-presence/JudgePresenceDot';
import { judgesOnClass } from '@/features/show-presence/presenceSelectors';
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
