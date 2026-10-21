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

  describe('with past shows (MYK9-1283)', () => {
    const past = { count: 2, monthLabel: 'October 2026' };
    const sentence = (text: string) => (_: string, el: Element | null) =>
      el?.tagName === 'P' && el.textContent === text;

    it('names the past shows for a signed-out visitor and links to them, keeping the sign-up steps', () => {
      const onShowPast = vi.fn();
      render(
        <ShowsEmptyState filtered={false} onShowAll={vi.fn()} past={past} onShowPast={onShowPast} />
      );
      expect(screen.queryByText('No shows yet')).toBeNull();
      expect(
        screen.getByText(sentence('No upcoming shows. 2 past shows: see October 2026.'))
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'October 2026' }));
      expect(onShowPast).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('link', { name: CREATE_ACCOUNT.label })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: ADD_YOUR_CLUB.label })).toBeInTheDocument();
    });

    it('says "1 past show" for one', () => {
      render(
        <ShowsEmptyState
          filtered={false}
          onShowAll={vi.fn()}
          past={{ count: 1, monthLabel: 'October 2026' }}
          onShowPast={vi.fn()}
        />
      );
      expect(
        screen.getByText(sentence('No upcoming shows. 1 past show: see October 2026.'))
      ).toBeInTheDocument();
    });

    it('gives a signed-in viewer the same past copy, with no sign-up offer', () => {
      auth.user = { id: 'signed-in' };
      render(
        <ShowsEmptyState filtered={false} onShowAll={vi.fn()} past={past} onShowPast={vi.fn()} />
      );
      expect(
        screen.getByText(sentence('No upcoming shows. 2 past shows: see October 2026.'))
      ).toBeInTheDocument();
      expect(screen.queryByRole('link')).toBeNull();
    });
  });
});
