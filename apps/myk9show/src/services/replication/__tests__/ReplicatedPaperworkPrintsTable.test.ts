import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ReplicatedPaperworkPrintsTable,
  rowToPaperworkPrint,
} from '../ReplicatedPaperworkPrintsTable';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('ReplicatedPaperworkPrintsTable', () => {
  let table: ReplicatedPaperworkPrintsTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedPaperworkPrintsTable();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('queues an append-only Class print confirmation with a stable client id', async () => {
    const queueMutation = vi.spyOn(
      table as unknown as {
        queueMutation: (
          operation: string,
          rowId: string,
          payload: Record<string, unknown>
        ) => Promise<string | null>;
      },
      'queueMutation'
    );

    const record = await table.confirmPrinted({
      id: 'print-1',
      scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId: 'class-1' },
      reportId: 'check-in-sheet',
      coverage: { classIds: ['class-1'] },
      fingerprint: 'sha256:one',
      printedBy: 'user-1',
      printedByName: ' Jamie ',
      printedAt: '2026-07-20T14:00:00.000Z',
    });

    expect(record).toEqual(
      expect.objectContaining({
        id: 'print-1',
        scopeKind: 'class',
        classId: 'class-1',
        printedByName: 'Jamie',
        _syncStatus: 'pending',
        _localOnly: true,
      })
    );
    expect(queueMutation).toHaveBeenCalledWith(
      'INSERT',
      'print-1',
      expect.objectContaining({
        show_id: 'show-1',
        trial_id: 'trial-1',
        class_id: 'class-1',
        report_id: 'check-in-sheet',
        printed_by: 'user-1',
      })
    );
  });

  it('voids without rewriting the original print facts', async () => {
    await table.confirmPrinted({
      id: 'print-1',
      scope: { kind: 'show', showId: 'show-1' },
      reportId: 'armband-labels',
      coverage: { calendarDays: ['2026-07-20'] },
      fingerprint: 'sha256:one',
      printedBy: 'user-1',
      printedByName: 'Jamie',
      printedAt: '2026-07-20T14:00:00.000Z',
    });
    const queueMutation = vi.spyOn(
      table as unknown as {
        queueMutation: (
          operation: string,
          rowId: string,
          payload: Record<string, unknown>
        ) => Promise<string | null>;
      },
      'queueMutation'
    );

    await table.voidPrint({
      id: 'print-1',
      voidedBy: 'user-2',
      reason: ' Wrong stock ',
      voidedAt: '2026-07-20T14:05:00.000Z',
    });

    expect(queueMutation).toHaveBeenLastCalledWith('UPDATE', 'print-1', {
      voided_at: '2026-07-20T14:05:00.000Z',
      voided_by: 'user-2',
      void_reason: 'Wrong stock',
    });
    expect(await table.get('print-1')).toEqual(
      expect.objectContaining({
        reportId: 'armband-labels',
        fingerprint: 'sha256:one',
        voidedBy: 'user-2',
      })
    );
  });

  it('maps versioned remote rows without dropping either secretary record', () => {
    const base = {
      show_id: 'show-1',
      trial_id: null,
      class_id: null,
      scope_kind: 'show' as const,
      report_id: 'armband-labels',
      coverage: {},
      fingerprint: 'sha256:one',
      printed_at: '2026-07-20T14:00:00.000Z',
      voided_at: null,
      voided_by: null,
      void_reason: null,
      version: 1,
      created_at: '2026-07-20T14:00:00.000Z',
      updated_at: '2026-07-20T14:00:00.000Z',
    };
    const records = [
      rowToPaperworkPrint({
        ...base,
        id: 'print-1',
        printed_by: 'user-1',
        printed_by_name: 'Jamie',
      }),
      rowToPaperworkPrint({
        ...base,
        id: 'print-2',
        printed_by: 'user-2',
        printed_by_name: 'Morgan',
      }),
    ];
    expect(records.map(record => record.id)).toEqual(['print-1', 'print-2']);
    expect(records.map(record => record.printedByName)).toEqual(['Jamie', 'Morgan']);
  });

  it('persists an offline confirmation and its full insert payload for later replay', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const queueMutation = vi
      .spyOn(
        table as unknown as {
          queueMutation: (
            operation: string,
            rowId: string,
            payload: Record<string, unknown>
          ) => Promise<string | null>;
        },
        'queueMutation'
      )
      .mockResolvedValue('mutation-1');
    await table.confirmPrinted({
      id: 'offline-print',
      scope: { kind: 'trial', showId: 'show-1', trialId: 'trial-1' },
      reportId: 'scoresheet',
      coverage: { classIds: ['class-1', 'class-2'] },
      fingerprint: 'sha256:offline',
      printedBy: 'user-1',
      printedByName: 'Jamie',
      printedAt: '2026-07-20T14:00:00.000Z',
    });

    expect(queueMutation).toHaveBeenCalledWith(
      'INSERT',
      'offline-print',
      expect.objectContaining({
        id: 'offline-print',
        show_id: 'show-1',
        trial_id: 'trial-1',
        report_id: 'scoresheet',
      })
    );
    expect(await new ReplicatedPaperworkPrintsTable().get('offline-print')).toEqual(
      expect.objectContaining({ _syncStatus: 'pending', _localOnly: true })
    );
    online.mockRestore();
  });

  it('appends concurrent confirmations and reprints without replacing earlier history', async () => {
    const input = {
      scope: { kind: 'class' as const, showId: 'show-1', trialId: 'trial-1', classId: 'class-1' },
      reportId: 'result-labels',
      coverage: { classIds: ['class-1'] },
      fingerprint: 'sha256:results',
    };
    await table.confirmPrinted({
      ...input,
      id: 'print-jamie',
      printedBy: 'user-1',
      printedByName: 'Jamie',
      printedAt: '2026-07-20T14:00:00.000Z',
    });
    await table.confirmPrinted({
      ...input,
      id: 'print-morgan',
      printedBy: 'user-2',
      printedByName: 'Morgan',
      printedAt: '2026-07-20T14:02:00.000Z',
    });

    const history = await table.getByShow('show-1');
    expect(history.map(record => record.id).sort()).toEqual(['print-jamie', 'print-morgan']);
    expect(history.map(record => record.printedByName).sort()).toEqual(['Jamie', 'Morgan']);
  });
});
