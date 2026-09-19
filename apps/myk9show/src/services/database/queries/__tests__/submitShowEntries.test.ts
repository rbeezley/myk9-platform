import { createDatabaseError } from '@/services/database/databaseError';
import { getErrorMessage } from '@myk9/core';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitShowEntries, updateEntryHandler } from '../../entries';

// Mock the supabase client used by the entries module
const mockRpc = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
  logQuery: vi.fn(),
  createDatabaseError,
}));

const baseParams = {
  showId: 'show-uuid-1',
  registrationId: 'enrollment-uuid-1',
  entries: [
    {
      dogId: 'dog-uuid-1',
      classId: 'class-uuid-1',
      handlerId: 'handler-uuid-1',
      handlerName: 'Jane Doe',
      paymentMethod: 'credit_card',
      clientFeeCents: 2500,
    },
    {
      dogId: 'dog-uuid-2',
      classId: 'class-uuid-2',
      handlerName: 'John Doe',
      paymentMethod: 'credit_card',
      clientFeeCents: 2500,
    },
  ],
  submissionId: 'sub-uuid-1',
  paymentMethod: 'credit_card',
  submissionSource: 'self_service' as const,
};

const rpcSuccess = {
  data: {
    entries: [
      { entry_id: 'e1', dog_id: 'dog-uuid-1' },
      { entry_id: 'e2', dog_id: 'dog-uuid-2' },
    ],
    registration_id: 'enrollment-uuid-1',
    submission_id: 'sub-uuid-1',
  },
  error: null,
};

