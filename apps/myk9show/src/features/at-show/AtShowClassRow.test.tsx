import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import type { ClassEntry } from '@myk9/ringside';
import { render } from '@/test/utils/testUtils';
import { AtShowClassRow } from './AtShowClassRow';
import type { AtShowNextUpPreview } from './atShowNextUpPreview';

function classEntry(overrides: Partial<ClassEntry> = {}): ClassEntry {
  return {
    id: 'class-1',
    element: 'Container',
    level: 'Novice',
    section: '',
    class_name: 'Container Novice',
    class_order: 1,
    judge_name: 'Jane Judge',
    entry_count: 4,
    completed_count: 1,
    class_status: 'in_progress',
    is_favorite: false,
    dogs: [],
    ...overrides,
  } as ClassEntry;
}

const preview: AtShowNextUpPreview = {
  inRingArmband: '12',
  nextArmbands: ['13', '14'],
  remaining: 3,
  total: 4,
};

function renderRow(entry: ClassEntry, nextUp?: AtShowNextUpPreview) {
  return render(
    <ul>
      <AtShowClassRow
        entry={entry}
        isExhibitorOnly={false}
        onClick={() => {}}
        trialTimeZone="America/New_York"
        nextUp={nextUp}
      />
    </ul>
  );
}

describe('AtShowClassRow next-up line', () => {
  it('shows the in-ring armband, the next armbands and the remaining count on a live class', () => {
    renderRow(classEntry(), preview);

    expect(screen.getByText('#12')).toBeInTheDocument();
    expect(screen.getByText('Next #13 · #14')).toBeInTheDocument();
    expect(screen.getByText('3 of 4 remaining')).toBeInTheDocument();
  });

  it('hides the line on a class that is not live', () => {
    renderRow(classEntry({ class_status: 'completed', completed_count: 4 }), preview);

    expect(screen.queryByText('#12')).not.toBeInTheDocument();
    expect(screen.queryByText('3 of 4 remaining')).not.toBeInTheDocument();
  });

  it('hides the line when there is nobody in the ring and nobody waiting', () => {
    renderRow(classEntry(), {
      inRingArmband: null,
      nextArmbands: [],
      remaining: 0,
      total: 4,
    });

    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument();
  });

  it('renders nothing extra when no preview is supplied', () => {
    renderRow(classEntry());

    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument();
    expect(screen.getByText('Container Novice')).toBeInTheDocument();
  });
});
