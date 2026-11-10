import type { ModelCall } from './types.ts';

/** The three places an answer can come from. Order here is the order they are joined in. */
export type AskQSource = 'show_data' | 'guides' | 'rulebook';

export const ASKQ_SOURCES: readonly AskQSource[] = ['show_data', 'guides', 'rulebook'];

const CLASSIFIER_MAX_TOKENS = 60;

export const CLASSIFIER_SYSTEM_PROMPT = `You route questions for AskQ, the assistant inside the myK9Show dog show app. Decide which sources are needed to answer the user's question. You do not answer it.

Sources:
- "show_data": anything about THIS show's live state: is a class running yet, is my dog entered, was my entry cancelled or withdrawn, results, placements, the schedule, entry counts. Choose it even when the question names a class level such as Novice, Advanced or Master, if it asks what is happening or what was recorded in this show. Only available when the request says a show is in context.
- "rulebook": what the registry's official rules allow or require (time limits, faults, hides, eligibility, class requirements), whatever the registry is.
- "guides": how to do something in the app, and the app's own stated policies: leaving a class (Pull or Withdraw), refunds as the app's guide words them, late entries, entering, scoring steps.

A question may need more than one source, for example "can I withdraw for in season, and how?" needs the rulebook (is it allowed) and the guides (how). Choose every source the question needs and no others.

Reply with JSON only, no other text, in exactly this form: {"sources":["guides"]}`;

export interface ClassifyInput {
  message: string;
  hasVerifiedShow: boolean;
  showRegistries: string[];
  call: ModelCall;
}

export function applicableSources(hasVerifiedShow: boolean): AskQSource[] {
  return ASKQ_SOURCES.filter(source => hasVerifiedShow || source !== 'show_data');
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

/** Defensive parse: accepts {"sources":[...]} or a bare array, keeps only the three known strings. */
export function parseClassifierReply(reply: string): AskQSource[] {
  const text = stripFences(reply);
  const candidates = [text, /\{[\s\S]*\}/.exec(text)?.[0], /\[[\s\S]*\]/.exec(text)?.[0]];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      const list = Array.isArray(parsed) ? parsed : (parsed as { sources?: unknown })?.sources;
      if (!Array.isArray(list)) continue;
      return ASKQ_SOURCES.filter(source => list.includes(source));
    } catch {
      // Try the next candidate.
    }
  }
  return [];
}

/**
 * Chooses the sources for a question. A reply that does not parse, an empty set
 * or a failed call falls back to every applicable source: a classifier failure
 * must never fail the request. show_data is dropped without a verified show.
 */
export async function classifyQuestionSources(input: ClassifyInput): Promise<AskQSource[]> {
  const applicable = applicableSources(input.hasVerifiedShow);
  try {
    const registries =
      input.showRegistries.length > 0 ? input.showRegistries.join(', ') : 'none or unknown';
    const userMessage = `A verified show is in context: ${input.hasVerifiedShow ? 'yes' : 'no'}\nShow registries: ${registries}\n\nQuestion:\n${input.message}`;
    const reply = await input.call(
      [{ role: 'user', content: userMessage }],
      [],
      CLASSIFIER_SYSTEM_PROMPT,
      CLASSIFIER_MAX_TOKENS
    );
    const text = reply.content.find(block => block.type === 'text')?.text ?? '';
    const chosen = parseClassifierReply(text).filter(source => applicable.includes(source));
    return chosen.length > 0 ? chosen : applicable;
  } catch (error) {
    console.error('AskQ classifier failed, using every source:', (error as Error).message);
    return applicable;
  }
}
