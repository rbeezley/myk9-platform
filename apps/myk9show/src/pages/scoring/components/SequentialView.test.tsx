import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { SequentialView } from './SequentialView';
import { DEFAULT_SESSION_SETTINGS } from '../paper-scoring-types';
import type { ScoringEntry } from '../types';

function makeEntry(id: string, order: number, isScored = false): ScoringEntry {
  return {
    id: order,
    entryId: id,
    classId: 'c1',
    dogId: 'd1',
    callName: `Dog ${order}`,
    handler: 'Smith',
    breed: 'Lab',
    armband: 100 + order,
    status: isScored ? 'scored' : 'pending',
    inRing: false,
    isScored,
    exhibitorOrder: order,
  };
}

const entries = [makeEntry('e1', 1), makeEntry('e2', 2), makeEntry('e3', 3, true)];

describe('SequentialView', () => {
  it('shows progress text', () => {
    render(
      <SequentialView
        entries={entries}
        currentIndex={0}
        settings={DEFAULT_SESSION_SETTINGS}
        onNavigate={vi.fn()}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByText(/1 of 2 scored/i)).toBeInTheDocument();
  });

  it('renders dog name for current index', () => {
    render(
      <SequentialView
        entries={entries}
        currentIndex={0}
        settings={DEFAULT_SESSION_SETTINGS}
        onNavigate={vi.fn()}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByText('Dog 1')).toBeInTheDocument();
  });

  it('next arrow calls onNavigate with index+1', async () => {
    const onNavigate = vi.fn();
    render(
      <SequentialView
        entries={entries}
        currentIndex={0}
        settings={DEFAULT_SESSION_SETTINGS}
        onNavigate={onNavigate}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        isSaving={false}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it('prev arrow calls onNavigate with index-1', async () => {
    const onNavigate = vi.fn();
    render(
      <SequentialView
        entries={entries}
        currentIndex={1}
        settings={DEFAULT_SESSION_SETTINGS}
        onNavigate={onNavigate}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        isSaving={false}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /prev/i }));
    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  it('disables prev at index 0', () => {
    render(
      <SequentialView
        entries={entries}
        currentIndex={0}
        settings={DEFAULT_SESSION_SETTINGS}
        onNavigate={vi.fn()}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
  });
});
