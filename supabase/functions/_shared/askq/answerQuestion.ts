import type { AskQGuideAsset, AskQRulebookAsset } from './documentContext.ts';
import { resolveRulebookContext } from './requestRouting.ts';
import { classifyQuestionSources, type AskQSource } from './sourceClassifier.ts';
import {
  answerFromGuides,
  answerFromRulebook,
  answerFromShowData,
  type GuidesAnswer,
  type ToolRunner,
} from './sourceAnswerers.ts';
import { joinSourceSections, NEEDS_SHOW_SENTENCE, type SourceSection } from './sourceJoin.ts';
import { getSupportEscalationForQuestion, type SupportEscalationPayload } from './supportMode.ts';
import type {
  SupportQuoteRefusal,
  SupportQuoteRejection,
  VerifiedGuideQuote,
} from './supportQuoteEvidence.ts';
import type { AskQRulebookScope, ModelCall, UserContext } from './types.ts';

export interface AnswerQuestionInput {
  message: string;
  userContext: UserContext;
  hasStaffRole: boolean;
  supportMode: boolean;
  rulebookScope?: AskQRulebookScope;
  allGuides: AskQGuideAsset[];
  allRulebooks: AskQRulebookAsset[];
  showRulebooks: AskQRulebookAsset[];
  call: ModelCall;
  runTool: ToolRunner;
}

export interface AnsweredQuestion {
  /** The sources the classifier chose, in join order. */
  sources: AskQSource[];
  text: string;
  /** Real tool names only. */
  toolsUsed: string[];
  guideSources: VerifiedGuideQuote[];
  /** Set only when guides was the sole source and refused or tripped the money pre-check on a supportMode request. */
  escalation: SupportEscalationPayload | null;
  escalationCause: SupportQuoteRefusal | 'precheck' | null;
  /**
   * Set whenever the guides were asked and refused, on any route, escalation or not (MYK9-2473):
   * a mixed route's refused guide half used to leave no trace in the log.
   */
  guideRefusal: GuideRefusal | null;
}

/** Why the guides refused: the model handed off, or a named quote rule rejected its answer. */
export interface GuideRefusal {
  cause: SupportQuoteRefusal;
  detail: SupportQuoteRejection | null;
}

/**
 * The `tools_used` markers a refused guide answer logs (`chatbot_query_log.tools_used`), so an
 * operator can read why: `support_handoff`, or `support_quote_rejected` with the rule that
 * rejected it, such as `support_quote_too_short` (MYK9-2472).
 */
export function guideRefusalMarkers(refusal: GuideRefusal | null): string[] {
  if (!refusal) return [];
  if (refusal.cause !== 'quote_rejected') return ['support_handoff'];
  return ['support_quote_rejected', ...(refusal.detail ? [`support_${refusal.detail}`] : [])];
}

/** The `tools_used` markers an escalation logs; the cause tells money pre-checks from guide refusals. */
export function escalationMarkers(
  cause: AnsweredQuestion['escalationCause'],
  detail: SupportQuoteRejection | null = null
): string[] {
  return [
    'support_escalation',
    ...(cause === 'precheck'
      ? ['support_precheck']
      : guideRefusalMarkers({ cause: cause ?? 'handoff', detail })),
  ];
}

/** What a question logs about a refused guide answer: the escalation, or the refusal alone. */
export function refusalMarkers(
  answered: Pick<AnsweredQuestion, 'escalation' | 'escalationCause' | 'guideRefusal'>
): string[] {
  return answered.escalation
    ? escalationMarkers(answered.escalationCause, answered.guideRefusal?.detail ?? null)
    : guideRefusalMarkers(answered.guideRefusal);
}

function guideRefusalOf(guides: GuidesAnswer | null): GuideRefusal | null {
  if (!guides?.escalation) return null;
  return { cause: guides.escalationCause ?? 'handoff', detail: guides.escalationDetail };
}

export function routeMarkers(sources: AskQSource[]): string[] {
  return sources.map(source => `route_${source}`);
}

/**
 * Guide sources go in the `sources` event only on supportMode requests. The show-page
 * client cannot render them yet (it would print raw JSON); the verified quotes are
 * already in the answer text. MYK9-1826 lifts this once the panel renders guide sources.
 */
export function guideSourcesForEvent(
  answered: Pick<AnsweredQuestion, 'guideSources'>,
  supportMode: boolean
): VerifiedGuideQuote[] {
  return supportMode ? answered.guideSources : [];
}

/** One classifier call, then each chosen source answered under its own guard, in parallel. */
export async function answerQuestion(input: AnswerQuestionInput): Promise<AnsweredQuestion> {
  const hasVerifiedShow = input.userContext.showId !== null;
  const {
    sources: chosen,
    needsShow,
    fallback,
  } = await classifyQuestionSources({
    message: input.message,
    hasVerifiedShow,
    showRegistries: input.userContext.showRegistries ?? [],
    call: input.call,
  });
  // Money and destructive-action pre-check: only a question routed to the guides alone (app
  // help). Rules and show-data questions that merely use money words ("how many entries have
  // paid?", "AKC withdrawal rule") are answered. A mixed route is answered too: its guide
  // section is quoted from the guides under the support prompt, which never answers account money.
  const guidesOnly = chosen.length === 1 && chosen[0] === 'guides' && !needsShow;
  // A classifier failure (fallback) counts as guides-only for this check only: with no verdict,
  // a refund or delete question must not reach show data or the rulebook.
  const precheck =
    (guidesOnly || fallback) && input.supportMode
      ? getSupportEscalationForQuestion(input.message)
      : null;
  if (precheck) {
    return {
      sources: chosen,
      text: '',
      toolsUsed: [],
      guideSources: [],
      escalation: precheck,
      escalationCause: 'precheck',
      guideRefusal: null,
    };
  }
  const base = { call: input.call, message: input.message, userContext: input.userContext };

  const rulebookResolution = chosen.includes('rulebook')
    ? resolveRulebookContext({
        allRulebooks: input.allRulebooks,
        showRulebooks: input.showRulebooks,
        hasVerifiedShowContext: hasVerifiedShow,
        message: input.message,
        rulebookScope: input.rulebookScope,
      })
    : null;

  const [showData, guides, rulebookText] = await Promise.all([
    chosen.includes('show_data') ? answerFromShowData({ ...base, runTool: input.runTool }) : null,
    chosen.includes('guides')
      ? answerFromGuides({ ...base, hasStaffRole: input.hasStaffRole, allGuides: input.allGuides })
      : null,
    rulebookResolution
      ? answerFromRulebook({
          ...base,
          rulebooks: rulebookResolution.rulebooks,
          clarification: rulebookResolution.clarification,
        })
      : null,
  ]);

  const sections: SourceSection[] = [];
  if (needsShow) sections.push({ source: 'show_data', text: NEEDS_SHOW_SENTENCE, plain: true });
  if (showData) sections.push({ source: 'show_data', text: showData.text });
  if (guides) sections.push({ source: 'guides', text: guides.text });
  if (rulebookResolution) sections.push({ source: 'rulebook', text: rulebookText });

  const guidesOnlyRefused =
    chosen.length === 1 && !needsShow && guides?.escalation && input.supportMode;
  return {
    sources: chosen,
    text: joinSourceSections(sections),
    toolsUsed: showData?.toolsUsed ?? [],
    guideSources: guides?.guideSources ?? [],
    escalation: guidesOnlyRefused ? (guides?.escalation ?? null) : null,
    escalationCause: guidesOnlyRefused ? (guides?.escalationCause ?? null) : null,
    guideRefusal: guideRefusalOf(guides),
  };
}
