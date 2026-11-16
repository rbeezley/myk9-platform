import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { UserRole } from '@/types/auth-types';
import type { UserWithRoles } from '@/types/auth-types';
import { productVersion, buildReference } from '@/config/appVersion';
import { buildDiagnosticBundle } from './supportDiagnostics';
import type { SupportDeflectionRoute } from './supportDeflection';
import {
  createSupportTicket,
  type CreatedSupportTicket,
  type CreateSupportTicketInput,
} from './supportTickets';
import { extractSupportRouteContext, shouldPrioritizeSupportTicket } from './supportContext';

export type SupportHelpStatus = 'idle' | 'escalating' | 'submitting' | 'created';

export interface SupportHelpState {
  status: SupportHelpStatus;
  question: string;
  route: SupportDeflectionRoute | null;
  ticket: CreatedSupportTicket | null;
  error: string | null;
}

const INITIAL_STATE: SupportHelpState = {
  status: 'idle',
  question: '',
  route: null,
  ticket: null,
  error: null,
};

// Tickets are an online-only write and nothing is queued: say so and keep the note in the box.
export const OFFLINE_TICKET_MESSAGE =
  "You're offline, so this could not be sent. Your note is still here. Connect, then press Create ticket.";

const GENERIC_ESCALATION_MESSAGE = "I couldn't answer that confidently.";

export function useSupportHelp(user: User | null, userWithRoles: UserWithRoles | null) {
  const [state, setState] = useState<SupportHelpState>(INITIAL_STATE);
  const location = useLocation();
  const roles = useMemo(() => userWithRoles?.roles ?? [], [userWithRoles?.roles]);
  const routeContext = useMemo(
    () => extractSupportRouteContext(location.pathname, location.search),
    [location.pathname, location.search]
  );

  /**
   * Opens the ticket step without calling AskQ, so it never spends a daily question. Pass
   * `question` to carry text typed somewhere else (an AskQ error or daily limit) into the note.
   */
  const startEscalation = useCallback((question?: string) => {
    setState(prev => {
      const carried = question?.trim();
      return {
        ...prev,
        status: 'escalating',
        error: null,
        ...(carried ? { question: carried } : {}),
        route:
          !carried && prev.route?.kind === 'escalate'
            ? prev.route
            : {
                kind: 'escalate',
                reason: 'low_confidence',
                message: GENERIC_ESCALATION_MESSAGE,
                question: carried || prev.question,
              },
      };
    });
  }, []);

  const createTicket = useCallback(
    async (body: string) => {
      setState(prev => ({ ...prev, status: 'submitting', error: null }));
      try {
        if (!user) {
          throw new Error('Sign in before sending a support request.');
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          throw new Error(OFFLINE_TICKET_MESSAGE);
        }

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
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    startEscalation,
    createTicket,
    reset,
  };
}
