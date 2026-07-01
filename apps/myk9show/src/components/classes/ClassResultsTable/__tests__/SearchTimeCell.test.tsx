import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SearchTimeCell } from '../SearchTimeCell';
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

describe('SearchTimeCell', () => {
  it('renders an editable time input when canEdit', () => {
    render(
      <SearchTimeCell
        item={makeRow({ searchTime: '1:30.00' })}
        canEdit={true}
        visible={true}
        rowIndex={0}
        onFieldChange={vi.fn()}
      />
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows the clear (X) button only when searchTime is non-empty', () => {
    const { rerender } = render(
      <SearchTimeCell
        item={makeRow({ searchTime: '' })}
        canEdit={true}
        visible={true}
        rowIndex={0}
        onFieldChange={vi.fn()}
      />
    );
    expect(screen.queryByTitle('Clear time')).not.toBeInTheDocument();

    rerender(
      <SearchTimeCell
        item={makeRow({ searchTime: '1:30.00' })}
        canEdit={true}
        visible={true}
        rowIndex={0}
        onFieldChange={vi.fn()}
      />
    );
    expect(screen.getByTitle('Clear time')).toBeInTheDocument();
  });

  it('fires onFieldChange with empty string for searchTime when clear is clicked', async () => {
    const onFieldChange = vi.fn();
    const { user } = render(
      <SearchTimeCell
        item={makeRow({ searchTime: '1:30.00' })}
        canEdit={true}
        visible={true}
        rowIndex={0}
        onFieldChange={onFieldChange}
      />
    );
    await user.click(screen.getByTitle('Clear time'));
    expect(onFieldChange).toHaveBeenCalledWith('e1', 'searchTime', '');
  });

  it('renders PendingCell when not editable and not visible', () => {
    render(
      <SearchTimeCell
        item={makeRow()}
        canEdit={false}
        visible={false}
        rowIndex={0}
        onFieldChange={vi.fn()}
      />
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders the read-only value when not editable but visible', () => {
    render(
      <SearchTimeCell
        item={makeRow({ searchTime: '1:30.00' })}
        canEdit={false}
        visible={true}
        rowIndex={0}
        onFieldChange={vi.fn()}
      />
    );
    expect(screen.getByText('1:30.00')).toBeInTheDocument();
  });

  it('renders a placeholder dash when not editable, visible, and searchTime is empty', () => {
    render(
      <SearchTimeCell
        item={makeRow({ searchTime: '' })}
        canEdit={false}
        visible={true}
        rowIndex={0}
        onFieldChange={vi.fn()}
      />
    );
    expect(screen.getByText('--')).toBeInTheDocument();
  });
});
