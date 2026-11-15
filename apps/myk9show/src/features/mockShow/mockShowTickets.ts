import type { SupportDiagnosticBundle, SupportMockTestMark } from '../support/supportDiagnostics';
import {
  buildTicketSubject,
  createSupportTicket,
  listSupportTickets,
  postSupportTicketMessage,
  type SupportTicket,
} from '../support/supportTickets';
import { MOCK_SHOW_CLOSING_QUESTIONS, MOCK_SHOW_TASKS } from './mockShowSheet';

/** What a note answers: one task, one closing question, or nothing in particular. */
export type MockNoteTarget =
  { part: 'task'; number: number } | { part: 'closing'; number: number } | { part: 'free' };

const SUBJECT_PREFIX = 'Mock test · ';
const SUBJECT_LIMIT = 200;

function clip(subject: string): string {
  return subject.length > SUBJECT_LIMIT ? `${subject.slice(0, SUBJECT_LIMIT - 3)}...` : subject;
}

export function mockMarkFor(target: MockNoteTarget): SupportMockTestMark {
  return { part: target.part, number: target.part === 'free' ? null : target.number };
}

/** "Mock test · Task 3: Key in 10 mail-in entries" */
export function buildMockTestSubject(target: MockNoteTarget, body: string): string {
  if (target.part === 'task') {
    const task = MOCK_SHOW_TASKS.find(item => item.number === target.number);
    return clip(`${SUBJECT_PREFIX}Task ${target.number}: ${task?.name ?? 'Unknown task'}`);
  }
  if (target.part === 'closing') {
    const question = MOCK_SHOW_CLOSING_QUESTIONS[target.number - 1] ?? 'Unknown question';
    return clip(`${SUBJECT_PREFIX}Closing question ${target.number}: ${question}`);
  }
  return clip(`${SUBJECT_PREFIX}Note: ${buildTicketSubject(body)}`);
}

export function isMockTestTicket(ticket: SupportTicket): boolean {
  return ticket.diagnostics?.kind === 'mock-test';
}

function sameTarget(ticket: SupportTicket, target: MockNoteTarget): boolean {
  const mark = ticket.diagnostics?.mockTest;
  return !!mark && mark.part === target.part && mark.number === mockMarkFor(target).number;
}

/** The tester's own ticket for a task or closing question, if she has sent one. */
export function findMockTestTicket(
  tickets: readonly SupportTicket[],
  ownerId: string,
  target: MockNoteTarget
): SupportTicket | null {
  if (target.part === 'free') return null;
  return (
    tickets.find(
      ticket => ticket.ownerId === ownerId && isMockTestTicket(ticket) && sameTarget(ticket, target)
    ) ?? null
  );
}

/** The tester's mock-test tickets, filtered on the server so a long inbox cannot hide one. */
export function listMyMockTestTickets(ownerId: string): Promise<SupportTicket[]> {
  return listSupportTickets(undefined, { ownerId, kind: 'mock-test' });
}

export interface SaveMockNoteInput {
  ownerId: string;
  target: MockNoteTarget;
  body: string;
  /** The ordinary support bundle (route, app version, online state) for this moment. */
  diagnostics: SupportDiagnosticBundle;
}

/**
 * Saves one note. A task or closing question keeps ONE ticket: the first note
 * creates it through `create_support_ticket`, every later note is a message on
 * it. A free note always opens its own ticket. Mock-test tickets are never
 * show-day priority, so they do not page the operator.
 *
 * The ticket list is read first and a failed read stops the save: guessing
 * "no ticket yet" would open a second ticket for the same task.
 */
export async function saveMockNote(input: SaveMockNoteInput): Promise<{ ticketId: string }> {
  const body = input.body.trim();
  if (!body) throw new Error('Write a note before saving.');

  if (input.target.part !== 'free') {
    const tickets = await listMyMockTestTickets(input.ownerId);
    const existing = findMockTestTicket(tickets, input.ownerId, input.target);
    if (existing) {
      await postSupportTicketMessage({
        ticketId: existing.id,
        senderId: input.ownerId,
        body,
        isFromOperator: false,
      });
      return { ticketId: existing.id };
    }
  }

  const created = await createSupportTicket({
    ownerId: input.ownerId,
    body,
    subject: buildMockTestSubject(input.target, body),
    diagnostics: input.diagnostics,
    showId: null,
    isShowDayPriority: false,
  });
  return { ticketId: created.id };
}
