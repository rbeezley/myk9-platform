import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ExceptionsView } from '../ExceptionsView';

vi.mock('@/components/entries/MoveUpRequestsTab', () => ({
  MoveUpRequestsTab: () => <div data-testid="move-up-requests" />,
}));
vi.mock('@/components/entries/PullManagementTab', () => ({
  PullManagementTab: () => <div data-testid="pull-management" />,
}));

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ExceptionsView showId="show-1" onRefresh={vi.fn()} />
    </MemoryRouter>
  );
}

describe('ExceptionsView', () => {
  it('defaults to the move-ups queue when no ?queue param is present', () => {
    renderAt('/secretary/shows/show-1/entry-management?tab=exceptions');

    expect(screen.getByRole('tab', { name: 'Move-ups' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('move-up-requests')).toBeInTheDocument();
  });

  it('shows the pulls queue when ?queue=pulled', () => {
    renderAt('/secretary/shows/show-1/entry-management?tab=exceptions&queue=pulled');

    expect(screen.getByRole('tab', { name: 'Pulls' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('pull-management')).toBeInTheDocument();
  });

  it('switches queue when the secretary clicks the Pulls sub-tab', () => {
    renderAt('/secretary/shows/show-1/entry-management?tab=exceptions');

    fireEvent.click(screen.getByRole('tab', { name: 'Pulls' }));

    expect(screen.getByRole('tab', { name: 'Pulls' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('pull-management')).toBeInTheDocument();
  });
});
