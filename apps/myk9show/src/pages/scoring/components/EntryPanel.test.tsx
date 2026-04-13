// apps/myk9show/src/pages/scoring/components/EntryPanel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { EntryPanel } from './EntryPanel';
import { DEFAULT_SESSION_SETTINGS } from '../paper-scoring-types';
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

describe('EntryPanel', () => {
  it('shows dog name and armband', () => {
    render(
      <EntryPanel
        entry={makeEntry()}
        settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
  });

  it('shows Q NQ ABS EX result buttons', () => {
    render(
      <EntryPanel
        entry={makeEntry()}
        settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByRole('button', { name: /^Q$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^NQ$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ABS$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^EX$/i })).toBeInTheDocument();
  });

  it('does not show time field before a result is selected', () => {
    render(
      <EntryPanel
        entry={makeEntry()}
        settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.queryByPlaceholderText(/time/i)).not.toBeInTheDocument();
  });

  it('reveals time field when Q is selected', async () => {
    render(
      <EntryPanel
        entry={makeEntry()}
        settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /^Q$/i }));
    expect(screen.getByLabelText(/search time/i)).toBeInTheDocument();
  });

  it('does not reveal time field when NQ selected in q-only mode', async () => {
    const onSave = vi.fn();
    render(
      <EntryPanel
        entry={makeEntry()}
        settings={DEFAULT_SESSION_SETTINGS}
        onSave={onSave}
        onSaveAndNext={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /^NQ$/i }));
    expect(screen.queryByLabelText(/search time/i)).not.toBeInTheDocument();
    // Auto-saves immediately for NQ in q-only mode (no pre-fill)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('NQ', '', 0));
  });

  it('reveals time field for NQ in all-runs mode', async () => {
    render(
      <EntryPanel
        entry={makeEntry()}
        settings={{ preFill: 'none', timeRecordMode: 'all-runs' }}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /^NQ$/i }));
    expect(screen.getByLabelText(/search time/i)).toBeInTheDocument();
  });

  it('pre-fill: Q pre-highlighted with Save & Next visible', () => {
    render(
      <EntryPanel
        entry={makeEntry()}
        settings={{ preFill: 'Q', timeRecordMode: 'q-only' }}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByRole('button', { name: /^Q$/i })).toHaveAttribute('data-prefilled', 'true');
    expect(screen.getByRole('button', { name: /save & next/i })).toBeInTheDocument();
    // Time field shown because Q is pre-filled
    expect(screen.getByLabelText(/search time/i)).toBeInTheDocument();
  });

  it('pre-fill: NQ does not auto-save on open — shows Save buttons instead', () => {
    const onSave = vi.fn();
    render(
      <EntryPanel
        entry={makeEntry()}
        settings={{ preFill: 'NQ', timeRecordMode: 'q-only' }}
        onSave={onSave}
        onSaveAndNext={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /save & next/i })).toBeInTheDocument();
  });

  it('Save & Next calls onSaveAndNext with result, timeDigits, faults', async () => {
    const onSaveAndNext = vi.fn();
    render(
      <EntryPanel
        entry={makeEntry()}
        settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()}
        onSaveAndNext={onSaveAndNext}
        onClose={vi.fn()}
        isSaving={false}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /^Q$/i }));
    await userEvent.click(screen.getByRole('button', { name: /save & next/i }));
    expect(onSaveAndNext).toHaveBeenCalledWith('Q', expect.any(String), 0);
  });
});
