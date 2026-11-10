// @vitest-environment node
// MYK9-1825: no live model call. A stub dispatches on the system prompt, so a stubbed
// classifier verdict plus stubbed answerer replies run the real orchestration end to end.
import { describe, expect, it, vi } from 'vitest';
import { answerQuestion, routeMarkers, type AnswerQuestionInput } from './answerQuestion.ts';
import { ASKQ_GUIDES, ASKQ_RULEBOOKS } from './documentAssets.ts';
import { CLASSIFIER_SYSTEM_PROMPT, type AskQSource } from './sourceClassifier.ts';
import { NO_GUIDE_ANSWER_SENTENCE, SHOW_DATA_LABEL } from './sourceJoin.ts';
import { TOOLS } from './toolDefinitions.ts';
import type { ClaudeMessage, ModelCall, ModelReply, ToolDefinition, UserContext } from './types.ts';

const ENTRY_FEE_ONLY = 'Any refund returns the entry fee only.';
const SERVICE_FEE =
  'The service fee you paid at checkout is not refunded, including when the show is cancelled.';
const LATE_ENTRY =
  'Same flow as entering for someone else. The row is greyed, with the reason, when no class has room.';
const GUIDE_REPLY = `SUPPORT_ANSWER\nSUPPORT_QUOTE [exhibitor-guide]: "${ENTRY_FEE_ONLY} ${SERVICE_FEE}"`;
const LATE_ENTRY_REPLY = `SUPPORT_ANSWER\nSUPPORT_QUOTE [secretary-guide]: "${LATE_ENTRY}"`;
const RULE_REPLY = 'Using AKC Scent Work rules:\nA dog in season may be withdrawn.';

const akcRulebook = ASKQ_RULEBOOKS.find(rulebook => rulebook.id === 'akc-scent-work')!;
const showContext: UserContext = {
  userId: 'u',
  displayName: 'Pat',
  dogs: [],
  showId: 'show-1',
  showName: 'Heartland Classic',
  showRegistries: ['AKC Scent Work'],
};
const noShowContext: UserContext = { ...showContext, showId: null, showName: null };

const text = (value: string): ModelReply => ({
  content: [{ type: 'text', text: value }],
  stop_reason: 'end_turn',
});

interface Recorded {
  system: string;
  tools: ToolDefinition[];
  messages: ClaudeMessage[];
}

function stubModel(opts: {
  verdict: AskQSource[] | string;
  guides?: string;
  rulebook?: string;
  showData?: string;
  toolCall?: { name: string; input: Record<string, unknown> };
}) {
  const recorded = {
    classifier: [] as Recorded[],
    guides: [] as Recorded[],
    rulebook: [] as Recorded[],
    showData: [] as Recorded[],
  };
  let toolSent = false;
  const call: ModelCall = async (messages, tools, system) => {
    const entry = { system, tools, messages: structuredClone(messages) };
    if (system === CLASSIFIER_SYSTEM_PROMPT) {
      recorded.classifier.push(entry);
      return text(
        typeof opts.verdict === 'string' ? opts.verdict : JSON.stringify({ sources: opts.verdict })
      );
    }
    if (system.includes('SUPPORT MODE')) {
      recorded.guides.push(entry);
      return text(opts.guides ?? 'SUPPORT_HANDOFF');
    }
    if (system.includes('SOURCE: Official rulebook')) {
      recorded.rulebook.push(entry);
      return text(opts.rulebook ?? '');
    }
    recorded.showData.push(entry);
    if (opts.toolCall && !toolSent) {
      toolSent = true;
      return {
        content: [
          { type: 'tool_use', id: 't1', name: opts.toolCall.name, input: opts.toolCall.input },
        ],
        stop_reason: 'tool_use',
      };
    }
    return text(opts.showData ?? '');
  };
  return { call, recorded };
}

