import { Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { blockedActionFor } from '@/features/delete/deleteBlockedAction';
import { DeleteObjectDialogView } from '@/features/delete/DeleteObjectDialogView';
import EntryManagementPage from '../EntryManagementPage';

vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: 800 }),
}));
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({
    status: 'resolved',
    canManage: true,
    canOperate: true,
    hasOperationalStaffRole: true,
    clubId: 'club-1',
  }),
}));

vi.mock('@/hooks/useEntryManagementData', async () => {
  const { useEffect, useState } = await import('react');
  const submittedAt = new Date('2026-07-01T14:00:00Z');
  const target = {
    id: 'entry-1',
    registrationId: 'registration-1',
    entryNumber: 'E-1',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Scout',
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName: 'Alice Martin',
    classes: [
      {
        id: 'entry-1',
        classId: 'class-1',
        name: 'Container Novice',
        number: '1',
        fee: 25,
        status: 'entered',
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: 'accepted',
    paymentStatus: 'paid_online',
    isScored: true,
    submittedAt,
    lastUpdated: submittedAt,
  };
  const other = {
    ...target,
    id: 'entry-0',
    registrationId: 'registration-0',
    dogId: 'dog-0',
    dogName: 'Buddy',
    ownerName: 'Bob Smith',
    ownerEmail: 'bob@example.com',
    isScored: false,
    entryStatus: 'pending',
    submittedAt: new Date('2026-07-01T13:00:00Z'),
  };

  return {
    useEntryManagementData: () => {
      const [loaded, setLoaded] = useState(false);
      useEffect(() => {
        const timer = window.setTimeout(() => setLoaded(true), 75);
        return () => window.clearTimeout(timer);
      }, []);
      return {
        user: null,
        hasRole: () => true,
        shows: [{ id: 'show-1', name: 'Demo Show' }],
        selectedShowId: 'show-1',
        isLoadingShows: false,
        entries: loaded ? [other, target] : [],
        setEntries: vi.fn(),
        isLoading: false,
        error: null,
        setError: vi.fn(),
        loadError: null,
        loadedEntriesShowId: loaded ? 'show-1' : null,
        loadEntries: vi.fn(),
        lastEmailedMap: {},
        refreshEmailLog: vi.fn(),
      };
    },
  };
});

vi.mock('@/hooks/useMoveUpRequestsCount', () => ({
  useMoveUpRequestsCount: () => ({ count: 0, isLoading: false }),
}));
vi.mock('@/hooks/useEntryManagementActions', () => ({
  useEntryManagementActions: () => ({
    isProcessing: false,
    armbandDialog: { open: false, entry: null, value: '' },
    setArmbandDialog: vi.fn(),
    handleStatusChange: vi.fn(),
    handleAssignArmband: vi.fn(),
    handleNextArmband: vi.fn(),
    handleEnrollmentBulkStatusChange: vi.fn(),
    handleCheckInStatusChange: vi.fn(),
    handleExportCSV: vi.fn(),
    handleCompEntry: vi.fn(),
    handleUncompEntry: vi.fn(),
    handleRemoveEntry: vi.fn(),
    handleSendDecisionEmail: vi.fn(),
  }),
}));
vi.mock('@/hooks/useEntryManagementTrialScope', () => ({
  useEntryManagementTrialClasses: () => ({
    trialClasses: [],
    trialClassIds: [],
    isLoadingClasses: false,
  }),
  useEntryManagementTrialScope: () => ({ trials: [], isLoadingTrials: false }),
}));
vi.mock('@/components/entries/management', () => ({
  ArmbandDialog: () => null,
  CompEntryDialog: () => null,
}));
vi.mock('../WaitlistManagementPage/index', () => ({ default: () => null }));
vi.mock('@/components/entries/MoveUpRequestsTab', () => ({ MoveUpRequestsTab: () => null }));
vi.mock('@/components/entries/PullManagementTab', () => ({ PullManagementTab: () => null }));
vi.mock('@/features/registration/SecretaryAddEntriesDecision', () => ({
  SecretaryAddEntriesDecision: () => null,
}));
vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn() } }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="recovery-route">{location.pathname + location.search}</output>;
}

describe('blocked scored-entry recovery', () => {
  it('opens the real form and Pull control after delayed compact loading', async () => {
    const target = { id: 'entry-1', name: 'Scout', context: { showId: 'show-1' } };
    const blockedAction = blockedActionFor('entry', [target]);
    expect(blockedAction).toBeDefined();

    const { user } = render(
      <Routes>
        <Route
          path="/blocked-entry"
          element={
            <DeleteObjectDialogView
              open
              onCancel={vi.fn()}
              onConfirm={vi.fn()}
              kind="entry"
              targets={[target]}
              blockedAction={blockedAction}
              previewState={{
                status: 'ready',
                preview: {
                  trials: 0,
                  classes: 0,
                  entries: 1,
                  shows: 0,
                  dogs: 0,
                  paid: 0,
                  scored: 1,
                  blocking: 1,
                },
              }}
            />
          }
        />
        <Route
          path="/shows/:id/entries"
          element={
            <>
              <EntryManagementPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>,
      { initialRoute: '/blocked-entry' }
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'Delete entry' })).toBeDisabled();
    await user.click(within(dialog).getByRole('link', { name: 'Withdraw / Pull entries' }));

    await waitFor(() =>
      expect(screen.getByTestId('recovery-route')).toHaveTextContent(
        '/shows/show-1/entries?queue=all&registration=registration-1'
      )
    );
    const form = await screen.findByRole('region', { name: 'Entry form for Alice Martin' });
    expect(within(form).getAllByText('Scout').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: 'Entry form for Bob Smith' })).toBeNull();

    await user.click(
      within(form).getByRole('button', {
        name: /Accepted, change entry status for Scout in Container Novice/i,
      })
    );
    expect(await screen.findByRole('menuitem', { name: 'Pull' })).toBeVisible();
  });
});
