import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UpcomingShowsTab } from '@/components/clubs/ClubDetails/UpcomingShowsTab';
import { PastShowsTab } from '@/components/clubs/ClubDetails/PastShowsTab';
import type { ClubShow } from '@/components/clubs/ClubDetails/types';

const upcomingShow: ClubShow = {
  id: 'show-upcoming',
  name: 'Autumn Classic',
  date: '2026-10-10',
  location: 'Madison, WI',
  description: 'A fall agility trial.',
};

const pastShow: ClubShow = {
  id: 'show-past',
  name: 'Spring Classic',
  date: '2025-04-12',
  location: 'Madison, WI',
  description: 'A completed agility trial.',
};

const getDirectShowControl = (showName: string) =>
  screen.getByRole('button', { name: `View ${showName}` });

describe('club show card actions', () => {
  it('gives Upcoming and Past action triggers show-specific names and 44px targets', () => {
    const { unmount } = render(
      <UpcomingShowsTab
        shows={[upcomingShow]}
        onViewShowDetails={vi.fn()}
        onRegisterForShow={vi.fn()}
        onAddShow={vi.fn()}
      />
    );

    const upcomingTrigger = screen.getByRole('button', {
      name: 'Actions for Autumn Classic',
    });
    expect(upcomingTrigger).toHaveClass('h-11', 'w-11');
    expect(upcomingTrigger.parentElement?.closest('button, [role="button"], a[href]')).toBeNull();

    unmount();
    render(<PastShowsTab shows={[pastShow]} onViewShowDetails={vi.fn()} />);

    const pastTrigger = screen.getByRole('button', { name: 'Actions for Spring Classic' });
    expect(pastTrigger).toHaveClass('h-11', 'w-11');
    expect(pastTrigger.parentElement?.closest('button, [role="button"], a[href]')).toBeNull();
  });

  it.each(['{Enter}', ' '])(
    'opens the Upcoming show menu with %s without activating the card',
    async activationKey => {
      const onViewShowDetails = vi.fn();
      const { user } = render(
        <UpcomingShowsTab
          shows={[upcomingShow]}
          onViewShowDetails={onViewShowDetails}
          onRegisterForShow={vi.fn()}
          onAddShow={vi.fn()}
        />
      );
      const trigger = screen.getByRole('button', { name: 'Actions for Autumn Classic' });

      trigger.focus();
      await user.keyboard(activationKey);

      expect(await screen.findByRole('menu')).toBeInTheDocument();
      expect(onViewShowDetails).not.toHaveBeenCalled();

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    }
  );

  it('opens the Upcoming action menu by pointer without activating the card', async () => {
    const onViewShowDetails = vi.fn();
    const onRegisterForShow = vi.fn();
    const { user } = render(
      <UpcomingShowsTab
        shows={[upcomingShow]}
        onViewShowDetails={onViewShowDetails}
        onRegisterForShow={onRegisterForShow}
        onAddShow={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Autumn Classic' }));

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(onViewShowDetails).not.toHaveBeenCalled();

    await user.click(screen.getByRole('menuitem', { name: 'Register' }));
    expect(onRegisterForShow).toHaveBeenCalledWith('show-upcoming');
    expect(onViewShowDetails).not.toHaveBeenCalled();
  });

  it.each(['pointer', 'Enter', 'Space'])(
    'keeps direct Upcoming card activation by %s pointed at the existing show destination',
    async activation => {
      const onViewShowDetails = vi.fn();
      const { user } = render(
        <UpcomingShowsTab
          shows={[upcomingShow]}
          onViewShowDetails={onViewShowDetails}
          onRegisterForShow={vi.fn()}
          onAddShow={vi.fn()}
        />
      );

      const directShowControl = getDirectShowControl('Autumn Classic');
      if (activation === 'pointer') {
        await user.click(directShowControl);
      } else {
        directShowControl.focus();
        await user.keyboard(activation === 'Enter' ? '{Enter}' : ' ');
      }

      expect(onViewShowDetails).toHaveBeenCalledWith('show-upcoming');
    }
  );

  it('keeps the Past show trigger independent while preserving direct card navigation', async () => {
    const onViewShowDetails = vi.fn();
    const { user } = render(
      <PastShowsTab shows={[pastShow]} onViewShowDetails={onViewShowDetails} />
    );
    const trigger = screen.getByRole('button', { name: 'Actions for Spring Classic' });

    trigger.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(onViewShowDetails).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();

    const directShowControl = getDirectShowControl('Spring Classic');
    directShowControl.focus();
    await user.keyboard('{Enter}');
    expect(onViewShowDetails).toHaveBeenCalledWith('show-past');
  });
});
