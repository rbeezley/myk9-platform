import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { productVersion, buildReference } from '@/config/appVersion';
import { UserRole } from '@/types/auth-types';
import { buildDiagnosticBundle } from '../support/supportDiagnostics';
import { listSupportTickets } from '../support/supportTickets';
import { supportTicketKeys } from '../support/useSupportTickets';
import {
  EMPTY_TASK_PROGRESS,
  loadMockShowProgress,
  saveMockTaskProgress,
  type MockShowProgress,
  type MockTaskProgress,
} from './mockShowProgress';
import { mockMarkFor, saveMockNote, type MockNoteTarget } from './mockShowTickets';

const progressKey = (userId: string | undefined) => ['mock-show-progress', userId ?? null] as const;

export function useMockShowProgress() {
  const { user } = useAuthContext();
  const userId = user?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: progressKey(userId),
    enabled: !!userId,
    queryFn: () => loadMockShowProgress(userId!),
  });

  const mutation = useMutation({
    mutationFn: (vars: { number: number; progress: MockTaskProgress }) =>
      saveMockTaskProgress(userId!, vars.number, vars.progress),
    onMutate: async vars => {
      await queryClient.cancelQueries({ queryKey: progressKey(userId) });
      const previous = queryClient.getQueryData<MockShowProgress>(progressKey(userId));
      queryClient.setQueryData<MockShowProgress>(progressKey(userId), {
        ...(previous ?? {}),
        [vars.number]: vars.progress,
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(progressKey(userId), context?.previous ?? {});
    },
  });

  const progressFor = useCallback(
    (number: number): MockTaskProgress => query.data?.[number] ?? EMPTY_TASK_PROGRESS,
    [query.data]
  );

  return { query, mutation, progressFor };
}

/** The tester's own support tickets (RLS limits the read to her own). */
export function useMyMockTestTickets() {
  const { user } = useAuthContext();
  return useQuery({
    queryKey: supportTicketKeys.list(undefined, undefined),
    enabled: !!user,
    queryFn: () => listSupportTickets(),
  });
}

export function useSaveMockNote() {
  const { user, userWithRoles } = useAuthContext();
  const location = useLocation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { target: MockNoteTarget; body: string }) => {
      if (!user) throw new Error('Sign in before sending a note.');
      return saveMockNote({
        ownerId: user.id,
        target: vars.target,
        body: vars.body,
        diagnostics: buildDiagnosticBundle({
          userId: user.id,
          databaseUserId: userWithRoles?.databaseUserId ?? null,
          role: userWithRoles?.roles[0] ?? UserRole.EXHIBITOR,
          route: `${location.pathname}${location.search}`,
          appVersion: buildReference ? `${productVersion} (${buildReference})` : productVersion,
          online: typeof navigator === 'undefined' ? null : navigator.onLine,
          mockTest: mockMarkFor(vars.target),
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: supportTicketKeys.all });
    },
  });
}
