import type { AskQQuestionMode, AskQRulebookScope } from './types.ts';
import {
  type AskQRulebookAsset,
  getRulebooksForDocumentContext,
  getRulebookScopeOptions,
} from './documentContext.ts';

const QUESTION_MODES: AskQQuestionMode[] = ['app-help', 'rules', 'show-data'];

export interface ParsedAskQRouting {
  ok: true;
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

/**
 * questionMode is still validated (an unknown value is a 400) so the deployed client
 * keeps working, but it no longer restricts sources: the server classifies each question.
 */
export function parseAskQRouting(
  questionMode: unknown,
  rulebookScope: unknown
): AskQRoutingParseResult {
  if (questionMode !== undefined && questionMode !== null && !isAskQQuestionMode(questionMode)) {
    return { ok: false, error: 'Invalid questionMode' };
  }

  const parsedScope = parseRulebookScope(rulebookScope);
  if (!parsedScope.ok) return parsedScope;

  return {
    ok: true,
    ...(parsedScope.rulebookScope ? { rulebookScope: parsedScope.rulebookScope } : {}),
  };
}

/** Picks the rulebook for a question already classified as a rules question. */
export function resolveRulebookContext(input: {
  allRulebooks: AskQRulebookAsset[];
  showRulebooks: AskQRulebookAsset[];
  hasVerifiedShowContext: boolean;
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
  if (rulebooks.length === 1 || availableRulebooks.length === 0) {
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
