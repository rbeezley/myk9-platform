import { describe, expect, it, vi } from 'vitest';
import { classifyThread } from './classify';
import type { CannedAnswer } from './answers';
import type { TicketThread } from './types';

const THREAD: TicketThread = {
  ticket: {
    id: 'ticket-1',
    owner_id: 'owner-1',
    subject: 'Where is my armband?',
    status: 'open',
    is_show_day_priority: false,
    show_id: 'show-1',
    created_at: '2026-08-01T10:00:00.000Z',
  },
  messages: [
    {
      id: 'm1',
      ticket_id: 'ticket-1',
      sender_id: 'owner-1',
      body: 'Where do I find my armband number?',
      is_from_operator: false,
      created_at: '2026-08-01T10:00:00.000Z',
    },
  ],
};

const ANSWERS: CannedAnswer[] = [
  {
    id: 'armband-lookup',
    label: 'Armband lookup',
    whenToUse: 'Exhibitor asks where to find their armband number',
    reply: 'Open My Entries.',
    autoSend: true,
  },
];

function reply(payload: unknown) {
  return vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(payload) }] });
}

describe('classifyThread', () => {
  it('returns a canned classification when the model names a known answer', async () => {
    const createMessage = reply({ kind: 'canned', answerId: 'armband-lookup' });
    await expect(classifyThread(THREAD, { createMessage, answers: ANSWERS })).resolves.toEqual({
      kind: 'canned',
      answerId: 'armband-lookup',
    });
  });

  it('downgrades to novel when the model names an answer id that does not exist', async () => {
    const createMessage = reply({ kind: 'canned', answerId: 'invented-answer' });
    const result = await classifyThread(THREAD, { createMessage, answers: ANSWERS });
    expect(result.kind).toBe('novel');
  });

  it('returns the draft and cluster label for a novel ticket', async () => {
    const createMessage = reply({
      kind: 'novel',
      draft: 'You can find it under My Entries.',
      clusterLabel: 'armband location',
    });
    await expect(classifyThread(THREAD, { createMessage, answers: ANSWERS })).resolves.toEqual({
      kind: 'novel',
      draft: 'You can find it under My Entries.',
      clusterLabel: 'armband location',
    });
  });

  it('downgrades to novel when the response is not valid JSON', async () => {
    const createMessage = vi
      .fn()
      .mockResolvedValue({ content: [{ type: 'text', text: 'not json at all' }] });
    const result = await classifyThread(THREAD, { createMessage, answers: ANSWERS });
    expect(result.kind).toBe('novel');
  });

  it('downgrades to novel when the response has no text block at all', async () => {
    const createMessage = vi.fn().mockResolvedValue({ content: [] });
    const result = await classifyThread(THREAD, { createMessage, answers: ANSWERS });
    expect(result.kind).toBe('novel');
  });

  it('downgrades to novel when a novel classification carries an empty draft', async () => {
    const createMessage = reply({ kind: 'novel', draft: '   ', clusterLabel: 'x' });
    const result = await classifyThread(THREAD, { createMessage, answers: ANSWERS });
    expect(result.kind).toBe('novel');
    if (result.kind === 'novel') expect(result.draft.trim()).not.toBe('');
  });

  it('never sends removed sampling parameters and pins the model id', async () => {
    const createMessage = reply({ kind: 'canned', answerId: 'armband-lookup' });
    await classifyThread(THREAD, { createMessage, answers: ANSWERS });
    const request = createMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(request.temperature).toBeUndefined();
    expect(request.top_p).toBeUndefined();
    expect(request.top_k).toBeUndefined();
    expect(request.model).toBe('claude-opus-5');
  });

  it('constrains the answer id to the registry via an enum', async () => {
    const createMessage = reply({ kind: 'canned', answerId: 'armband-lookup' });
    await classifyThread(THREAD, { createMessage, answers: ANSWERS });
    const request = createMessage.mock.calls[0][0] as {
      output_config: { format: { schema: { properties: { answerId: { enum: string[] } } } } };
    };
    const allowed = request.output_config.format.schema.properties.answerId.enum;
    expect(allowed).toContain('armband-lookup');
    expect(allowed).toContain('none');
    expect(allowed).toHaveLength(2);
  });

  it('sends an empty-registry enum containing only the sentinel', async () => {
    const createMessage = reply({ kind: 'novel', draft: 'x', clusterLabel: 'y' });
    await classifyThread(THREAD, { createMessage, answers: [] });
    const request = createMessage.mock.calls[0][0] as {
      output_config: { format: { schema: { properties: { answerId: { enum: string[] } } } } };
    };
    expect(request.output_config.format.schema.properties.answerId.enum).toEqual(['none']);
  });

  it('never places the canned reply text in the prompt', async () => {
    const createMessage = reply({ kind: 'canned', answerId: 'armband-lookup' });
    await classifyThread(THREAD, { createMessage, answers: ANSWERS });
    const request = createMessage.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('armband-lookup');
    expect(request.system).not.toContain('Open My Entries.');
  });

  it('wraps ticket text in data tags and labels each speaker', async () => {
    const createMessage = reply({ kind: 'novel', draft: 'x', clusterLabel: 'y' });
    await classifyThread(THREAD, { createMessage, answers: ANSWERS });
    const request = createMessage.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.messages[0].content).toContain('<ticket_thread>');
    expect(request.messages[0].content).toContain('EXHIBITOR: Where do I find my armband number?');
  });
});
