import type { AskQQuestionMode, AskQRulebookScope } from './types.ts';
import {
  type AskQRulebookAsset,
  getRulebooksForDocumentContext,
  getRulebookScopeOptions,
} from './documentContext.ts';

const QUESTION_MODES: AskQQuestionMode[] = ['app-help', 'rules', 'show-data'];
const RULES_QUESTION_PATTERN =
  /\b(rule|rules|regulation|regulations|requirement|requirements|allowed|fault|faults|max(?:imum)? time|time limit|time limits|judge(?:s)? briefing|hide|hides|odor|container|containers|interior|exterior|buried|handler discrimination|excellent|novice|advanced|master|detective)\b/i;

export interface ParsedAskQRouting {
  ok: true;
  questionMode: AskQQuestionMode | null;
  rulebookScope?: AskQRulebookScope;
}

export interface InvalidAskQRouting {
  ok: false;
  error: string;
}

export type AskQRoutingParseResult = ParsedAskQRouting | InvalidAskQRouting;

export interface RulebookResolution {
  rulebooks: AskQRulebookAsset[];
  clarification: string | null;
}

export function parseAskQRouting(
  questionMode: unknown,
  rulebookScope: unknown,
  supportMode: boolean
): AskQRoutingParseResult {
  if (questionMode !== undefined && questionMode !== null && !isAskQQuestionMode(questionMode)) {
    return { ok: false, error: 'Invalid questionMode' };
  }

  const parsedScope = parseRulebookScope(rulebookScope);
  if (!parsedScope.ok) return parsedScope;

  return {
    ok: true,
    questionMode: isAskQQuestionMode(questionMode) ? questionMode : supportMode ? 'app-help' : null,
    ...(parsedScope.rulebookScope ? { rulebookScope: parsedScope.rulebookScope } : {}),
  };
}

export function resolveRulebookContext(input: {
  allRulebooks: AskQRulebookAsset[];
  showRulebooks: AskQRulebookAsset[];
  hasVerifiedShowContext: boolean;
  questionMode: AskQQuestionMode | null;
  message?: string;
  rulebookScope?: AskQRulebookScope;
}): RulebookResolution {
  const availableRulebooks = input.hasVerifiedShowContext
    ? input.showRulebooks
    : input.showRulebooks.length > 0
      ? input.showRulebooks
      : input.allRulebooks;
  const explicitScope =
    input.rulebookScope ?? inferRulebookScopeFromQuestion(input.message, availableRulebooks);
  const rulebooks = getRulebooksForDocumentContext(
    input.allRulebooks,
    input.showRulebooks,
    input.hasVerifiedShowContext,
    { explicitScope }
  );
  const shouldResolveAsRules =
    input.questionMode === 'rules' ||
    (input.questionMode === null && isLikelyRulesQuestion(input.message));

  if (!shouldResolveAsRules) {
    return { rulebooks, clarification: null };
  }

  if (rulebooks.length === 1) {
    return { rulebooks, clarification: null };
  }

  if (hasRulebookScopeValue(explicitScope)) {
    return {
      rulebooks: [],
      clarification: input.hasVerifiedShowContext
        ? `I could not match that rulebook to this show's verified trials. Please choose one of: ${formatRulebookOptions(availableRulebooks)}.`
        : `I could not match that rulebook. Please choose one of: ${formatRulebookOptions(input.allRulebooks)}.`,
    };
  }

  return {
    rulebooks: [],
    clarification: `Which rulebook should I use: ${formatRulebookOptions(availableRulebooks)}?`,
  };
}

export function buildModePrompt(questionMode: AskQQuestionMode | null): string {
  if (questionMode === 'app-help') {
    return `\nQUESTION MODE: App help.\n- Answer only from verified_user_guides.\n- Do not use live show-data tools.\n- Do not answer official rules questions from rulebooks in this mode; ask the user to switch to Rules.\n`;
  }

  if (questionMode === 'rules') {
    return `\nQUESTION MODE: Rules.\n- Answer only from selected_rulebook.\n- Start rules answers with a concise source label, for example: "Using AKC Scent Work rules:".\n- Do not use live show-data tools or verified_user_guides.\n- If selected_rulebook is empty or ambiguous, ask which organization and sport rulebook to use.\n`;
  }

  if (questionMode === 'show-data') {
    return `\nQUESTION MODE: This show.\n- Use live show-data tools for results, entries, classes, trials, and schedules.\n- Do not answer official rules questions from rulebooks or app-help questions from guides in this mode; ask the user to switch modes.\n`;
  }

  return '';
}

export function isLikelyRulesQuestion(message: string | undefined): boolean {
  return Boolean(message?.trim() && RULES_QUESTION_PATTERN.test(message));
}

function isAskQQuestionMode(value: unknown): value is AskQQuestionMode {
  return typeof value === 'string' && QUESTION_MODES.includes(value as AskQQuestionMode);
}

function parseRulebookScope(
  rulebookScope: unknown
): { ok: true; rulebookScope?: AskQRulebookScope } | { ok: false; error: string } {
  if (rulebookScope === undefined || rulebookScope === null) return { ok: true };
  if (typeof rulebookScope !== 'object' || Array.isArray(rulebookScope)) {
    return { ok: false, error: 'Invalid rulebookScope' };
  }

  const scope = rulebookScope as Record<string, unknown>;
  const organizationCode = parseOptionalString(scope.organizationCode);
  const sportCode = parseOptionalString(scope.sportCode);
  if (organizationCode === null || sportCode === null) {
    return { ok: false, error: 'Invalid rulebookScope' };
  }

  if (!organizationCode && !sportCode) return { ok: true };
  return {
    ok: true,
    rulebookScope: {
      ...(organizationCode ? { organizationCode: organizationCode.toUpperCase() } : {}),
      ...(sportCode ? { sportCode } : {}),
    },
  };
}

function parseOptionalString(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function inferRulebookScopeFromQuestion(
  message: string | undefined,
  availableRulebooks: AskQRulebookAsset[]
): AskQRulebookScope | undefined {
  if (!message?.trim()) return undefined;

  const normalizedMessage = normalizeText(message);
  const matches = availableRulebooks.filter(rulebook => {
    const organization = rulebook.organizationCode.toLowerCase();
    if (hasToken(normalizedMessage, organization)) return true;

    const sportLabel = rulebook.sportCode
      .replace(`${organization}-`, '')
      .replace(/-/g, ' ')
      .toLowerCase();
    return normalizedMessage.includes(sportLabel);
  });

  if (matches.length !== 1) return undefined;
  return {
    organizationCode: matches[0].organizationCode,
    sportCode: matches[0].sportCode,
  };
}

function hasRulebookScopeValue(scope: AskQRulebookScope | undefined): boolean {
  return Boolean(scope?.organizationCode?.trim() || scope?.sportCode?.trim());
}

function formatRulebookOptions(rulebooks: AskQRulebookAsset[]): string {
  const options = getRulebookScopeOptions(rulebooks).map(option => option.label);
  return options.length > 0 ? options.join(', ') : 'no available rulebooks';
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasToken(text: string, token: string): boolean {
  return new RegExp(`(?:^| )${escapeRegExp(token)}(?: |$)`).test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
