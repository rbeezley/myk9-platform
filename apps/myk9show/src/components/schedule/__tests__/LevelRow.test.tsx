import { describe, it, expect } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';
import type { ClassStatusValue } from '@myk9/core';
import { render, screen } from '@/test/utils/testUtils';
import { LevelRow } from '../LevelRow';
import type { LevelDetail } from '../schedule-timeline.types';

const level = (status: ClassStatusValue): LevelDetail => ({
  classId: 'c1',
  level: 'Novice',
  status,
  entryCount: 3,
});

describe('LevelRow', () => {
  // The row is the load-bearing schedule navigation control; it must clear the
  // 44px touch-target floor.
  it('meets the 44px touch-target floor', () => {
    render(<LevelRow level={level(CLASS_STATUS.SCHEDULED)} />);
    expect(screen.getByRole('button').className).toContain('min-h-[44px]');
  });

  // Completion is signalled by a ✓ glyph (a non-color cue) using the semantic
  // success token, which adapts automatically in dark mode.
  it('marks completed levels with an accessible semantic-success check', () => {
    render(<LevelRow level={level(CLASS_STATUS.COMPLETED)} />);
    const check = screen.getByText('✓');
    expect(check.className).toContain('text-success');
  });

  it('marks in-progress levels with a semantic warning label', () => {
    render(<LevelRow level={level(CLASS_STATUS.IN_PROGRESS)} />);
    expect(screen.getByText('Novice').className).toContain('text-warning');
  });
});