describe('submitShowEntries', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('happy path — returns mapped result on success', async () => {
    mockRpc.mockResolvedValue(rpcSuccess);

    const result = await submitShowEntries(baseParams);

    expect(mockRpc).toHaveBeenCalledWith('submit_show_entries', {
      p_show_id: 'show-uuid-1',
      p_registration_id: 'enrollment-uuid-1',
      p_entries: [
        {
          dog_id: 'dog-uuid-1',
          class_id: 'class-uuid-1',
          handler_id: 'handler-uuid-1',
          handler_name: 'Jane Doe',
          payment_method: 'credit_card',
          client_fee_cents: 2500,
          submission_source: 'self_service',
        },
        {
          dog_id: 'dog-uuid-2',
          class_id: 'class-uuid-2',
          handler_id: null,
          handler_name: 'John Doe',
          payment_method: 'credit_card',
          client_fee_cents: 2500,
          submission_source: 'self_service',
        },
      ],
      p_submission_id: 'sub-uuid-1',
      p_payment_method: 'credit_card',
    });

    expect(result).toEqual({
      entries: [
        { entryId: 'e1', dogId: 'dog-uuid-1' },
        { entryId: 'e2', dogId: 'dog-uuid-2' },
      ],
      registrationId: 'enrollment-uuid-1',
      submissionId: 'sub-uuid-1',
      outcomes: [
        {
          dogId: 'dog-uuid-1',
          classId: 'class-uuid-1',
          outcome: 'created',
          entryId: 'e1',
          waitlistEntryId: null,
          waitlistPosition: null,
          feeCents: 2500,
          capacityOverride: false,
          denialReason: null,
        },
        {
          dogId: 'dog-uuid-2',
          classId: 'class-uuid-2',
          outcome: 'created',
          entryId: 'e2',
          waitlistEntryId: null,
          waitlistPosition: null,
          feeCents: 2500,
          capacityOverride: false,
          denialReason: null,
        },
      ],
    });
  });

  it('idempotent retry — same submissionId returns the same result on second call', async () => {
    // Both calls return the same data (RPC handles idempotency internally)
    mockRpc.mockResolvedValue(rpcSuccess);

    const first = await submitShowEntries(baseParams);
    const second = await submitShowEntries(baseParams);

    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(first).toEqual(second);
    expect(first.entries).toEqual([
      { entryId: 'e1', dogId: 'dog-uuid-1' },
      { entryId: 'e2', dogId: 'dog-uuid-2' },
    ]);
  });

  it('RPC error — throws when supabase returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'fee mismatch', code: '22023' },
    });

    await expect(submitShowEntries(baseParams)).rejects.toThrow('fee mismatch');
  });

  it('sends the verified source and maps mixed capacity outcomes', async () => {
    mockRpc.mockResolvedValue({
      data: {
        entries: [{ entry_id: 'e1', dog_id: 'dog-uuid-1' }],
        outcomes: [
          {
            dog_id: 'dog-uuid-1',
            class_id: 'class-uuid-1',
            outcome: 'created',
            entry_id: 'e1',
            waitlist_entry_id: null,
            fee_cents: 2500,
            capacity_override: false,
            denial_reason: null,
          },
          {
            dog_id: 'dog-uuid-2',
            class_id: 'class-uuid-2',
            outcome: 'waitlisted',
            entry_id: null,
            waitlist_entry_id: 'wait-2',
            fee_cents: 0,
            capacity_override: false,
            denial_reason: null,
          },
          {
            dog_id: 'dog-uuid-2',
            class_id: 'class-uuid-1',
            outcome: 'denied',
            entry_id: null,
            waitlist_entry_id: null,
            fee_cents: 0,
            capacity_override: false,
            denial_reason: 'dog already on this class wait list for a different exhibitor',
          },
        ],
        registration_id: 'enrollment-uuid-1',
        submission_id: 'sub-uuid-1',
      },
      error: null,
    });

    const result = await submitShowEntries({
      ...baseParams,
      submissionSource: 'organizer',
    } as Parameters<typeof submitShowEntries>[0]);

    expect(mockRpc).toHaveBeenCalledWith(
      'submit_show_entries',
      expect.objectContaining({
        p_entries: expect.arrayContaining([
          expect.objectContaining({ submission_source: 'organizer' }),
        ]),
      })
    );
    expect(result.outcomes).toEqual([
      {
        dogId: 'dog-uuid-1',
        classId: 'class-uuid-1',
        outcome: 'created',
        entryId: 'e1',
        waitlistEntryId: null,
        waitlistPosition: null,
        feeCents: 2500,
        capacityOverride: false,
        denialReason: null,
      },
      {
        dogId: 'dog-uuid-2',
        classId: 'class-uuid-2',
        outcome: 'waitlisted',
        entryId: null,
        waitlistEntryId: 'wait-2',
        waitlistPosition: null,
        feeCents: 0,
        capacityOverride: false,
        denialReason: null,
      },
      {
        dogId: 'dog-uuid-2',
        classId: 'class-uuid-1',
        outcome: 'denied',
        entryId: null,
        waitlistEntryId: null,
        waitlistPosition: null,
        feeCents: 0,
        capacityOverride: false,
        denialReason: 'dog already on this class wait list for a different exhibitor',
      },
    ]);
  });

  it('synthesizes created outcomes for a legacy server response', async () => {
    mockRpc.mockResolvedValue(rpcSuccess);

    const result = await submitShowEntries({
      ...baseParams,
      submissionSource: 'self_service',
    } as Parameters<typeof submitShowEntries>[0]);

    expect(result.outcomes).toEqual([
      expect.objectContaining({ dogId: 'dog-uuid-1', outcome: 'created', entryId: 'e1' }),
      expect.objectContaining({ dogId: 'dog-uuid-2', outcome: 'created', entryId: 'e2' }),
    ]);
  });

  it('updates handler corrections through the entry-management RPC with handler_id', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await updateEntryHandler({
      entryId: 'entry-uuid-1',
      handler: 'Grace Hollis',
      handlerId: 'person-uuid-1',
    });

    expect(mockRpc).toHaveBeenCalledWith('update_entry_handler_for_entry_management', {
      p_entry_id: 'entry-uuid-1',
      p_handler: 'Grace Hollis',
      p_handler_id: 'person-uuid-1',
      p_clear_handler_id: false,
    });
  });

  it('does not send the legacy handler clear argument for text corrections', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await updateEntryHandler({
      entryId: 'entry-uuid-1',
      handler: 'Grace Hollis',
      handlerId: null,
    });

    expect(mockRpc).toHaveBeenCalledWith('update_entry_handler_for_entry_management', {
      p_entry_id: 'entry-uuid-1',
      p_handler: 'Grace Hollis',
      p_handler_id: null,
      p_clear_handler_id: false,
    });
  });

  it('sends the explicit handler clear argument for secretary corrections', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await updateEntryHandler({
      entryId: 'entry-uuid-1',
      handler: 'Grace Hollis',
      handlerId: null,
      clearHandlerId: true,
    });

    expect(mockRpc).toHaveBeenCalledWith('update_entry_handler_for_entry_management', {
      p_entry_id: 'entry-uuid-1',
      p_handler: 'Grace Hollis',
      p_handler_id: null,
      p_clear_handler_id: true,
    });
  });
});

/**
 * MYK9-516. The started-class guard lives in the RPC, so the only thing the
 * client owes it is a faithful path from PostgREST's error to the toast.
 *
 * The expected strings are READ OUT OF THE MIGRATION at test time rather than
 * retyped here. A hand-copied constant is an independent copy: reword the RAISE
 * and every assertion below keeps passing against text no exhibitor will ever
 * see, which is precisely the drift the assertion is supposed to prevent
 * (LESSONS `source-text-tests` — a test that proves someone typed the thing
 * proves nothing about what runs).
 */
const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../../../../../../supabase/migrations');

