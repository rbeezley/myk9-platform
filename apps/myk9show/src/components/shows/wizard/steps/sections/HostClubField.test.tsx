import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type React from 'react';
import type { Club } from '@/types/club-types';
import { HostClubField } from './HostClubField';

describe('HostClubField club-management handoff', () => {
  // MYK9-2048: adding a club goes through the one form on the home page, not the
  // clubs-page creator and not an inline form.
  it('links to the home page form instead of opening an inline form', () => {
    render(
      <HostClubField
        clubId={undefined}
        clubs={[]}
        filteredClubs={[]}
        showSearch={false}
        setShowSearch={vi.fn()}
        searchTerm=""
        setSearchTerm={vi.fn()}
        onSelectClub={vi.fn()}
      />
    );

    expect(
      screen.getByRole('link', { name: "Your club isn't listed? Add your club" })
    ).toHaveAttribute('href', '/?onboarding=true#get-started');
    expect(screen.queryByLabelText(/club name/i)).not.toBeInTheDocument();
  });
});

describe('HostClubField existing-club clarity (MYK9-889) and permission notice (MYK9-887)', () => {
  const club = {
    id: 'c1',
    name: 'Summit K9 Masters',
    address: { city: 'Denver', state: 'CO' },
  } as unknown as Club;

  const renderField = (props: Partial<React.ComponentProps<typeof HostClubField>> = {}) =>
    render(
      <HostClubField
        clubId="c1"
        clubs={[club]}
        filteredClubs={[club]}
        showSearch={false}
        setShowSearch={vi.fn()}
        searchTerm=""
        setSearchTerm={vi.fn()}
        onSelectClub={vi.fn()}
        {...props}
      />
    );

  it('names the chosen existing club and says nothing needs creating', () => {
    renderField();
    expect(screen.getByText(/Hosting club: Summit K9 Masters/)).toBeInTheDocument();
    expect(screen.getByText(/nothing to create/i)).toBeInTheDocument();
    // The add action stays reachable, but as a quiet text link.
    expect(
      screen.getByRole('link', { name: "Your club isn't listed? Add your club" })
    ).toHaveAttribute('href', '/?onboarding=true#get-started');
  });

  it('frames Add your club as the not-listed path before a club is chosen', () => {
    renderField({ clubId: undefined });
    expect(screen.getByText(/only create a new club if yours is not listed/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /your club isn't listed\? add your club/i })
    ).toBeVisible();
  });

  it('explains missing create permission inline only when denied', () => {
    const { unmount } = renderField({ clubCreateDenied: true });
    expect(screen.getByRole('status')).toHaveTextContent(
      /not a club admin or appointed secretary for Summit K9 Masters/i
    );
    unmount();
    renderField({ clubCreateDenied: false });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
