import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { PlacementCell } from '../PlacementCell';
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

describe('PlacementCell', () => {
  it('renders PendingCell when not visible', () => {
    render(<PlacementCell item={makeRow({ placement: 1 })} visible={false} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders a placement badge with ordinal text when visible and placed', () => {
    render(<PlacementCell item={makeRow({ placement: 1 })} visible={true} />);
    expect(screen.getByText('1st')).toBeInTheDocument();
  });

  it('renders a placeholder dash when visible with no placement', () => {
    render(<PlacementCell item={makeRow({ placement: null })} visible={true} />);
    expect(screen.getByText('--')).toBeInTheDocument();
  });
});
