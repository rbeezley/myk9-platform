// apps/myk9show/src/pages/scoring/components/EntryPanel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
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

  it('requires a reason before saving NQ and passes it to onSave', async () => {
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
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText(/reason/i), 'Max Time');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith('NQ', '', 0, 'Max Time');
  });

  it('requires a reason before saving Excused and passes it to onSaveAndNext', async () => {
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

    await userEvent.click(screen.getByRole('button', { name: /^EX$/i }));
    expect(screen.getByRole('button', { name: /save & next/i })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText(/reason/i), 'Handler Request');
    await userEvent.click(screen.getByRole('button', { name: /save & next/i }));

    expect(onSaveAndNext).toHaveBeenCalledWith('EX', '', 0, 'Handler Request');
  });

  it('opens an already-scored entry with its saved result ready to edit', () => {
    render(
      <EntryPanel
        entry={makeEntry({
          isScored: true,
          result: {
            qualification: 'Qualified',
            time: 83450,
            faults: 2,
          },
        })}
        settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />
    );

    expect(screen.getByRole('button', { name: /^Q$/i })).toHaveAttribute('data-selected', 'true');
    expect(screen.getByLabelText(/search time/i)).toHaveValue('12345');
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
  });

  it('opens an already-scored NQ entry with its saved reason ready to edit', () => {
    render(
      <EntryPanel
        entry={makeEntry({
          isScored: true,
          result: {
            qualification: 'Not Qualified',
            time: 0,
            faults: 0,
            reason: 'Incorrect Call',
          },
        })}
        settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />
    );

    expect(screen.getByRole('button', { name: /^NQ$/i })).toHaveAttribute('data-selected', 'true');
    expect(screen.getByLabelText(/reason/i)).toHaveValue('Incorrect Call');
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled();
  });

  it('clears an already-scored result after confirmation', async () => {
    const onClearResult = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);

    render(
      <EntryPanel
        entry={makeEntry({
          isScored: true,
          result: {
            qualification: 'Not Qualified',
            time: 0,
            faults: 0,
            reason: 'Incorrect Call',
          },
        })}
        settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
        onClearResult={onClearResult}
        onClose={vi.fn()}
        isSaving={false}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /clear result/i }));

    expect(window.confirm).toHaveBeenCalledWith('Clear the saved result for Buddy?');
    expect(onClearResult).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
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
    expect(onSaveAndNext).toHaveBeenCalledWith('Q', expect.any(String), 0, undefined);
  });
});
