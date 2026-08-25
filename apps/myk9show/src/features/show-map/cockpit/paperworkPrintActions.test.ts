import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaperworkDescriptor } from './paperworkPrintState';

const mocks = vi.hoisted(() => ({
  confirmPrinted: vi.fn(),
  voidPrint: vi.fn(),
  showUndoToast: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedPaperworkPrintsTable: {
    confirmPrinted: mocks.confirmPrinted,
    voidPrint: mocks.voidPrint,
  },
}));

vi.mock('@/lib/undoToast', () => ({ showUndoToast: mocks.showUndoToast }));

import { recordPaperworkPrinted } from './paperworkPrintActions';

const descriptor: PaperworkDescriptor = {
  reportId: 'check-in-sheet',
  scope: { kind: 'show', showId: 'show-1' },
  coverage: {
    scopeKind: 'show',
    scope: { kind: 'show', showId: 'show-1' },
    subjectFingerprints: { 'entry:entry-1': 'fnv1a64:abc' },
    subjectScopes: { 'entry:entry-1': { classIds: ['class-1'], trialIds: ['trial-1'] } },
  },
  fingerprint: 'fnv1a64:report',
};

const user = {
  id: 'user-1',
  email: 'secretary@myk9t.com',
  user_metadata: { full_name: 'Jannie Secretary' },
} as never;

describe('recordPaperworkPrinted', () => {
  beforeEach(() => {
    mocks.confirmPrinted.mockReset();
    mocks.voidPrint.mockReset();
    mocks.showUndoToast.mockReset();
    mocks.confirmPrinted.mockResolvedValue({
      id: 'print-1',
      printedAt: '2026-08-25T12:34:56.000Z',
    });
  });

  it('uses one writer with the authenticated actor and returns its timestamped record', async () => {
    const record = await recordPaperworkPrinted({
      descriptor,
      user,
      message: 'Marked as printed.',
      undoReason: 'Undid print confirmation',
      undoFailureMessage: 'Could not undo that.',
    });

    expect(mocks.confirmPrinted).toHaveBeenCalledTimes(1);
    expect(mocks.confirmPrinted).toHaveBeenCalledWith({
      scope: descriptor.scope,
      reportId: descriptor.reportId,
      coverage: descriptor.coverage,
      fingerprint: descriptor.fingerprint,
      printedBy: 'user-1',
      printedByName: 'Jannie Secretary',
    });
    expect(record).toMatchObject({
      id: 'print-1',
      printedAt: '2026-08-25T12:34:56.000Z',
    });
    expect(mocks.showUndoToast).toHaveBeenCalledTimes(1);
  });
});
