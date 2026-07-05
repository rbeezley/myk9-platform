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

export function buildDocumentContext(input: BuildDocumentContextInput): string {
  const sections = [
    `<verified_user_guides>
${input.guides.map(formatGuide).join('\n\n')}
</verified_user_guides>`,
  ];

  if (input.rulebook) {
    sections.push(`<selected_rulebook id="${input.rulebook.id}" title="${escapeAttribute(input.rulebook.title)}">
${input.rulebook.content}
</selected_rulebook>`);
  } else {
    sections.push(`<selected_rulebook>
No rulebook was selected. If the user asks an official rules question, ask which registry/sport or trial they mean.
</selected_rulebook>`);
  }

  return sections.join('\n\n');
}

export function normalizeSportCode(
  sportCode: string | undefined,
  organizationCode?: string
): string | undefined {
  if (!sportCode?.trim()) return undefined;

  const normalized = sportCode.trim().toLowerCase().replace(/[_\s]+/g, '-');
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

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
