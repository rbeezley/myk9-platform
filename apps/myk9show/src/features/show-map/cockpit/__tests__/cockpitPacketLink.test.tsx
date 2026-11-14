import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { SecretaryCockpit } from '../SecretaryCockpit';
import type { SecretaryCockpitSnapshot } from '../secretaryCockpitTypes';

vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: null }),
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: () => ({ data: { id: 'show-1', organization: 'AKC' } }),
}));
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
vi.mock('../trialPacket/TrialPacketPanel', () => ({
  TrialPacketPanel: ({ trialId, onClose }: { trialId: string; onClose: () => void }) => (
    <div role="dialog" aria-label="Trial packet">
      <p>Packet for {trialId}</p>
      <button type="button" onClick={onClose}>
        Close packet
      </button>
    </div>
  ),
}));

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  printTrackingInUse: true,
  checklistInUse: true,
  trials: [{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }],
  classes: [],
};

function Harness() {
  const [canManage, setCanManage] = useState(false);
  return (
    <>
      <SecretaryCockpit snapshot={snapshot} canManageShow={canManage} onCommand={vi.fn()} />
      <Link to="/shows/show-1?packet=trial-1">Paperwork link</Link>
      <button type="button" onClick={() => setCanManage(true)}>
        Permissions resolved
      </button>
      <p data-testid="search">{useLocation().search}</p>
    </>
  );
}

describe('the Ready for show day paperwork link, with the cockpit already mounted', () => {
  it('opens the packet panel when ?packet= appears, and clears it when the panel closes', async () => {
    const user = userEvent.setup();
    render(<Harness />, { initialRoute: '/shows/show-1' });
    await user.click(screen.getByRole('button', { name: 'Permissions resolved' }));
    expect(screen.queryByRole('dialog', { name: 'Trial packet' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Paperwork link' }));
    expect(await screen.findByText('Packet for trial-1')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('packet=trial-1');

    await user.click(screen.getByRole('button', { name: 'Close packet' }));
    expect(screen.queryByText('Packet for trial-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  it('keeps the link until permissions resolve, then opens the panel', async () => {
    const user = userEvent.setup();
    render(<Harness />, { initialRoute: '/shows/show-1?packet=trial-1' });
    expect(screen.queryByText('Packet for trial-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('packet=trial-1');

    await user.click(screen.getByRole('button', { name: 'Permissions resolved' }));
    expect(await screen.findByText('Packet for trial-1')).toBeInTheDocument();
  });
});
