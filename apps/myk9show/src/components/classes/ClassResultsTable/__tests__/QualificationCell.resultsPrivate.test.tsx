import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { QualificationCell } from '../QualificationCell';
import { PodiumPosition } from '@/components/results/PodiumPosition';
import { RESULTS_PRIVATE_LABEL, PRIVATE_ENTRY_LABEL } from '@/lib/resultsPrivacy';
import type { ScoringRow } from '../types';

function makeRow(overrides: Partial<ScoringRow> = {}): ScoringRow {
  return {
    entryId: 'e1',
    armband: '101',
    dogName: 'Rex',
    dogBreed: 'Labrador',
    handlerName: 'Alice Smith',
    qualification: '',
    qualificationReason: '',
    searchTime: '',
    faults: '0',
    notes: '',
    placement: null,
    checkInStatus: 'no-status',
    isScored: true,
    hasEdits: false,
    ...overrides,
  };
}

describe('"Results private" rendering (MYK9-969)', () => {
  it('a scored entry whose results the server hid reads "Results private", not "Not Set"', () => {
    render(
      <QualificationCell
        item={makeRow({ resultsPrivate: true })}
        canEdit={false}
        visible
        onUpdate={vi.fn()}
      />
    );
    expect(screen.getByText(RESULTS_PRIVATE_LABEL)).toBeInTheDocument();
    expect(screen.queryByText('Not Set')).not.toBeInTheDocument();
  });

  it('a visible qualification on an anonymised row still shows (it names no one)', () => {
    render(
      <QualificationCell
        item={makeRow({ resultsPrivate: true, qualification: 'Qualified' })}
        canEdit={false}
        visible
        onUpdate={vi.fn()}
      />
    );
    expect(screen.queryByText(RESULTS_PRIVATE_LABEL)).not.toBeInTheDocument();
  });

  it('an unscored public row is unchanged', () => {
    render(<QualificationCell item={makeRow()} canEdit={false} visible onUpdate={vi.fn()} />);
    expect(screen.getByText('Not Set')).toBeInTheDocument();
  });

  it('the podium shows "Private entry" at its place with no handler, breed or quotes', () => {
    render(
      <PodiumPosition
        placement={1}
        handlerName=""
        dogName={PRIVATE_ENTRY_LABEL}
        breed=""
        armband={null}
        isPrivate
      />
    );
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.getByText(PRIVATE_ENTRY_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(/“Private entry”/)).not.toBeInTheDocument();
  });
});
