import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ADD_YOUR_CLUB, CREATE_ACCOUNT } from '@/components/landing/lifecycle/landingCtas';
import { ShowsEmptyState } from '../ShowsEmptyState';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: auth.user }) }));

describe('ShowsEmptyState (MYK9-1152)', () => {
  afterEach(() => {
    auth.user = null;
  });

  it('gives a signed-out visitor the homepage next steps, with the homepage labels', () => {
    render(<ShowsEmptyState filtered={false} onShowAll={vi.fn()} />);
    expect(screen.getByText('No shows yet')).toBeInTheDocument();
    expect(screen.getByText('Shows appear here as clubs publish them.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: CREATE_ACCOUNT.label })).toHaveAttribute(
      'href',
      '/sign-up'
    );
    expect(screen.getByRole('link', { name: ADD_YOUR_CLUB.label })).toHaveAttribute(
      'href',
      '/#get-started'
    );
  });

  it('keeps the signed-in empty state as it was, with no sign-up offer', () => {
    auth.user = { id: 'signed-in' };
    render(<ShowsEmptyState filtered={false} onShowAll={vi.fn()} />);
    expect(screen.getByText('No shows yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Shows will appear here as they are added. Try searching by discipline or club name above.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('keeps the filtered state for a signed-out visitor, with Show all and no sign-up offer', () => {
    const onShowAll = vi.fn();
    render(<ShowsEmptyState filtered onShowAll={onShowAll} />);
    expect(screen.getByText('No shows match your search or filters.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: CREATE_ACCOUNT.label })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all shows' }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });
});
