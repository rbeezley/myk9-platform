import type { AskQGuideAsset, AskQRulebookAsset } from './documentContext.ts';
import { resolveRulebookContext } from './requestRouting.ts';
import { classifyQuestionSources, type AskQSource } from './sourceClassifier.ts';
import {
  answerFromGuides,
  answerFromRulebook,
  answerFromShowData,
  type ToolRunner,
} from './sourceAnswerers.ts';
import { joinSourceSections, type SourceSection } from './sourceJoin.ts';
import type { SupportEscalationPayload } from './supportMode.ts';
import type { SupportQuoteRefusal, VerifiedGuideQuote } from './supportQuoteEvidence.ts';
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
  /** Set only when guides was the sole source and refused on a supportMode request. */
  escalation: SupportEscalationPayload | null;
  escalationCause: SupportQuoteRefusal | null;
}

export function routeMarkers(sources: AskQSource[]): string[] {
  return sources.map(source => `route_${source}`);
}

/** One classifier call, then each chosen source answered under its own guard, in parallel. */
export async function answerQuestion(input: AnswerQuestionInput): Promise<AnsweredQuestion> {
  const hasVerifiedShow = input.userContext.showId !== null;
  const chosen = await classifyQuestionSources({
    message: input.message,
    hasVerifiedShow,
    showRegistries: input.userContext.showRegistries ?? [],
    call: input.call,
  });
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
  if (showData) sections.push({ source: 'show_data', text: showData.text });
  if (guides) sections.push({ source: 'guides', text: guides.text });
  if (rulebookResolution) sections.push({ source: 'rulebook', text: rulebookText });

  const guidesOnlyRefused = chosen.length === 1 && guides?.escalation && input.supportMode;
  return {
    sources: sections.map(section => section.source),
    text: joinSourceSections(sections),
    toolsUsed: showData?.toolsUsed ?? [],
    guideSources: guides?.guideSources ?? [],
    escalation: guidesOnlyRefused ? (guides?.escalation ?? null) : null,
    escalationCause: guidesOnlyRefused ? (guides?.escalationCause ?? null) : null,
  };
}