const run = (model: ReturnType<typeof stubModel>, over: Partial<AnswerQuestionInput> = {}) => {
  const runTool = vi.fn(async () => ({ result: { classes: [] } }));
  return {
    runTool,
    promise: answerQuestion({
      message: 'q',
      userContext: showContext,
      hasStaffRole: false,
      supportMode: false,
      allGuides: ASKQ_GUIDES,
      allRulebooks: ASKQ_RULEBOOKS,
      showRulebooks: [akcRulebook],
      call: model.call,
      runTool,
      ...over,
    }),
  };
};

const SWITCH_TALK = /switch (to|modes?|tabs?)|another tab|different tab|ask the user to switch/i;

describe('golden questions, no mode sent', () => {
  it('exhibitor leave-class on a show page: guides, Exhibitor Guide section 9, verified quotes only', async () => {
    const model = stubModel({
      verdict: ['guides'],
      guides: `Sure, here you go.\n${GUIDE_REPLY}\nExtra prose.`,
    });
    const { promise } = run(model, { message: 'How do I drop my dog from the class?' });
    // Prose before the marker fails closed, so use the clean reply in the real check below.
    expect((await promise).guideSources).toEqual([]);

    const clean = stubModel({
      verdict: ['guides'],
      guides: `${GUIDE_REPLY}\nExtra prose the user must not see.`,
    });
    const answered = await run(clean).promise;
    const [guidesCall] = clean.recorded.guides;
    expect(guidesCall.system).toContain('## Section 9 — Leave a Class: Withdraw or Pull');
    expect(guidesCall.system).not.toContain('<guide id="secretary-guide"');
    expect(guidesCall.system).not.toContain('<selected_rulebook');
    expect(guidesCall.system).not.toContain('ask which registry/sport');
    expect(guidesCall.tools).toEqual([]);
    expect(clean.recorded.showData).toEqual([]);
    expect(clean.recorded.rulebook).toEqual([]);
    expect(answered.sources).toEqual(['guides']);
    expect(answered.text).toMatch(/^From the .*Exhibitor.*:\n“/);
    expect(answered.text).toContain(ENTRY_FEE_ONLY);
    expect(answered.text).not.toContain('Extra prose');
    expect(answered.guideSources.map(source => source.id)).toEqual(['exhibitor-guide']);
  });

  it('secretary late entry on an AKC show: the secretary guide, AKC only', async () => {
    const model = stubModel({ verdict: ['guides'], guides: LATE_ENTRY_REPLY });
    const answered = await run(model, { hasStaffRole: true }).promise;
    const [guidesCall] = model.recorded.guides;
    expect(guidesCall.system).toContain('<guide id="secretary-guide"');
    expect(guidesCall.system).toContain('Add late entry');
    expect(guidesCall.system).toContain('exactly one registry and sport: AKC Scent Work');
    expect(answered.text).toContain(LATE_ENTRY);
    expect(answered.sources).toEqual(['guides']);
  });

  it('rules question on an AKC show: the AKC rulebook with its label, no guides, no tools', async () => {
    const model = stubModel({ verdict: ['rulebook'], rulebook: RULE_REPLY });
    const answered = await run(model).promise;
    const [rulebookCall] = model.recorded.rulebook;
    expect(rulebookCall.system).toContain(`<selected_rulebook id="${akcRulebook.id}"`);
    expect(rulebookCall.system).toContain('"Using AKC Scent Work rules:"');
    expect(rulebookCall.system).not.toContain('<guide id=');
    expect(rulebookCall.tools).toEqual([]);
    expect(answered.text).toBe(RULE_REPLY);
    expect(answered.sources).toEqual(['rulebook']);
  });

  it('show-data question on a show page: the tools, no guide or rulebook text', async () => {
    const model = stubModel({
      verdict: ['show_data'],
      showData: 'Novice Interior is running in Ring 2.',
      toolCall: { name: 'get_class_summary', input: { level: 'Novice' } },
    });
    const { promise, runTool } = run(model);
    const answered = await promise;
    const [first] = model.recorded.showData;
    expect(first.tools).toEqual(TOOLS);
    expect(first.system).not.toContain('<guide id=');
    expect(first.system).not.toContain('<selected_rulebook');
    expect(runTool).toHaveBeenCalledWith('get_class_summary', { level: 'Novice' });
    expect(answered.toolsUsed).toEqual(['get_class_summary']);
    expect(answered.text).toBe('Novice Interior is running in Ring 2.');
  });
});

