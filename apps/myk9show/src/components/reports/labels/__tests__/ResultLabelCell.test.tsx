import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultLabelCell } from '../ResultLabelCell';
import type { ResultLabelItem } from '@/lib/labels/resultLabelData';

function item(over: Partial<ResultLabelItem> = {}): ResultLabelItem {
  return {
    id: 'e1',
    armband: 42,
    callName: 'Scout',
    handler: 'Jane Handler',
    clubName: 'Twin Cities Dog Club',
    showName: 'Spring Scent Trial 2026',
    trialClassLine: 'Trial 1 — Container Novice A',
    placement: '1',
    timeStr: '0:47',
    faults: 0,
    hasResults: true,
    ...over,
  };
}

describe('ResultLabelCell', () => {
  it('puts the armband and dog name on the same row', () => {
    render(<ResultLabelCell item={item()} />);
    const armband = screen.getByText('#42');
    const name = screen.getByText('Scout');
    // Both live in the same flex head container — "one row" per the secretary request.
    expect(armband.parentElement).toBe(name.parentElement);
  });

  it('shows the club name', () => {
    render(<ResultLabelCell item={item()} />);
    expect(screen.getByText('Twin Cities Dog Club')).toBeInTheDocument();
  });

  it('shows handler, show/class line, and the result fields', () => {
    render(<ResultLabelCell item={item()} />);
    expect(screen.getByText('Jane Handler')).toBeInTheDocument();
    expect(
      screen.getByText('Spring Scent Trial 2026 — Trial 1 — Container Novice A')
    ).toBeInTheDocument();
    expect(screen.getByText('Place: 1')).toBeInTheDocument();
    expect(screen.getByText('Time: 0:47')).toBeInTheDocument();
    expect(screen.getByText('Faults: 0')).toBeInTheDocument();
  });

  it('omits the club line when there is no club name', () => {
    render(<ResultLabelCell item={item({ clubName: undefined })} />);
    expect(screen.queryByText('Twin Cities Dog Club')).not.toBeInTheDocument();
  });

  it('omits the result line when the entry has no results', () => {
    render(
      <ResultLabelCell
        item={item({ hasResults: false, placement: null, timeStr: '', faults: null })}
      />
    );
    expect(screen.queryByText(/Place:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Time:/)).not.toBeInTheDocument();
  });
});