/**
 * The LATEST migration defining `submit_show_entries`, resolved rather than
 * named. A hardcoded filename is a stale pin the moment the function is rebuilt
 * — 20260914184500 stopped being the live definition when MYK9-642 replaced the
 * function, and these assertions kept passing only because that rebuild copied
 * the RAISE text verbatim. Resolving it is the same `grep -l … | sort | tail -1`
 * the migration workflow itself mandates (LESSONS `replace-function-latest`).
 */
function latestSubmitShowEntriesMigration(): string {
  const definers = readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith('.sql'))
    .filter(name =>
      readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8').includes(
        'CREATE OR REPLACE FUNCTION public.submit_show_entries'
      )
    )
    .sort();
  const latest = definers.at(-1);
  if (!latest) {
    throw new Error(
      'No migration defines public.submit_show_entries — the assertions below would test nothing'
    );
  }
  return readFileSync(resolve(MIGRATIONS_DIR, latest), 'utf8');
}

const MIGRATION = latestSubmitShowEntriesMigration();

/**
 * The message the RPC RAISEs for a status, exactly as the migration spells it.
 * Fails loudly rather than returning a placeholder: a regex that silently
 * stopped matching would hand every test below an empty expectation.
 */
function raisedMessage(marker: string): string {
  const match = MIGRATION.match(
    new RegExp(`v_class_status = '${marker}'[^\\n]*THEN\\s*\\n\\s*RAISE EXCEPTION '([^']+)'`)
  );
  if (!match?.[1]) {
    throw new Error(
      `Could not read the RAISE message for '${marker}' out of the migration. ` +
        'If the guard moved or was reworded, update this reader — do not hand-copy the text.'
    );
  }
  // The RAISE ends with `: %`, the class label the RPC interpolates. Strip the
  // placeholder and keep the prose; the rendered message is built per test.
  return match[1].replace(/:\s*%$/, '');
}

/** What the RPC actually sends: the prose, then the class it is talking about. */
const CLASS_LABEL = 'Interior Advanced (Saturday Trial)';
const rendered = (prose: string) => `${prose}: ${CLASS_LABEL}`;

describe('submitShowEntries — started-class rejection (MYK9-516)', () => {
  const STARTED_MESSAGE = raisedMessage('in_progress');
  const FINISHED_MESSAGE = raisedMessage('completed');
  const CANCELLED_MESSAGE = raisedMessage('cancelled');

  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('reads three distinct messages out of the migration, with the placeholder stripped', () => {
    // Known answer for the reader itself. Without this a regex that matched the
    // same guard three times would make every assertion below agree for the
    // wrong reason.
    expect(STARTED_MESSAGE).toMatch(/already started/);
    expect(FINISHED_MESSAGE).toMatch(/finished/);
    expect(CANCELLED_MESSAGE).toMatch(/cancelled/);
    expect(new Set([STARTED_MESSAGE, FINISHED_MESSAGE, CANCELLED_MESSAGE]).size).toBe(3);
    for (const message of [STARTED_MESSAGE, FINISHED_MESSAGE, CANCELLED_MESSAGE]) {
      expect(message).not.toContain('%');
    }
  });

  it('surfaces the RPC message and SQLSTATE rather than a generic failure', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: rendered(STARTED_MESSAGE), code: '42501', details: null, hint: null },
    });

    await expect(submitShowEntries(baseParams)).rejects.toMatchObject({
      name: 'DatabaseError',
      message: rendered(STARTED_MESSAGE),
      code: '42501',
      table: 'entry_submissions',
      operation: 'rpc_submit',
    });
  });

  it('gives getErrorMessage the readable sentence the wizard toasts', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: rendered(STARTED_MESSAGE), code: '42501', details: null, hint: null },
    });

    // `submitPaymentStep` catches and calls `notifications.error(getErrorMessage(error))`.
    // A DatabaseError is a plain object, not an Error instance, so this is the
    // `isErrorLike` branch — the one that would quietly degrade to
    // String(value) = '[object Object]' if the shape ever changed.
    const caught = await submitShowEntries(baseParams).catch((error: unknown) => error);
    expect(getErrorMessage(caught)).toBe(rendered(STARTED_MESSAGE));
    // The toast must name WHICH class: a multi-class cart fails as a whole, and
    // "a class has started" leaves the exhibitor guessing which chip to remove.
    expect(getErrorMessage(caught)).toContain(CLASS_LABEL);
  });

  it('carries the finished and cancelled messages through unchanged too', async () => {
    for (const message of [FINISHED_MESSAGE, CANCELLED_MESSAGE]) {
      mockRpc.mockReset();
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: rendered(message), code: '42501', details: null, hint: null },
      });
      const caught = await submitShowEntries(baseParams).catch((error: unknown) => error);
      expect(getErrorMessage(caught)).toBe(rendered(message));
    }
  });

  it('does not commit any entry when the RPC rejects', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: rendered(STARTED_MESSAGE), code: '42501', details: null, hint: null },
    });

    await expect(submitShowEntries(baseParams)).rejects.toBeDefined();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
