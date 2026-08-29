import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { HostClubField } from './HostClubField';

describe('HostClubField club-management handoff', () => {
  it('links to the complete club creator instead of opening an inline form', () => {
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
        createClubHref="/clubs?create=true&returnTo=%2Fsecretary%2Fcreate-show%2Fwizard"
      />
    );

    expect(screen.getByRole('link', { name: /create new club/i })).toHaveAttribute(
      'href',
      '/clubs?create=true&returnTo=%2Fsecretary%2Fcreate-show%2Fwizard'
    );
    expect(screen.queryByLabelText(/club name/i)).not.toBeInTheDocument();
  });
});
