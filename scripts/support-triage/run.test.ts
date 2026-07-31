import { describe, expect, it, vi } from 'vitest';
import { runPass } from './run';
import type { CannedAnswer } from './answers';
import type { SupportMessage, SupportTicket } from './types';

const NOW = new Date('2026-08-01T12:00:00.000Z');

function ticket(id: string, overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id,
    owner_id: `owner-${id}`,
    subject: 'Where is my armband?',
    status: 'open',
    is_show_day_priority: false,
    show_id: null,
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

function message(ticketId: string, overrides: Partial<SupportMessage> = {}): SupportMessage {
  return {
    id: `m-${ticketId}`,
    ticket_id: ticketId,
    sender_id: `owner-${ticketId}`,
    body: 'Where do I find my armband number?',
    is_from_operator: false,
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

const PROMOTED: CannedAnswer[] = [
  {
    id: 'armband-lookup',
    label: 'Armband lookup',
    whenToUse: 'Asks where to find their armband',
    reply: 'Open My Entries to see your armband number.',
    autoSend: true,
  },
];

function makeSource(tickets: SupportTicket[], messages: SupportMessage[]) {
  return {
    openTickets: vi.fn().mockResolvedValue(tickets),
    messagesFor: vi
      .fn()
      .mockImplementation(async (ids: string[]) => messages.filter(m => ids.includes(m.ticket_id))),
    insertOperatorMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function baseDeps() {
  return {
    state: { draftedMessageIds: [], alertedClusterKeys: [] },
    now: NOW,
    appUrl: 'https://app.example.com',
    operatorUserId: 'operator-1',
  };
}

describe('runPass', () => {
  it('auto-sends a promoted canned answer', async () => {
    const source = makeSource([ticket('t1')], [message('t1')]);
    const summary = await runPass({
      ...baseDeps(),
      source,
      answers: PROMOTED,
      classify: vi.fn().mockResolvedValue({ kind: 'canned', answerId: 'armband-lookup' }),
      notify: vi.fn().mockResolvedValue(undefined),
    });
    expect(summary.autoSent).toBe(1);
    expect(source.insertOperatorMessage).toHaveBeenCalledWith(
      't1',
      'operator-1',
      'Open My Entries to see your armband number.'
    );
  });

  it('drafts instead of sending when the answer is not promoted', async () => {
    const source = makeSource([ticket('t1')], [message('t1')]);
    const notify = vi.fn().mockResolvedValue(undefined);
    const summary = await runPass({
      ...baseDeps(),
      source,
      answers: [{ ...PROMOTED[0], autoSend: false }],
      classify: vi.fn().mockResolvedValue({ kind: 'canned', answerId: 'armband-lookup' }),
      notify,
    });
    expect(summary.autoSent).toBe(0);
    expect(summary.drafted).toBe(1);
    expect(source.insertOperatorMessage).not.toHaveBeenCalled();
  });

  it('never auto-sends a show-day ticket even when a promoted answer matches', async () => {
    const source = makeSource([ticket('t1', { is_show_day_priority: true })], [message('t1')]);
    const summary = await runPass({
      ...baseDeps(),
      source,
      answers: PROMOTED,
      classify: vi.fn().mockResolvedValue({ kind: 'canned', answerId: 'armband-lookup' }),
      notify: vi.fn().mockResolvedValue(undefined),
    });
    expect(summary.autoSent).toBe(0);
    expect(summary.carvedOut).toBe(1);
    expect(source.insertOperatorMessage).not.toHaveBeenCalled();
  });

  it('never auto-sends a payment ticket even when a promoted answer matches', async () => {
    const source = makeSource([ticket('t1', { subject: 'Refund for my entry' })], [message('t1')]);
    const summary = await runPass({
      ...baseDeps(),
      source,
      answers: PROMOTED,
      classify: vi.fn().mockResolvedValue({ kind: 'canned', answerId: 'armband-lookup' }),
      notify: vi.fn().mockResolvedValue(undefined),
    });
    expect(summary.autoSent).toBe(0);
    expect(summary.carvedOut).toBe(1);
    expect(source.insertOperatorMessage).not.toHaveBeenCalled();
  });

  it('skips threads the operator already answered', async () => {
    const source = makeSource(
      [ticket('t1')],
      [
        message('t1', { id: 'm1', created_at: '2026-08-01T10:00:00.000Z' }),
        message('t1', {
          id: 'm2',
          is_from_operator: true,
          created_at: '2026-08-01T11:00:00.000Z',
        }),
      ]
    );
    const classify = vi.fn();
    const summary = await runPass({
      ...baseDeps(),
      source,
      answers: PROMOTED,
      classify,
      notify: vi.fn().mockResolvedValue(undefined),
    });
    expect(summary.considered).toBe(0);
    expect(classify).not.toHaveBeenCalled();
  });

  it('does not re-draft a message it has already drafted', async () => {
    const source = makeSource([ticket('t1')], [message('t1')]);
    const notify = vi.fn().mockResolvedValue(undefined);
    const summary = await runPass({
      ...baseDeps(),
      state: { draftedMessageIds: ['m-t1'], alertedClusterKeys: [] },
      source,
      answers: [],
      classify: vi.fn().mockResolvedValue({ kind: 'novel', draft: 'x', clusterLabel: 'y' }),
      notify,
    });
    expect(summary.drafted).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('records a drafted message id so the next pass does not repeat it', async () => {
    const source = makeSource([ticket('t1')], [message('t1')]);
    const summary = await runPass({
      ...baseDeps(),
      source,
      answers: [],
      classify: vi.fn().mockResolvedValue({ kind: 'novel', draft: 'x', clusterLabel: 'y' }),
      notify: vi.fn().mockResolvedValue(undefined),
    });
    expect(summary.state.draftedMessageIds).toContain('m-t1');
  });

  it('stops auto-sending once the per-pass cap is reached', async () => {
    const tickets = ['t1', 't2', 't3', 't4'].map(id => ticket(id));
    const messages = tickets.map(t => message(t.id));
    const source = makeSource(tickets, messages);
    const summary = await runPass({
      ...baseDeps(),
      source,
      answers: PROMOTED,
      maxAutoSends: 3,
      classify: vi.fn().mockResolvedValue({ kind: 'canned', answerId: 'armband-lookup' }),
      notify: vi.fn().mockResolvedValue(undefined),
    });
    expect(summary.autoSent).toBe(3);
    expect(summary.capReached).toBe(true);
    expect(source.insertOperatorMessage).toHaveBeenCalledTimes(3);
  });

  it('defaults the cap to 3 when none is given', async () => {
    const tickets = ['t1', 't2', 't3', 't4', 't5'].map(id => ticket(id));
    const messages = tickets.map(t => message(t.id));
    const source = makeSource(tickets, messages);
    const summary = await runPass({
      ...baseDeps(),
      source,
      answers: PROMOTED,
      classify: vi.fn().mockResolvedValue({ kind: 'canned', answerId: 'armband-lookup' }),
      notify: vi.fn().mockResolvedValue(undefined),
    });
    expect(summary.autoSent).toBe(3);
    expect(summary.capReached).toBe(true);
  });

  it('alerts once on a same-show cluster', async () => {
    const tickets = ['t1', 't2', 't3'].map(id => ticket(id, { show_id: 'show-1' }));
    const messages = tickets.map(t => message(t.id));
    const source = makeSource(tickets, messages);
    const notify = vi.fn().mockResolvedValue(undefined);
    const summary = await runPass({
      ...baseDeps(),
      source,
      answers: [],
      classify: vi.fn().mockResolvedValue({ kind: 'novel', draft: 'x', clusterLabel: 'y' }),
      notify,
    });
    expect(summary.clustersAlerted).toBe(1);
    const subjects = notify.mock.calls.map(call => call[0] as string);
    expect(subjects.some(subject => subject.includes('one show'))).toBe(true);
  });

  it('does not re-alert a cluster it has already alerted on', async () => {
    const tickets = ['t1', 't2', 't3'].map(id => ticket(id, { show_id: 'show-1' }));
    const messages = tickets.map(t => message(t.id));
    const source = makeSource(tickets, messages);
    const summary = await runPass({
      ...baseDeps(),
      state: {
        draftedMessageIds: [],
        alertedClusterKeys: [`show-1|${NOW.toISOString()}`],
      },
      source,
      answers: [],
      classify: vi.fn().mockResolvedValue({ kind: 'novel', draft: 'x', clusterLabel: 'y' }),
      notify: vi.fn().mockResolvedValue(undefined),
    });
    expect(summary.clustersAlerted).toBe(0);
  });

  it('does nothing at all on an empty queue', async () => {
    const source = makeSource([], []);
    const notify = vi.fn();
    const summary = await runPass({
      ...baseDeps(),
      source,
      answers: PROMOTED,
      classify: vi.fn(),
      notify,
    });
    expect(summary).toMatchObject({ considered: 0, autoSent: 0, drafted: 0, clustersAlerted: 0 });
    expect(notify).not.toHaveBeenCalled();
  });
});
