// apps/myk9show/src/pages/scoring/components/SplitPanelView.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { SplitPanelView } from './SplitPanelView';
import { DEFAULT_SESSION_SETTINGS } from '../paper-scoring-types';
import type { ScoringEntry } from '../types';

function makeEntry(id: string, order: number, overrides: Partial<ScoringEntry> = {}): ScoringEntry {
  return {
    id: order,
    entryId: id,
    classId: 'c1',
    dogId: 'd1',
    callName: `Dog ${order}`,
    handler: 'Smith',
    breed: 'Lab',
    armband: 100 + order,
    status: 'pending',
    inRing: false,
    isScored: false,
    exhibitorOrder: order,
    ...overrides,
  };
}

const entries = [makeEntry('e1', 1), makeEntry('e2', 2)];

describe('SplitPanelView', () => {
  it('renders all entry rows', () => {
    render(
      <SplitPanelView
        entries={entries}
        settings={DEFAULT_SESSION_SETTINGS}
        selectedEntryId={null}
        onSelectEntry={vi.fn()}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByText('Dog 1')).toBeInTheDocument();
    expect(screen.getByText('Dog 2')).toBeInTheDocument();
  });

  it('does not render panel when no entry selected', () => {
    render(
      <SplitPanelView
        entries={entries}
        settings={DEFAULT_SESSION_SETTINGS}
        selectedEntryId={null}
        onSelectEntry={vi.fn()}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.queryByText(/result/i)).not.toBeInTheDocument();
  });

  it('renders panel when entry is selected', () => {
    render(
      <SplitPanelView
        entries={entries}
        settings={DEFAULT_SESSION_SETTINGS}
        selectedEntryId="e1"
        onSelectEntry={vi.fn()}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByText(/result/i)).toBeInTheDocument();
  });

  it('calls onSelectEntry when a row is clicked', async () => {
    const onSelectEntry = vi.fn();
    render(
      <SplitPanelView
        entries={entries}
        settings={DEFAULT_SESSION_SETTINGS}
        selectedEntryId={null}
        onSelectEntry={onSelectEntry}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        isSaving={false}
      />
    );
    await userEvent.click(screen.getAllByRole('button')[0]);
    expect(onSelectEntry).toHaveBeenCalledWith('e1');
  });
});
