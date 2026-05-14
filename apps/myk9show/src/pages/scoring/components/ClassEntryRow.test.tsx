// apps/myk9show/src/pages/scoring/components/ClassEntryRow.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ClassEntryRow } from './ClassEntryRow';
import type { ScoringEntry } from '../types';

function makeEntry(overrides: Partial<ScoringEntry> = {}): ScoringEntry {
  return {
    id: 1,
    entryId: 'e1',
    classId: 'c1',
    dogId: 'd1',
    callName: 'Buddy',
    handler: 'Smith',
    breed: 'Lab',
    armband: 101,
    status: 'pending',
    inRing: false,
    isScored: false,
    exhibitorOrder: 1,
    ...overrides,
  };
}

describe('ClassEntryRow', () => {
  it('renders armband, dog name, breed, and handler', () => {
    render(<ClassEntryRow entry={makeEntry()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Lab')).toBeInTheDocument();
    expect(screen.getByText('Smith')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<ClassEntryRow entry={makeEntry()} isActive={false} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows Q badge for qualified scored entry', () => {
    const entry = makeEntry({
      isScored: true,
      status: 'scored',
      result: { time: 83450, faults: 0, qualification: 'Qualified' },
    });
    render(<ClassEntryRow entry={entry} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText('Q')).toBeInTheDocument();
  });

  it('shows NQ badge for not-qualified scored entry', () => {
    const entry = makeEntry({
      isScored: true,
      status: 'scored',
      result: { time: 0, faults: 0, qualification: 'Not Qualified' },
    });
    render(<ClassEntryRow entry={entry} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText('NQ')).toBeInTheDocument();
  });

  it('applies active styles when isActive is true', () => {
    render(<ClassEntryRow entry={makeEntry()} isActive={true} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute('data-active', 'true');
  });
});
