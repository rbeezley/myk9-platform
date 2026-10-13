/**
 * The add-entry inline registration add is queued (MYK9-1090): offline it
 * queues an INSERT carrying every field the form sends, and makes no
 * PostgREST write. The real hook, mutation, table and MutationManager.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { databaseManager, NOTIFY_DEBOUNCE_MS } from '@myk9/replication';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient, renderHook } from '@/test/utils/testUtils';
import { supabase } from '@/services/database/supabaseClient';
import {
  createRegistrationQueueHarness,
  setDeviceOnline,
  type RegistrationQueueHarness,
} from '@/services/replication/__tests__/registrationQueueHarness';
import { useInlineDogRegistration } from './useInlineDogRegistration';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let queue: RegistrationQueueHarness;

beforeEach(async () => {
  await databaseManager.reset();
  queue = createRegistrationQueueHarness();
  vi.mocked(supabase.from).mockClear();
  setDeviceOnline(false);
});

afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, NOTIFY_DEBOUNCE_MS + 50));
  setDeviceOnline(true);
  await queue.destroy();
  await databaseManager.reset();
});

describe('useInlineDogRegistration, offline', () => {
  it('queues an INSERT with the form fields and makes no PostgREST write', async () => {
    const onSaved = vi.fn();
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useInlineDogRegistration(onSaved), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    act(() => result.current.openRegistrationEditor('dog-1'));

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.saveRegistration({
        id: 'form-id',
        organization: 'UKC',
        registeredName: 'Official Name',
        registrationNumber: 'UKC-123',
        breed: 'Beagle',
        variety: '13 inch',
        status: 'Active',
        applicationNumber: 'APP-1',
        submissionDate: '2026-08-20',
        registrationDate: '2026-08-21',
        certificate: 'certificate.pdf',
      });
    });

    expect(saved).toBe(true);
    expect(onSaved).toHaveBeenCalled();
    const [insert, ...rest] = await queue.pending();
    expect(rest).toEqual([]);
    expect(insert).toMatchObject({
      operation: 'INSERT',
      tableName: 'dog_registrations',
      data: {
        dog_id: 'dog-1',
        organization: 'UKC',
        registered_name: 'Official Name',
        registration_number: 'UKC-123',
        variety: '13 inch',
        application_number: 'APP-1',
        submission_date: '2026-08-20',
        registration_date: '2026-08-21',
        certificate: 'certificate.pdf',
      },
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
