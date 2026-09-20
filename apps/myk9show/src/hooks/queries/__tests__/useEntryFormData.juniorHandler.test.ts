/**
 * MYK9-570 round-1 review. The AKC entry form prints `entries.handler` (free
 * text) and fills `JuniorHandlerNumber` from the person at `entries.handler_id`.
 * These two facts are not kept in sync by anything, so this exercises the whole
 * fetch — not a pure helper — against a table-routed Supabase mock. A unit test
 * of the policy cannot see a resolution that picks the wrong person.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { createChainableQuery } from '@/test/mocks/supabase';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

import { useEntryFormData } from '../useEntryFormData';

const SARAH = {
  id: 'person-sarah',
  first_name: 'Sarah',
  last_name: 'Owner',
  street_address: null,
  city: null,
  state: null,
  zip_code: null,
  phone: null,
  email: null,
  date_of_birth: '2009-05-05',
  junior_handler_numbers: { AKC: 'SARAH-NUMBER' },
};

const KID = {
  id: 'person-kid',
  first_name: 'Chris',
  last_name: 'Kid',
  street_address: null,
  city: null,
  state: null,
  zip_code: null,
  phone: null,
  email: null,
  date_of_birth: '2012-04-02',
  junior_handler_numbers: { AKC: 'KID-NUMBER' },
};

type EntryRow = {
  id: string;
  handler: string | null;
  handler_id: string | null;
};

function routeTables(entries: EntryRow[], people: unknown[]) {
  const rows: Record<string, unknown[]> = {
    shows: [],
    trials: [{ id: 'trial-1', date: '2026-04-12', trial_number: 'Trial 1' }],
    classes: [{ id: 'class-1', trial_id: 'trial-1', element: 'Container', level: 'Novice' }],
    entries: entries.map(e => ({
      ...e,
      dog_id: 'dog-1',
      class_id: 'class-1',
      trial_id: 'trial-1',
      armband: '101',
      submitted_at: null,
    })),
    dogs: [
      {
        id: 'dog-1',
        call_name: 'Buddy',
        sex: 'Female',
        date_of_birth: '2022-01-01',
        owner_id: SARAH.id,
        breeder_id: null,
      },
    ],
    dog_registrations: [],
    pedigree_ancestors: [],
    people,
  };
  mocks.from.mockImplementation((table: string) =>
    createChainableQuery({ data: rows[table] ?? [], error: null })
  );
}

function renderEntryFormData() {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useEntryFormData({ showId: 'show-1' }), { wrapper });
}

describe('useEntryFormData resolves the handler person for the junior fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: [], error: null });
  });

  it('reads the junior columns for the handler named on the printed entry', async () => {
    routeTables([{ id: 'entry-a', handler: 'Chris Kid', handler_id: KID.id }], [SARAH, KID]);
    const { result } = renderEntryFormData();
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));

    const dog = result.current.dogs[0]!;
    expect(dog.handler).toBe('Chris Kid');
    expect(dog.handlerDateOfBirth).toBe('2012-04-02');
    expect(dog.handlerJuniorHandlerNumbers).toEqual({ AKC: 'KID-NUMBER' });
  });

  it('does NOT borrow a handler person from another entry on the same dog', async () => {
    // The round-1 P2, pinned so that RESTORING the cross-entry fallback fails on
    // its own rather than being caught by the name guard. Round 2 showed the
    // first version of this test passed either way, because the borrowed person
    // had a different name from the printed handler.
    //
    // Here the borrowed person IS named "Chris Kid" — the same name entry A
    // prints — so a fallback that reaches entry B would sail through the name
    // guard and print Chris's AKC number. Only refusing to look at another
    // entry keeps this null.
    routeTables(
      [
        { id: 'entry-a', handler: 'Chris Kid', handler_id: null },
        { id: 'entry-b', handler: 'Chris Kid', handler_id: KID.id },
      ],
      [SARAH, KID]
    );
    const { result } = renderEntryFormData();
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));

    const dog = result.current.dogs[0]!;
    expect(dog.handler).toBe('Chris Kid');
    expect(dog.handlerDateOfBirth).toBeNull();
    expect(dog.handlerJuniorHandlerNumbers).toBeUndefined();
  });

  it('refuses the person when handler_id names someone other than the printed handler', async () => {
    routeTables([{ id: 'entry-a', handler: 'Grandma Smith', handler_id: KID.id }], [SARAH, KID]);
    const { result } = renderEntryFormData();
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));

    const dog = result.current.dogs[0]!;
    expect(dog.handler).toBe('Grandma Smith');
    expect(dog.handlerDateOfBirth).toBeNull();
    expect(dog.handlerJuniorHandlerNumbers).toBeUndefined();
  });

  it('fills for an OWNER-handled dog — 1276 of 1281 live entries', async () => {
    // Round 2's P1. The fetch identifies a "handler entry" by `handler !==
    // ownerFullName`, so when the owner handles their own dog there is no
    // handler entry and `handler_id` never reaches the resolver as a candidate.
    // The OWNER is the candidate in that case, and the printed name is theirs.
    routeTables([{ id: 'entry-a', handler: 'Sarah Owner', handler_id: SARAH.id }], [SARAH]);
    const { result } = renderEntryFormData();
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));

    const dog = result.current.dogs[0]!;
    // `handler` stays null: the form prints the owner block for an owner-handled
    // dog. The junior fields must still be populated.
    expect(dog.handler).toBeNull();
    expect(dog.handlerDateOfBirth).toBe('2009-05-05');
    expect(dog.handlerJuniorHandlerNumbers).toEqual({ AKC: 'SARAH-NUMBER' });
  });

  it('fills for an owner-handled dog even with no handler_id on the entry at all', async () => {
    routeTables([{ id: 'entry-a', handler: 'Sarah Owner', handler_id: null }], [SARAH]);
    const { result } = renderEntryFormData();
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));
    expect(result.current.dogs[0]!.handlerDateOfBirth).toBe('2009-05-05');
  });

  it('does not let an owner entry mask a later assigned proxy handler', async () => {
    routeTables(
      [
        { id: 'entry-owner', handler: 'Sarah Owner', handler_id: SARAH.id },
        { id: 'entry-proxy', handler: 'Chris Kid', handler_id: KID.id },
      ],
      [SARAH, KID]
    );
    const { result } = renderEntryFormData();
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));

    const dog = result.current.dogs[0]!;
    expect(dog.handler).toBe('Chris Kid');
    expect(dog.handlerDateOfBirth).toBe('2012-04-02');
    expect(dog.handlerJuniorHandlerNumbers).toEqual({ AKC: 'KID-NUMBER' });
  });

  it('does not attach owner junior data when an assigned handler id is unresolved', async () => {
    routeTables(
      [{ id: 'entry-unresolved', handler: null, handler_id: 'missing-handler' }],
      [SARAH]
    );
    const { result } = renderEntryFormData();
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));

    const dog = result.current.dogs[0]!;
    expect(dog.handler).toBe('Unknown Handler');
    expect(dog.handlerDateOfBirth).toBeNull();
    expect(dog.handlerJuniorHandlerNumbers).toBeUndefined();
  });

  it('does not treat the owner as the handler when someone else is printed', async () => {
    // The owner is a CANDIDATE, not a default: only their own name admits them.
    routeTables([{ id: 'entry-a', handler: 'Bob Handler', handler_id: null }], [SARAH]);
    const { result } = renderEntryFormData();
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));

    const dog = result.current.dogs[0]!;
    expect(dog.handler).toBe('Bob Handler');
    expect(dog.handlerDateOfBirth).toBeNull();
  });

  it('asks the people read for the junior columns at all', async () => {
    // Guards the select string: if these columns stop being requested the whole
    // feature goes quietly inert and every other assertion here still passes.
    routeTables([{ id: 'entry-a', handler: 'Chris Kid', handler_id: KID.id }], [KID]);
    const { result } = renderEntryFormData();
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));

    const peopleQuery = mocks.from.mock.results
      .filter((_, index) => mocks.from.mock.calls[index]?.[0] === 'people')
      .map(r => r.value)[0];
    const selectArg = peopleQuery.select.mock.calls[0][0] as string;
    expect(selectArg).toContain('date_of_birth');
    expect(selectArg).toContain('junior_handler_numbers');
    expect(selectArg).toContain('first_name');
  });
});