describe('a guide question on a show page asserts a verified excerpt (criterion 5)', () => {
  it('shows the exhibitor-guide excerpt, verbatim from the guide', async () => {
    const model = stubModel({ verdict: ['guides'], guides: GUIDE_REPLY });
    const answered = await run(model, { message: 'How do I leave a class?' }).promise;
    expect(answered.guideSources).toHaveLength(1);
    expect(answered.guideSources[0].quote).toContain(ENTRY_FEE_ONLY);
    const guide = ASKQ_GUIDES.find(g => g.id === 'exhibitor-guide')!;
    expect(guide.content).toContain(ENTRY_FEE_ONLY);
  });
});

describe('Codex round-1 cases reach the show-data tools (#3731)', () => {
  it.each([
    'Is Novice Interior running yet?',
    'Is my dog entered in Novice Interior?',
    'Has my entry been cancelled?',
  ])('%s', async question => {
    const model = stubModel({
      verdict: ['show_data'],
      showData: 'Answer from tools.',
      toolCall: { name: 'search_entries', input: {} },
    });
    const { promise, runTool } = run(model, { message: question });
    const answered = await promise;
    expect(model.recorded.classifier[0].messages[0].content).toContain(question);
    expect(model.recorded.showData[0].tools).toEqual(TOOLS);
    expect(runTool).toHaveBeenCalledTimes(1);
    expect(answered.sources).toEqual(['show_data']);
  });
});

describe('mixed questions', () => {
  it('answers from guides and rulebook, each labelled, in the fixed order', async () => {
    const model = stubModel({
      verdict: ['rulebook', 'guides'],
      guides: GUIDE_REPLY,
      rulebook: RULE_REPLY,
    });
    const answered = await run(model, {
      message: 'Can I withdraw for in season, and how?',
    }).promise;
    expect(answered.sources).toEqual(['guides', 'rulebook']);
    expect(answered.text.indexOf('From the')).toBeLessThan(
      answered.text.indexOf('Using AKC Scent Work rules:')
    );
    expect(answered.text).toContain(ENTRY_FEE_ONLY);
    expect(answered.text).toContain(RULE_REPLY);
  });

  it('labels show data when it joins another source', async () => {
    const model = stubModel({
      verdict: ['show_data', 'guides'],
      guides: GUIDE_REPLY,
      showData: 'Withdrawn: 2.',
    });
    const answered = await run(model).promise;
    expect(answered.text.startsWith(`${SHOW_DATA_LABEL}\nWithdrawn: 2.\n\nFrom the`)).toBe(true);
  });

  it('keeps the rulebook clarification as the rulebook section', async () => {
    const model = stubModel({ verdict: ['rulebook', 'guides'], guides: GUIDE_REPLY });
    const answered = await run(model, {
      userContext: noShowContext,
      showRulebooks: [],
    }).promise;
    expect(model.recorded.rulebook).toEqual([]);
    expect(answered.text).toContain('Which rulebook should I use:');
    expect(answered.text).toContain('From the');
  });
});

describe('no prompt tells the user to switch modes or tabs (criterion 3)', () => {
  it('holds for every prompt of every source', async () => {
    const model = stubModel({
      verdict: ['show_data', 'guides', 'rulebook'],
      guides: GUIDE_REPLY,
      rulebook: RULE_REPLY,
      showData: 'ok',
    });
    await run(model, { hasStaffRole: true }).promise;
    const prompts = [
      ...model.recorded.guides,
      ...model.recorded.rulebook,
      ...model.recorded.showData,
    ].map(r => r.system);
    expect(prompts).toHaveLength(3);
    for (const prompt of prompts) expect(prompt).not.toMatch(SWITCH_TALK);
    expect(CLASSIFIER_SYSTEM_PROMPT).not.toMatch(SWITCH_TALK);
  });
});

