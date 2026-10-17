/**
 * MYK9-1235: registry numbers are online-only, so the offline-first Edit Club panel
 * has no number fields. They are edited from the Club numbers section on the club page.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClubEditPanel } from '../ClubEditPanel';

vi.mock('@/components/shows/WithdrawalPolicyCard', () => ({ WithdrawalPolicyCard: () => null }));

function renderPanel(mode: 'create' | 'edit') {
  render(
    <ClubEditPanel
      open
      onClose={() => {}}
      clubId="club-1"
      clubName="Heartland"
      initialClubData={{ id: 'club-1', name: 'Heartland' }}
      mode={mode}
    />
  );
}

describe('ClubEditPanel club numbers', () => {
  it('renders no club number fields when editing', async () => {
    renderPanel('edit');
    expect(await screen.findByRole('textbox', { name: /Club Name/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(/club number/i)).not.toBeInTheDocument();
  });

  it('points a new club at the Club numbers section', async () => {
    renderPanel('create');
    expect(await screen.findByText(/Club numbers section on the club page/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/club number/i)).not.toBeInTheDocument();
  });
});
