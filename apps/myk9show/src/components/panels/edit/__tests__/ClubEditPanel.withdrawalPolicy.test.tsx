/**
 * MYK9-454 — the club withdrawal-policy card is an EDIT-only section.
 *
 * `WithdrawalPolicyCard` reads and writes the club row directly, so on a club
 * that does not exist yet it has nothing to act on. It also asks a settings
 * question in the middle of a creation form — most visibly inside the
 * create-show wizard, where the club is being made only so a show can hang off
 * it.
 *
 * These assert on the RENDERED panel rather than on the `mode` prop: `mode`
 * already existed and only drove the title and the save label, which is exactly
 * how the section stayed visible on create.
 */

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClubEditPanel } from '../ClubEditPanel';

vi.mock('@/components/shows/WithdrawalPolicyCard', () => ({
  WithdrawalPolicyCard: ({ scope }: { scope: string }) => (
    <div data-testid="withdrawal-policy-card">policy card ({scope})</div>
  ),
}));

const club = { id: 'club-1', name: 'Heartland Scent Work Club' };

function renderPanel(mode: 'create' | 'edit') {
  return render(
    <ClubEditPanel
      open
      onClose={() => {}}
      clubId={club.id}
      clubName={club.name}
      initialClubData={club}
      mode={mode}
    />
  );
}

describe('ClubEditPanel — withdrawal policy section', () => {
  it('shows the policy card when editing an existing club', async () => {
    renderPanel('edit');
    await waitFor(() => {
      expect(screen.getByTestId('withdrawal-policy-card')).toBeInTheDocument();
    });
  });

  it('does not ask for a refund policy while creating a club', async () => {
    renderPanel('create');
    // Positive control: the panel really did render in create mode, so the
    // absence below is a hidden section and not an empty render.
    await waitFor(() => {
      expect(screen.getByText('Fill in the details for your new club')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('withdrawal-policy-card')).not.toBeInTheDocument();
  });
});