describe('guide claims fail closed (criterion 4)', () => {
  const proseThenAnswer = `Great question! Here is what I know: leave the class any time.\n${GUIDE_REPLY}`;
  const fabricated = `SUPPORT_ANSWER\nSUPPORT_QUOTE [exhibitor-guide]: "You may withdraw until midnight the day before the show for a full refund."`;
  const tooMany = [
    'SUPPORT_ANSWER',
    ...Array(4).fill(`SUPPORT_QUOTE [exhibitor-guide]: "${ENTRY_FEE_ONLY} ${SERVICE_FEE}"`),
  ].join('\n');

  it.each([
    ['introductory prose before the marker', proseThenAnswer],
    ['a quote that is not in the guide', fabricated],
    ['too many quotes', tooMany],
    ['a plain unmarked answer', 'You can leave a class from your entry and get a full refund.'],
    ['a handoff', 'SUPPORT_HANDOFF\nI need to get a person to help with that.'],
    ['an empty reply', ''],
  ])('shows no guide text for %s', async (_label, reply) => {
    const model = stubModel({ verdict: ['guides'], guides: reply });
    const answered = await run(model).promise;
    expect(answered.text).toBe(NO_GUIDE_ANSWER_SENTENCE);
    expect(answered.guideSources).toEqual([]);
  });

  it('does not let another source vouch for refused guide prose', async () => {
    const model = stubModel({
      verdict: ['show_data', 'guides'],
      guides: proseThenAnswer,
      showData: 'Withdrawn: 2.',
    });
    const answered = await run(model).promise;
    expect(answered.text).toBe(`${SHOW_DATA_LABEL}\nWithdrawn: 2.\n\n${NO_GUIDE_ANSWER_SENTENCE}`);
    expect(answered.text).not.toContain('Great question');
  });

  it('escalates only when guides was the sole source on a supportMode request', async () => {
    const sole = await run(stubModel({ verdict: ['guides'], guides: fabricated }), {
      supportMode: true,
    }).promise;
    expect(sole.escalation?.escalate).toBe(true);
    expect(sole.escalationCause).toBe('quote_rejected');

    const plain = await run(stubModel({ verdict: ['guides'], guides: fabricated })).promise;
    expect(plain.escalation).toBeNull();
    expect(plain.text).toBe(NO_GUIDE_ANSWER_SENTENCE);

    const shared = await run(
      stubModel({ verdict: ['guides', 'rulebook'], guides: fabricated, rulebook: RULE_REPLY }),
      { supportMode: true }
    ).promise;
    expect(shared.escalation).toBeNull();
    expect(shared.text).toBe(`${NO_GUIDE_ANSWER_SENTENCE}\n\n${RULE_REPLY}`);
  });
});

describe('classifier failure and bookkeeping', () => {
  it('asks every applicable source when the verdict is unusable', async () => {
    const model = stubModel({
      verdict: 'garbage',
      guides: GUIDE_REPLY,
      rulebook: RULE_REPLY,
      showData: 'ok',
    });
    const answered = await run(model).promise;
    expect(answered.sources).toEqual(['show_data', 'guides', 'rulebook']);
  });

  it('never asks for show data without a verified show', async () => {
    const model = stubModel({ verdict: ['show_data', 'guides'], guides: GUIDE_REPLY });
    const answered = await run(model, { userContext: noShowContext, showRulebooks: [] }).promise;
    expect(answered.sources).toEqual(['guides']);
    expect(model.recorded.showData).toEqual([]);
  });

  it('makes one classifier call and marks the chosen sources for tools_used', async () => {
    const model = stubModel({
      verdict: ['guides', 'rulebook'],
      guides: GUIDE_REPLY,
      rulebook: RULE_REPLY,
    });
    const answered = await run(model).promise;
    expect(model.recorded.classifier).toHaveLength(1);
    expect(routeMarkers(answered.sources)).toEqual(['route_guides', 'route_rulebook']);
    expect(answered.toolsUsed).toEqual([]);
  });
});
