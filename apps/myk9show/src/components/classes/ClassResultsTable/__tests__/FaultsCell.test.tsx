import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { FaultsCell } from '../FaultsCell';
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
    isScored: false,
    hasEdits: false,
    ...overrides,
  };
}

describe('FaultsCell', () => {
  it('renders an editable number input with data-index/data-field when canEdit', () => {
    render(
      <FaultsCell
        item={makeRow({ faults: '2' })}
        canEdit={true}
        visible={true}
        rowIndex={3}
        onFieldChange={vi.fn()}
        onKeyDown={vi.fn()}
      />
    );
    const input = screen.getByDisplayValue('2');
    expect(input).toHaveAttribute('data-field', 'faults');
    expect(input).toHaveAttribute('data-index', '3');
  });

  it('fires onFieldChange with the entryId and faults field when edited', async () => {
    const onFieldChange = vi.fn();
    const { user } = render(
      <FaultsCell
        item={makeRow({ faults: '0' })}
        canEdit={true}
        visible={true}
        rowIndex={0}
        onFieldChange={onFieldChange}
        onKeyDown={vi.fn()}
      />
    );
    const input = screen.getByDisplayValue('0');
    await user.type(input, '5');
    expect(onFieldChange).toHaveBeenCalledWith('e1', 'faults', '5');
  });

  it('renders PendingCell when not editable and not visible', () => {
    render(
      <FaultsCell
        item={makeRow()}
        canEdit={false}
        visible={false}
        rowIndex={0}
        onFieldChange={vi.fn()}
        onKeyDown={vi.fn()}
      />
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders plain text value when not editable but visible', () => {
    render(
      <FaultsCell
        item={makeRow({ faults: '4' })}
        canEdit={false}
        visible={true}
        rowIndex={0}
        onFieldChange={vi.fn()}
        onKeyDown={vi.fn()}
      />
    );
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});
