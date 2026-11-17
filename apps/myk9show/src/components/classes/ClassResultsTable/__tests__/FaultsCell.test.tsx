import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { FaultsCell } from '../FaultsCell';
import { makeRow } from './rowFixture';

describe('FaultsCell', () => {
  it('renders PendingCell when not visible', () => {
    render(<FaultsCell item={makeRow()} visible={false} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders the value as plain text, with no input to edit it', () => {
    render(<FaultsCell item={makeRow({ faults: '4' })} visible />);
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });
});
