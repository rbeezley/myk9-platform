import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScoringEntryCard } from './ScoringEntryCard';
import type { ScoringEntry } from '../types';

// Minimal fixture — only the fields ScoringEntryCard reads. Cast to avoid building the
// full nested ScoringEntry shape (dog/owner/etc.) which this card doesn't render.
function makeScoringEntry(overrides: Partial<ScoringEntry> = {}): ScoringEntry {
  return {
    id: 'se1',
    armband: 'A1',
    callName: 'Rex',
    breed: 'Border Collie',
    handler: 'Pat Handler' as unknown as ScoringEntry['handler'],
    status: 'completed',
    inRing: false,
    isScored: true,
    placement: 2,
    result: { qualification: 'Qualified', time: 12.3, faults: 0 },
    ...overrides,
  } as unknown as ScoringEntry;
}

describe('ScoringEntryCard placement (scoring view — not the podium)', () => {
  it('renders entry lifecycle status through the shared grammar', () => {
    const { container, rerender } = render(
      <ScoringEntryCard
        entry={makeScoringEntry({
          isScored: false,
          inRing: true,
          status: 'in-ring',
          placement: undefined,
        })}
      />
    );
    expect(container.querySelector('[data-family="entry"][data-status="in-ring"]')).not.toBeNull();

    rerender(
      <ScoringEntryCard
        entry={makeScoringEntry({
          isScored: false,
          inRing: false,
          status: 'pulled',
          placement: undefined,
        })}
      />
    );
    expect(container.querySelector('[data-family="entry"][data-status="pulled"]')).not.toBeNull();
  });

  it('shows a placement beyond 4th (5th) — the scoring list is not capped at the podium', () => {
    render(<ScoringEntryCard entry={makeScoringEntry({ placement: 5 })} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('still shows official podium placements (e.g. 2)', () => {
    render(<ScoringEntryCard entry={makeScoringEntry({ placement: 2 })} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows an em dash for zero armband', () => {
    render(<ScoringEntryCard entry={makeScoringEntry({ armband: 0 })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
