import { screen, within } from '@testing-library/react';
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
vi.mock('@/features/show-workbench/workbenchAnnouncementPost', () => ({
  useWorkbenchAnnouncementPost: () => ({ postAnnouncement: vi.fn() }),
}));

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
  entryRows: [],
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
  entryRows: [],
};

describe('SecretaryCockpitFocusedClass paperwork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('can explicitly record existing paperwork and offers Undo', async () => {
    const { user } = render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
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
        showId="show-1"
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

describe('SecretaryCockpitFocusedClass checklist (MYK9-948)', () => {
  function renderChecklist(source: SecretaryCockpitClass, model: FocusedClassModel = focused) {
    return render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={model}
        sourceClass={source}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={vi.fn()}
      />
    );
  }

  it('lists all seven items with a done count, keeping print controls on print items', () => {
    renderChecklist(sourceClass);

    const checklist = screen.getByRole('region', { name: 'Class checklist' });
    const items = within(checklist).getAllByRole('listitem');
    expect(items.map(item => item.textContent)).toEqual([
      expect.stringContaining('Check-in sheet'),
      expect.stringContaining('Score sheets'),
      expect.stringContaining('Class started'),
      expect.stringContaining('Scoring complete'),
      expect.stringContaining('Preliminary results'),
      expect.stringContaining('Ribbon labels'),
      expect.stringContaining('Judge signature collected'),
    ]);
    expect(within(checklist).getByText('0 of 7 done')).toBeInTheDocument();
    expect(
      within(items[0]!).getByRole('button', { name: 'Record as printed' })
    ).toBeInTheDocument();
    expect(within(items[4]!).getByText('Nothing to print yet')).toBeInTheDocument();
  });

  it('checks items off from class state and print records, in any order', () => {
    renderChecklist(
      {
        ...sourceClass,
        lifecycle: 'complete',
        scoredCount: 8,
        wrapUpStatus: 'needs-judge-signature',
      },
      { ...focused, paperwork: [{ ...focused.paperwork[0]!, state: 'current' }] }
    );

    const checklist = screen.getByRole('region', { name: 'Class checklist' });
    expect(within(checklist).getByText('3 of 7 done')).toBeInTheDocument();
  });

  it('keeps armband labels as other paperwork, outside the checklist', () => {
    renderChecklist(sourceClass, {
      ...focused,
      paperwork: [
        ...focused.paperwork,
        {
          reportId: 'armband-labels',
          label: 'Armband labels',
          state: 'unconfirmed',
          evidence: 'computed',
        },
      ],
    });

    const checklist = screen.getByRole('region', { name: 'Class checklist' });
    expect(within(checklist).queryByText('Armband labels')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Other paperwork' })).toBeInTheDocument();
    expect(screen.getByText('Armband labels')).toBeInTheDocument();
  });
});

// MYK9-954: the Tools "Schedule slip script" moved to where the delay is set.
describe('SecretaryCockpitFocusedClass delay announcement', () => {
  function renderPanel(source: SecretaryCockpitClass, canManageShow = true) {
    return render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={focused}
        sourceClass={source}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow={canManageShow}
        onCommand={vi.fn()}
      />
    );
  }

  it('opens the delay script on this class and the minutes it runs late', async () => {
    // 9:00 AM scheduled; revised to 9:45 AM Chicago time.
    const { user } = renderPanel({
      ...sourceClass,
      revisedExpectedStart: '2026-07-20T14:45:00.000Z',
    });

    await user.click(screen.getByRole('button', { name: 'Announce the delay' }));

    const dialog = screen.getByRole('dialog', { name: 'Announce the delay' });
    expect(within(dialog).getByLabelText('Affected class')).toHaveValue('Container Novice');
    expect(within(dialog).getByLabelText('Delay minutes')).toHaveValue('45');
    expect((within(dialog).getByLabelText('PA script') as HTMLTextAreaElement).value).toContain(
      'about 45 minutes behind'
    );
  });

  it('is not offered when the class is on time, or to a viewer who cannot manage the show', () => {
    const { unmount } = renderPanel(sourceClass);
    expect(screen.queryByRole('button', { name: 'Announce the delay' })).toBeNull();
    unmount();

    renderPanel({ ...sourceClass, revisedExpectedStart: '2026-07-20T14:45:00.000Z' }, false);
    expect(screen.queryByRole('button', { name: 'Announce the delay' })).toBeNull();
  });

  it('is not offered once the class has started, even with a revised start on record', () => {
    renderPanel({
      ...sourceClass,
      lifecycle: 'in-progress',
      revisedExpectedStart: '2026-07-20T14:45:00.000Z',
    });
    expect(screen.queryByRole('button', { name: 'Announce the delay' })).toBeNull();
  });
});
