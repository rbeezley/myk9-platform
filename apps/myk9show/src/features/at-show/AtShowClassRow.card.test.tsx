/**
 * MYK9-1506 card states: progress bar, upload indicator + Offline Scoring badge
 * (known answers per queue state), and the heart / info / ellipsis controls.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { ClassEntry } from '@myk9/ringside';
import { render } from '@/test/utils/testUtils';
import { AtShowClassRow, type AtShowClassCardProps } from './AtShowClassRow';

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

function renderRow(entry: ClassEntry, props: Partial<AtShowClassCardProps> = {}) {
  return render(
    <ul>
      <AtShowClassRow
        entry={entry}
        isExhibitorOnly={false}
        onClick={() => {}}
        trialTimeZone="America/New_York"
        entryCountsAvailable
        {...props}
      />
    </ul>
  );
}

describe('progress bar', () => {
  it('shows completed over total', () => {
    renderRow(classEntry({ entry_count: 8, completed_count: 3 }));
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '8');
    expect(bar).toHaveAttribute('aria-valuetext', '3 of 8 scored');
  });

  it('is full for a finished class', () => {
    renderRow(classEntry({ class_status: 'completed', entry_count: 5, completed_count: 5 }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
  });

  it('is absent when the count is unknown, never a misleading empty bar', () => {
    renderRow(classEntry(), { entryCountsAvailable: false });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('is absent for a class with no entries', () => {
    renderRow(classEntry({ entry_count: 0, completed_count: 0 }));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

describe('upload indicator and Offline Scoring badge', () => {
  it('shows both for a class with scores queued on this device', () => {
    renderRow(classEntry(), { queuedScoreCount: 3 });
    expect(screen.getByText('3 scores not uploaded yet')).toBeInTheDocument();
    expect(screen.getByText('Offline Scoring')).toBeInTheDocument();
  });

  it('uses the singular for one queued score', () => {
    renderRow(classEntry(), { queuedScoreCount: 1 });
    expect(screen.getByText('1 score not uploaded yet')).toBeInTheDocument();
  });

  it.each([
    ['in progress', classEntry()],
    ['untouched', classEntry({ class_status: 'setup', completed_count: 0 })],
    ['finished', classEntry({ class_status: 'completed', completed_count: 4 })],
  ])('shows neither for an in-sync %s class, and never an outdated warning', (_name, entry) => {
    renderRow(entry, { queuedScoreCount: 0 });
    expect(screen.queryByText(/not uploaded yet/)).not.toBeInTheDocument();
    expect(screen.queryByText('Offline Scoring')).not.toBeInTheDocument();
    expect(screen.queryByText(/outdated|may be out of date|stale/i)).not.toBeInTheDocument();
  });

  it('still shows the badge when the class itself is in Offline Scoring', () => {
    renderRow(classEntry({ class_status: 'offline-scoring' }), { queuedScoreCount: 0 });
    expect(screen.getByText('Offline Scoring')).toBeInTheDocument();
    expect(screen.queryByText(/not uploaded yet/)).not.toBeInTheDocument();
  });
});

describe('card controls', () => {
  it('offers the heart, info and options controls only when wired', () => {
    renderRow(classEntry());
    expect(screen.queryByRole('button', { name: /Favorite/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Class details/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Class options/ })).not.toBeInTheDocument();
  });

  it('reflects the favorite state and reports the tap without opening the class', () => {
    const onToggleFavorite = vi.fn();
    const onClick = vi.fn();
    const entry = classEntry({ is_favorite: true });
    renderRow(entry, { onToggleFavorite, onClick });

    const heart = screen.getByRole('button', { name: 'Favorite Container Novice' });
    expect(heart).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(heart);

    expect(onToggleFavorite).toHaveBeenCalledWith(entry);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('hands the info and options buttons to their callbacks as the anchor', () => {
    const onShowDetails = vi.fn();
    const onOpenOptions = vi.fn();
    const entry = classEntry();
    renderRow(entry, { onShowDetails, onOpenOptions });

    const info = screen.getByRole('button', { name: 'Class details for Container Novice' });
    fireEvent.click(info);
    expect(onShowDetails).toHaveBeenCalledWith(entry, info);

    const more = screen.getByRole('button', { name: 'Class options for Container Novice' });
    fireEvent.click(more);
    expect(onOpenOptions).toHaveBeenCalledWith(entry, more);
  });
});
