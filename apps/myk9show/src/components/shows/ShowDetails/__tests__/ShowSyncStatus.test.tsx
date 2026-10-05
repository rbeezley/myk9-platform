import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';

import { ShowSyncStatus } from '../ShowSyncStatus';

const mocks = vi.hoisted(() => ({
  sync: {
    status: 'synced' as 'synced' | 'pending' | 'offline' | 'error' | 'conflict',
    queueSize: 0,
    isOnline: true,
    conflictCount: 0,
    errorCount: 0,
  },
}));

vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => mocks.sync,
}));

describe('ShowSyncStatus', () => {
  it('uses calm, truthful offline and pending-save wording', () => {
    mocks.sync.status = 'offline';
    mocks.sync.isOnline = false;
    const { rerender } = render(<ShowSyncStatus />);

    expect(screen.getByRole('status')).toHaveTextContent('Offline · changes saved on this device');

    mocks.sync.status = 'pending';
    mocks.sync.isOnline = true;
    mocks.sync.queueSize = 2;
    rerender(<ShowSyncStatus />);
    expect(screen.getByRole('status')).toHaveTextContent('2 changes saved on this device');

    mocks.sync.queueSize = 1;
    rerender(<ShowSyncStatus />);
    expect(screen.getByRole('status')).toHaveTextContent('1 change saved on this device');

    mocks.sync.status = 'conflict';
    rerender(<ShowSyncStatus />);
    expect(screen.getByRole('status')).toHaveTextContent('Sync needs attention');

    mocks.sync.status = 'synced';
    rerender(<ShowSyncStatus />);
    expect(screen.getByRole('status')).toHaveTextContent('All changes saved');
  });

  it('shrinks to the check mark on a phone only when everything is saved', () => {
    mocks.sync.status = 'synced';
    mocks.sync.isOnline = true;
    const { rerender } = render(<ShowSyncStatus />);
    expect(screen.getByText('All changes saved').className).toContain('sr-only');

    mocks.sync.status = 'conflict';
    rerender(<ShowSyncStatus />);
    expect(screen.getByText('Sync needs attention').className).not.toContain('sr-only');
  });
});
