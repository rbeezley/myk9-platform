import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { replicatedPaperworkPrintsTable } from '@/services/replication';
import { showUndoToast } from '@/lib/undoToast';

import { SecretaryCockpitFocusedClass } from './SecretaryCockpitFocusedClass';
import type { FocusedClassModel, SecretaryCockpitClass } from './secretaryCockpitTypes';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: {
      id: 'user-1',
      email: 'secretary@example.com',
      user_metadata: { full_name: 'Jannie' },
    },
  }),
}));
vi.mock('@/services/replication', () => ({
  replicatedPaperworkPrintsTable: {
    confirmPrinted: vi.fn(async () => ({ id: 'print-1' })),
    voidPrint: vi.fn(async () => undefined),
  },
}));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const focused: FocusedClassModel = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice',
  timeLabel: '9:00 AM',
  scheduledStart: '9:00 AM',
  expectedStart: '9:00 AM',
  lifecycle: { evidence: 'recorded', value: 'not-started' },
  progress: { evidence: 'computed', value: { completed: 0, total: 8 } },
  operationalArea: { evidence: 'unknown', value: null },
  judgeName: null,
  attentionCount: 0,
  closeout: 'none',
  primaryAction: null,
  actualStart: { evidence: 'unknown', value: null },
  actualFinish: { evidence: 'unknown', value: null },
  paperwork: [
    {
      reportId: 'check-in-sheet',
      label: 'Check-in sheet',
      state: 'unconfirmed',
      evidence: 'unknown',
      confirmation: {
        scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId: 'class-1' },
        coverage: { scopeKind: 'class', subjectFingerprints: { 'entry:1': 'fingerprint' } },
        fingerprint: 'document-fingerprint',
      },
    },
  ],
  primaryActions: [],
  prepareActions: [],
  finishActions: [],
  classWorkActions: [],
};

const sourceClass: SecretaryCockpitClass = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice',
  classOrder: 0,
  scheduledStart: '9:00 AM',
  lifecycle: 'not-started',
  entryCount: 8,
  scoredCount: 0,
  attention: [],
  actions: [],
  paperwork: [],
};

describe('SecretaryCockpitFocusedClass paperwork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('can explicitly record existing paperwork and offers Undo', async () => {
    const { user } = render(
      <SecretaryCockpitFocusedClass
        focused={focused}
        sourceClass={sourceClass}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Record as printed' }));
    expect(
      screen.getByRole('heading', { name: 'Did the Check-in sheet print correctly?' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark printed' }));

    expect(replicatedPaperworkPrintsTable.confirmPrinted).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: 'check-in-sheet',
        printedBy: 'user-1',
        printedByName: 'Jannie',
      })
    );
    expect(showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Check-in sheet recorded as printed.' })
    );
    expect(screen.getByText('Not confirmed printed')).toBeInTheDocument();
  });

  it('shows stale broader-scope print evidence and append-only history', async () => {
    const staleFocused: FocusedClassModel = {
      ...focused,
      paperwork: [
        {
          ...focused.paperwork[0]!,
          state: 'stale',
          printedAt: '2026-07-20T14:42:00.000Z',
          printedBy: 'Jannie',
          coveredByScope: 'trial',
          printHref: '/shows/show-1/reports?scope=class',
          history: [
            {
              id: 'print-2',
              printedAt: '2026-07-20T14:42:00.000Z',
              printedBy: 'Jannie',
            },
            {
              id: 'print-1',
              printedAt: '2026-07-20T14:10:00.000Z',
              printedBy: 'Morgan',
              voidedAt: '2026-07-20T14:15:00.000Z',
            },
          ],
        },
      ],
    };
    const { user } = render(
      <SecretaryCockpitFocusedClass
        focused={staleFocused}
        sourceClass={sourceClass}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={vi.fn()}
      />
    );

    expect(screen.getByText(/Printed 9:42 AM by Jannie · Trial scope/)).toBeInTheDocument();
    expect(screen.getByText(/Class data changed after printing/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review and reprint/i })).toBeInTheDocument();

    await user.click(screen.getByText('Print history (2)'));
    expect(screen.getByText(/9:10 AM by Morgan · marked incorrect/)).toBeInTheDocument();
  });
});
