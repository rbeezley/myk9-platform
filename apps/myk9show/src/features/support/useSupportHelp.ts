import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { UserRole } from '@/types/auth-types';
import type { UserWithRoles } from '@/types/auth-types';
import { productVersion, buildReference } from '@/config/appVersion';
import { sendAskQQuery, parseSSEStream, RateLimitError } from '@/services/askqService';
import { buildDiagnosticBundle } from './supportDiagnostics';
import {
  routeSupportDeflection,
  type SupportDeflectionRoute,
  type SupportEscalationEvent,
} from './supportDeflection';
import {
  createSupportTicket,
  type CreatedSupportTicket,
  type CreateSupportTicketInput,
} from './supportTickets';
import { extractSupportRouteContext, shouldPrioritizeSupportTicket } from './supportContext';

export type SupportHelpStatus =
  | 'idle'
  | 'streaming'
  | 'answered'
  | 'escalating'
  | 'submitting'
  | 'created'
  | 'error'
  | 'rate-limited';

export interface SupportHelpState {
  status: SupportHelpStatus;
  question: string;
  answer: string;
  toolsUsed: string[];
  sources: Record<string, unknown[]>;
  route: SupportDeflectionRoute | null;
  ticket: CreatedSupportTicket | null;
  error: string | null;
}

const INITIAL_STATE: SupportHelpState = {
  status: 'idle',
  question: '',
  answer: '',
  toolsUsed: [],
  sources: {},
  route: null,
  ticket: null,
  error: null,
};

export function useSupportHelp(user: User | null, userWithRoles: UserWithRoles | null) {
  const [state, setState] = useState<SupportHelpState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const location = useLocation();
  const roles = useMemo(() => userWithRoles?.roles ?? [], [userWithRoles?.roles]);
  const routeContext = useMemo(
    () => extractSupportRouteContext(location.pathname, location.search),
    [location.pathname, location.search]
  );

  const askForHelp = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        ...INITIAL_STATE,
        status: 'streaming',
        question: trimmed,
      });

      let answer = '';
      let toolsUsed: string[] = [];
      let sources: Record<string, unknown[]> = {};
      let escalation: SupportEscalationEvent | null = null;

      try {
        const request = routeContext.showId
          ? { message: trimmed, showId: routeContext.showId, supportMode: true }
          : { message: trimmed, supportMode: true };
        const stream = await sendAskQQuery(request, controller.signal);

        await parseSSEStream(stream, (event, data) => {
          if (controller.signal.aborted) return;
          if (event === 'token') {
            answer += String(data);
            setState(prev => ({ ...prev, answer }));
          } else if (event === 'tools_used') {
            toolsUsed = data as string[];
          } else if (event === 'sources') {
            sources = data as Record<string, unknown[]>;
          } else if (event === 'support_escalation') {
            escalation = data as SupportEscalationEvent;
          }
        });

        const route = routeSupportDeflection({
          question: trimmed,
          answer,
          toolsUsed,
          sources,
          escalation,
        });
        setState(prev => ({
          ...prev,
          status: route.kind === 'answer' ? 'answered' : 'escalating',
          answer: route.kind === 'answer' ? route.answer : '',
          toolsUsed,
          sources,
          route,
        }));
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof RateLimitError) {
          setState(prev => ({
            ...prev,
            status: 'escalating',
            route: {
              kind: 'escalate',
              reason: 'low_confidence',
              message: 'A person can help with that.',
              question: trimmed,
            },
            error: null,
          }));
        } else {
          setState(prev => ({
            ...prev,
            status: 'error',
            error: error instanceof Error ? error.message : 'Could not reach support.',
          }));
        }
      }
    },
    [routeContext.showId]
  );

  const startEscalation = useCallback(() => {
    setState(prev => ({
      ...prev,
      status: 'escalating',
      route:
        prev.route?.kind === 'escalate'
          ? prev.route
          : {
              kind: 'escalate',
              reason: 'low_confidence',
              message: 'A person can help with that.',
              question: prev.question,
            },
    }));
  }, []);

  const createTicket = useCallback(
    async (body: string) => {
      if (!user) throw new Error('Sign in before sending a support request.');

      setState(prev => ({ ...prev, status: 'submitting', error: null }));
      try {
        const input: CreateSupportTicketInput = {
          ownerId: user.id,
          body,
          diagnostics: buildDiagnosticBundle({
            userId: user.id,
            databaseUserId: userWithRoles?.databaseUserId ?? null,
            role: roles[0] ?? UserRole.EXHIBITOR,
            route: `${location.pathname}${location.search}`,
            showId: routeContext.showId,
            trialId: routeContext.trialId,
            entryId: routeContext.entryId,
            appVersion: buildReference ? `${productVersion} (${buildReference})` : productVersion,
            online: typeof navigator === 'undefined' ? null : navigator.onLine,
          }),
          showId: routeContext.showId,
          isShowDayPriority: shouldPrioritizeSupportTicket(routeContext, roles),
        };
        const ticket = await createSupportTicket(input);
        setState(prev => ({ ...prev, status: 'created', ticket }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          status: 'escalating',
          error: error instanceof Error ? error.message : 'Could not create the ticket.',
        }));
      }
    },
    [location.pathname, location.search, roles, routeContext, user, userWithRoles?.databaseUserId]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    askForHelp,
    startEscalation,
    createTicket,
    reset,
  };
}
