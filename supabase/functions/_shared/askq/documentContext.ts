import type { AskQRulebookScope } from './types.ts';

export interface AskQGuideAsset {
  id: string;
  title: string;
  audience: string;
  content: string;
}

export interface AskQRulebookAsset {
  id: string;
  organizationCode: string;
  sportCode: string;
  title: string;
  content: string;
}

export interface BuildDocumentContextInput {
  guides: AskQGuideAsset[];
  rulebook?: AskQRulebookAsset | null;
  rulebooks?: AskQRulebookAsset[];
}

export interface AskQRulebookScopeOption {
  id: string;
  label: string;
  organizationCode: string;
  sportCode: string;
  title: string;
}

export function selectRulebook(
  rulebooks: AskQRulebookAsset[],
  organizationCode?: string,
  sportCode?: string
): AskQRulebookAsset | null {
  const organization = organizationCode?.trim().toUpperCase();
  const normalizedSport = normalizeSportCode(sportCode, organization);

  return (
    rulebooks.find(rulebook => {
      if (organization && rulebook.organizationCode !== organization) return false;
      if (normalizedSport && rulebook.sportCode !== normalizedSport) return false;
      return Boolean(organization || normalizedSport);
    }) ?? null
  );
}

export function getRulebookScopeOptions(rulebooks: AskQRulebookAsset[]): AskQRulebookScopeOption[] {
  return rulebooks.map(rulebook => ({
    id: rulebook.id,
    label: `${rulebook.organizationCode} ${formatSportLabel(rulebook.sportCode, rulebook.organizationCode)}`,
    organizationCode: rulebook.organizationCode,
    sportCode: rulebook.sportCode,
    title: rulebook.title,
  }));
}

export function buildDocumentContext(input: BuildDocumentContextInput): string {
  const rulebooks = input.rulebooks ?? (input.rulebook ? [input.rulebook] : []);
  const sections = [
    `<verified_user_guides>
${input.guides.map(formatGuide).join('\n\n')}
</verified_user_guides>`,
  ];

  if (rulebooks.length > 0) {
    sections.push(rulebooks.map(formatRulebook).join('\n\n'));
  } else {
    sections.push(`<selected_rulebook>
No rulebook was selected. If the user asks an official rules question, ask which registry/sport or trial they mean.
</selected_rulebook>`);
  }

  return sections.join('\n\n');
}

export function getRulebooksForDocumentContext(
  allRulebooks: AskQRulebookAsset[],
  showRulebooks: AskQRulebookAsset[],
  hasVerifiedShowContext: boolean,
  options: { explicitScope?: AskQRulebookScope } = {}
): AskQRulebookAsset[] {
  const availableRulebooks = hasVerifiedShowContext
    ? showRulebooks
    : showRulebooks.length > 0
      ? showRulebooks
      : allRulebooks;

  if (hasRulebookScopeValue(options.explicitScope)) {
    const selected = selectRulebook(
      availableRulebooks,
      options.explicitScope.organizationCode,
      options.explicitScope.sportCode
    );
    return selected ? [selected] : [];
  }

  return availableRulebooks;
}

export function normalizeSportCode(
  sportCode: string | undefined,
  organizationCode?: string
): string | undefined {
  if (!sportCode?.trim()) return undefined;

  const normalized = sportCode
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  if (normalized === 'scent-work' && organizationCode) {
    return `${organizationCode.toLowerCase()}-scent-work`;
  }
  if (normalized === 'nosework') return 'ukc-nosework';
  if (normalized === 'scent-detection') return 'asca-scent-detection';
  return normalized;
}

function formatGuide(guide: AskQGuideAsset): string {
  return `<guide id="${guide.id}" title="${escapeAttribute(guide.title)}" audience="${escapeAttribute(guide.audience)}">
${guide.content}
</guide>`;
}

function formatRulebook(rulebook: AskQRulebookAsset): string {
  return `<selected_rulebook id="${rulebook.id}" organization="${escapeAttribute(rulebook.organizationCode)}" sport="${escapeAttribute(rulebook.sportCode)}" title="${escapeAttribute(rulebook.title)}">
${rulebook.content}
</selected_rulebook>`;
}

function hasRulebookScopeValue(scope: AskQRulebookScope | undefined): scope is AskQRulebookScope {
  return Boolean(scope?.organizationCode?.trim() || scope?.sportCode?.trim());
}

function formatSportLabel(sportCode: string, organizationCode: string): string {
  const prefix = `${organizationCode.toLowerCase()}-`;
  const sport = sportCode.startsWith(prefix) ? sportCode.slice(prefix.length) : sportCode;
  return sport
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
