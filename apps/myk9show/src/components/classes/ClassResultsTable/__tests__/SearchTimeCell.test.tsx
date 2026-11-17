import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SearchTimeCell } from '../SearchTimeCell';
import { makeRow } from './rowFixture';

describe('SearchTimeCell', () => {
  it('renders PendingCell when not visible', () => {
    render(<SearchTimeCell item={makeRow({ searchTime: '1:30.00' })} visible={false} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByText('1:30.00')).not.toBeInTheDocument();
  });

  it('renders the time as plain text, with no input or clear button', () => {
    render(<SearchTimeCell item={makeRow({ searchTime: '1:30.00' })} visible />);
    expect(screen.getByText('1:30.00')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Clear time')).not.toBeInTheDocument();
  });

  it('shows a dash when no time was recorded', () => {
    render(<SearchTimeCell item={makeRow()} visible />);
    expect(screen.getByText('--')).toBeInTheDocument();
  });
});
