import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENTRY_STATUS_HISTORY_SELECT,
  getEntryStatusHistory,
  mapEntryStatusHistoryRow,
} from './statusHistory';

const { select, eq, order, logQuery } = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  logQuery: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: { from: vi.fn(() => ({ select, eq, order })) },
  createDatabaseError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  logQuery,
}));

describe('entry status history adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockReturnThis();
    eq.mockReturnThis();
  });

  it('selects and maps generated schema fields without guessing a status property', async () => {
    order.mockResolvedValue({
      data: [
        {
          id: 'history-1',
          entry_id: 'entry-1',
          previous_status: 'submitted',
          new_status: 'confirmed',
          changed_by: 'person-1',
          changed_at: '2026-07-16T12:00:00.000Z',
          reason: 'Accepted by secretary',
          changed_person: { id: 'person-1', first_name: 'Sam', last_name: 'Secretary' },
        },
      ],
      error: null,
    });

    await expect(getEntryStatusHistory('entry-1')).resolves.toEqual([
      {
        id: 'history-1',
        entryId: 'entry-1',
        previousStatus: 'submitted',
        newStatus: 'confirmed',
        changedBy: 'person-1',
        changedAt: '2026-07-16T12:00:00.000Z',
        reason: 'Accepted by secretary',
        actorName: 'Sam Secretary',
      },
    ]);

    expect(select).toHaveBeenCalledWith(ENTRY_STATUS_HISTORY_SELECT);
    expect(ENTRY_STATUS_HISTORY_SELECT).toContain('previous_status');
    expect(ENTRY_STATUS_HISTORY_SELECT).toContain('new_status');
    expect(ENTRY_STATUS_HISTORY_SELECT).toContain('changed_by');
    expect(ENTRY_STATUS_HISTORY_SELECT).toContain('changed_at');
    expect(ENTRY_STATUS_HISTORY_SELECT).toContain('reason');
    expect(ENTRY_STATUS_HISTORY_SELECT).not.toMatch(/\n\s*status[,\n]/);
    expect(eq).toHaveBeenCalledWith('entry_id', 'entry-1');
    expect(order).toHaveBeenCalledWith('changed_at', { ascending: true });
  });

  it('keeps absent actor and reason honest', () => {
    expect(
      mapEntryStatusHistoryRow({
        id: 'history-2',
        entry_id: 'entry-1',
        previous_status: null,
        new_status: 'draft',
        changed_by: null,
        changed_at: null,
        reason: null,
        changed_person: null,
      })
    ).toMatchObject({
      previousStatus: null,
      newStatus: 'draft',
      actorName: null,
      reason: null,
    });
  });
});
