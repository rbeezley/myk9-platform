import { describe, expect, it } from 'vitest';
import {
  buildDocumentContext,
  getRulebooksForDocumentContext,
  selectRulebook,
  type AskQGuideAsset,
  type AskQRulebookAsset,
} from './documentContext.ts';

const guides: AskQGuideAsset[] = [
  {
    id: 'secretary-guide',
    title: 'Secretary Guide',
    audience: 'Trial secretaries',
    content: 'Add a mail-in entry from Entries Management.',
  },
];

const rulebooks: AskQRulebookAsset[] = [
  {
    id: 'akc-scent-work',
    organizationCode: 'AKC',
    sportCode: 'akc-scent-work',
    title: 'AKC Scent Work Regulations',
    content: 'Excellent Interior time limits are set by the judge for each search area.',
  },
  {
    id: 'ukc-nosework',
    organizationCode: 'UKC',
    sportCode: 'ukc-nosework',
    title: 'UKC Nose Work Rules',
    content: 'UKC Excellent Container searches use UKC rules.',
  },
];

describe('AskQ document context', () => {
  it('selects one rulebook by registry and current trial_type label without text search', () => {
    expect(selectRulebook(rulebooks, 'AKC', 'Scent Work')).toMatchObject({
      id: 'akc-scent-work',
      title: 'AKC Scent Work Regulations',
    });
  });

  it('bundles guides and the selected rulebook into prompt context', () => {
    const context = buildDocumentContext({
      guides,
      rulebook: rulebooks[0],
    });

    expect(context).toContain('<verified_user_guides>');
    expect(context).toContain('Secretary Guide');
    expect(context).toContain('Add a mail-in entry');
    expect(context).toContain('<selected_rulebook');
    expect(context).toContain('Excellent Interior time limits');
  });

  it('can include multiple show rulebooks without relying on the first trial only', () => {
    const context = buildDocumentContext({
      guides,
      rulebooks,
    });

    expect(context).toContain('AKC Scent Work Regulations');
    expect(context).toContain('UKC Nose Work Rules');
  });

  it('falls back to all bundled rulebooks when no show context selects one', () => {
    const selectedRulebooks = rulebooks.slice(0, 1);

    expect(getRulebooksForDocumentContext(rulebooks, [])).toEqual(rulebooks);
    expect(getRulebooksForDocumentContext(rulebooks, selectedRulebooks)).toEqual(selectedRulebooks);
  });
});
