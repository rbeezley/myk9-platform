import type { AskQGuideAsset, AskQRulebookAsset } from './documentContext.ts';
import { buildGuidesPrompt, buildRulebookPrompt, buildShowDataPrompt } from './sourcePrompts.ts';
import { parseSupportAnswer, type SupportEscalationPayload } from './supportMode.ts';
import type { SupportQuoteRefusal, VerifiedGuideQuote } from './supportQuoteEvidence.ts';
import { TOOLS } from './toolDefinitions.ts';
import type { ClaudeContentBlock, ClaudeMessage, ModelCall, UserContext } from './types.ts';

export const MAX_TOOL_ITERATIONS = 5;

/** Runs one tool for the show-data answerer; index.ts binds the clients and collects sources. */
export type ToolRunner = (name: string, input: Record<string, unknown>) => Promise<unknown>;

interface AnswererBase {
  call: ModelCall;
  message: string;
  userContext: UserContext;
}

function firstText(reply: { content: Array<{ type: string; text?: string }> }): string {
  return reply.content.find(block => block.type === 'text')?.text ?? '';
}

export interface GuidesAnswer {
  /** Verified-quote text, or null when the answer was refused. Never raw model text. */
  text: string | null;
  guideSources: VerifiedGuideQuote[];
  escalation: SupportEscalationPayload | null;
  escalationCause: SupportQuoteRefusal | null;
}

/** Guides only, no tools. Whatever the model wrote is shown only if its quotes verify. */
export async function answerFromGuides(
  input: AnswererBase & { hasStaffRole: boolean; allGuides: AskQGuideAsset[] }
): Promise<GuidesAnswer> {
  const { systemPrompt, guides } = buildGuidesPrompt(input);
  const reply = await input.call([{ role: 'user', content: input.message }], [], systemPrompt);
  const parsed = parseSupportAnswer(firstText(reply), guides);
  if (parsed.escalation) {
    return {
      text: null,
      guideSources: [],
      escalation: parsed.escalation,
      escalationCause: parsed.escalationCause,
    };
  }
  return {
    text: parsed.answerText,
    guideSources: parsed.guideSources,
    escalation: null,
    escalationCause: null,
  };
}

/** Selected rulebook only, no tools, no guides. An ambiguous rulebook becomes its clarification. */
export async function answerFromRulebook(
  input: AnswererBase & { rulebooks: AskQRulebookAsset[]; clarification: string | null }
): Promise<string | null> {
  if (input.clarification) return input.clarification;
  if (input.rulebooks.length === 0) return null;
  const systemPrompt = buildRulebookPrompt(input);
  const reply = await input.call([{ role: 'user', content: input.message }], [], systemPrompt);
  return firstText(reply).trim() || null;
}

export interface ShowDataAnswer {
  text: string | null;
  toolsUsed: string[];
}

/** The tool loop: no guide text, no rulebook text. */
export async function answerFromShowData(
  input: AnswererBase & { runTool: ToolRunner }
): Promise<ShowDataAnswer> {
  const systemPrompt = buildShowDataPrompt(input);
  const messages: ClaudeMessage[] = [{ role: 'user', content: input.message }];
  const toolsUsed: string[] = [];

  let result = await input.call(messages, TOOLS, systemPrompt);
  let iterations = 0;
  while (result.stop_reason === 'tool_use') {
    if (++iterations > MAX_TOOL_ITERATIONS) break;

    messages.push({ role: 'assistant', content: result.content as ClaudeContentBlock[] });
    const toolResults: ClaudeContentBlock[] = [];
    for (const block of result.content) {
      if (block.type !== 'tool_use') continue;
      toolsUsed.push(block.name!);
      const toolResult = await input.runTool(block.name!, block.input!);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id!,
        content: JSON.stringify(toolResult),
      });
    }
    messages.push({ role: 'user', content: toolResults });
    result = await input.call(messages, TOOLS, systemPrompt);
  }
  return { text: firstText(result).trim() || null, toolsUsed };
}
