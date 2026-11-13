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
    expect(screen.getByText(/1 of 3 scored/i)).toBeInTheDocument();
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

  // MYK9-1905: Cancel did nothing in card view. It discards what was typed and
  // shows the dog's saved values again; the dog stays on screen.
  it('Cancel discards a typed time and shows the saved one again', async () => {
    const saved = {
      ...makeEntry('e1', 1, true),
      result: { qualification: 'Qualified' as const, time: 83450, faults: 2 },
    };
    render(
      <SequentialView
        entries={[saved, makeEntry('e2', 2)]}
        currentIndex={0}
        settings={DEFAULT_SESSION_SETTINGS}
        onNavigate={vi.fn()}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        isSaving={false}
      />
    );
    const time = screen.getByLabelText(/search time/i);
    expect(time).toHaveValue('12345');
    await userEvent.clear(time);
    await userEvent.type(time, '99999');
    expect(screen.getByLabelText(/search time/i)).toHaveValue('99999');

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.getByLabelText(/search time/i)).toHaveValue('12345');
    expect(screen.getByText('Dog 1')).toBeInTheDocument();
  });

  it('Cancel puts an unscored dog back to no result chosen', async () => {
    render(
      <SequentialView
        entries={[makeEntry('e1', 1), makeEntry('e2', 2)]}
        currentIndex={0}
        settings={DEFAULT_SESSION_SETTINGS}
        onNavigate={vi.fn()}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        isSaving={false}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /^Q$/i }));
    expect(screen.getByLabelText(/search time/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByLabelText(/search time/i)).not.toBeInTheDocument();
    expect(screen.getByText('Dog 1')).toBeInTheDocument();
  });
});
