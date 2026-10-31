/**
 * MYK9-1627: ringside Class Settings is two links into the existing secretary controls, shown
 * only to someone the target pages admit, and held back while offline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';

const state = vi.hoisted(() => ({
  scope: { status: 'resolved', canManage: true } as { status: string; canManage: boolean },
  online: true,
}));
vi.mock('@/hooks/useShowManageScope', () => ({ useShowManageScope: () => state.scope }));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => state.online }));

import { ClassSettingsDialog } from './classDialogs';

const classData = { id: 'c1', element: 'Interior', level: 'Novice', class_name: 'Interior Novice' };

function renderDialog(onClose = vi.fn()) {
  render(
    <Routes>
      <Route
        path="/at-show/:showId/*"
        element={<ClassSettingsDialog isOpen onClose={onClose} classData={classData} />}
      />
    </Routes>,
    { initialRoute: '/at-show/show-1/class/c1' }
  );
}

beforeEach(() => {
  state.scope = { status: 'resolved', canManage: true };
  state.online = true;
});

describe('ClassSettingsDialog (MYK9-1627)', () => {
  it('links to the existing controls with this class', () => {
    renderDialog();
    expect(screen.getByText('You will pick this class on the next page.')).toBeInTheDocument();
    expect(screen.getByText('Opens Self check-in on the Show Desk')).toBeInTheDocument();
    expect(screen.getByText('Opens Results visibility on the Results tab')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Check-in mode/ })).toHaveAttribute(
      'href',
      '/shows/show-1?tool=self-checkin&focus=c1'
    );
    expect(screen.getByRole('link', { name: /Results visibility/ })).toHaveAttribute(
      'href',
      '/shows/show-1/results?classId=c1&visibility=1'
    );
  });

  it('offers no link to someone the target pages would turn away', () => {
    state.scope = { status: 'resolved', canManage: false };
    renderDialog();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/pick this class/)).not.toBeInTheDocument();
  });

  it('disables both links with a reason while offline', () => {
    state.online = false;
    renderDialog();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check-in mode/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Results visibility/ })).toBeDisabled();
    expect(screen.getAllByText(/Needs a connection/)).toHaveLength(2);
  });
});
