import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { PublishBlockersList } from '../PublishBlockersList';
import { PUBLISH_BLOCKER_KEYS } from '../publishBlockers';

const none = () => undefined;

describe('PublishBlockersList (MYK9-2198)', () => {
  it('renders one row per line the server returned, in order, with who it waits on', () => {
    render(
      <PublishBlockersList
        viewerIsClubAdmin={false}
        fixFor={key =>
          key.key === 'premium_not_published' ? { href: '/shows/s1/about' } : undefined
        }
        state={{
          state: 'ready',
          blockers: [
            { key: 'club_not_approved', waitingOn: 'myk9', eta: 'about a day' },
            { key: 'payouts_not_enabled', waitingOn: 'club_admin', eta: null },
            { key: 'premium_not_published', waitingOn: 'secretary', eta: null },
          ],
        }}
      />
    );

    expect(screen.getByText('Before you can publish')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Your club is waiting for myK9Show approval.')).toBeInTheDocument();
    expect(screen.getByText('Waiting on myK9Show, usually about a day')).toBeInTheDocument();
    expect(screen.getByText('Waiting on your club admin')).toBeInTheDocument();
    // The secretary's own line names no one else.
    expect(screen.getAllByText(/^Waiting on/)).toHaveLength(2);
    expect(screen.getByRole('link', { name: /fix it: publish the premium list/i })).toHaveAttribute(
      'href',
      '/shows/s1/about'
    );
  });

  it('renders every one of the six keys', () => {
    render(
      <PublishBlockersList
        viewerIsClubAdmin
        fixFor={none}
        state={{
          state: 'ready',
          blockers: PUBLISH_BLOCKER_KEYS.map(key => ({ key, waitingOn: null, eta: null })),
        }}
      />
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
  });

  it('opens the place to fix it through onFix', async () => {
    const onFix = vi.fn();
    render(
      <PublishBlockersList
        viewerIsClubAdmin={false}
        fixFor={() => ({ onFix })}
        state={{
          state: 'ready',
          blockers: [{ key: 'entry_dates_missing', waitingOn: 'secretary', eta: null }],
        }}
      />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: /fix it/i }));
    expect(onFix).toHaveBeenCalledTimes(1);
  });

  it('renders nothing only for a ready, empty list', () => {
    const { container } = render(
      <PublishBlockersList
        viewerIsClubAdmin={false}
        fixFor={none}
        state={{ state: 'ready', blockers: [] }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('says it is checking while the first answer is pending', () => {
    render(
      <PublishBlockersList
        viewerIsClubAdmin={false}
        fixFor={none}
        state={{ state: 'checking', blockers: [] }}
      />
    );
    expect(screen.getByText('Checking what blocks publishing…')).toBeInTheDocument();
  });

  it('says it is offline, with no retry', () => {
    render(
      <PublishBlockersList
        viewerIsClubAdmin={false}
        fixFor={none}
        state={{ state: 'offline', blockers: [] }}
      />
    );
    expect(
      screen.getByText('You are offline. Reconnect to see what blocks publishing.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says it could not check, with a retry, when the answer is unreadable', async () => {
    const retry = vi.fn();
    render(
      <PublishBlockersList
        viewerIsClubAdmin={false}
        fixFor={none}
        state={{ state: 'failed', blockers: [], retry }}
      />
    );
    expect(
      screen.getByText('Could not check what blocks publishing. Try again.')
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
