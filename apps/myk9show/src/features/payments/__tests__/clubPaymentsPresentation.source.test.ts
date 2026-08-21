/**
 * Presentation contracts for the Club Payments surface.
 *
 * These are source-level scans on purpose. Each guards a defect that RENDERS
 * fine in a jsdom test and fails only against real tokens, a real accessibility
 * tree, or a real 375px viewport, so a behavioural test would pass either way
 * and prove nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const SURFACE = [
  'features/payments/ClubPaymentsCard.tsx',
  'features/financial/components/ClubFinancialReconciliationCard.tsx',
  'features/financial/components/ChargeVerificationBadge.tsx',
];

/** Every `<Badge ...>` opening tag in a file, whitespace-normalised. */
function badgeTags(source: string): string[] {
  return (source.match(/<Badge[\s>][^>]*>/gs) ?? []).map(tag => tag.replace(/\s+/g, ' '));
}

describe('neutral badges never use the collapsing secondary tokens alone', () => {
  // In `.dark`, --secondary and --card are both #1e1c19 and
  // --secondary-foreground equals --card-foreground, so a bare
  // `variant="secondary"` Badge on a Card measures 1.00:1 and stops reading as a
  // chip at all. badgeVariants also sets border-transparent, so no border saves
  // it. Every neutral chip must carry a --chip-* pair.
  it.each(SURFACE)('%s', rel => {
    const secondaryBadges = badgeTags(read(rel)).filter(tag => tag.includes('variant="secondary"'));
    for (const tag of secondaryBadges) {
      const carriesChip =
        tag.includes('NEUTRAL_STATUS_CHIP') ||
        tag.includes('WAITING_STATUS_CHIP') ||
        tag.includes('chip-');
      expect(carriesChip, `bare secondary Badge (1.00:1 in dark): ${tag}`).toBe(true);
    }
  });

  it('the badge resolver gives every neutral state a chip class', () => {
    const source = read('features/payments/payoutBadge.ts');
    const returns = source.match(/variant: 'secondary', className: [^}]+/g) ?? [];
    expect(returns.length).toBeGreaterThan(0);
    for (const line of returns) {
      expect(line, `neutral state without a chip: ${line}`).toMatch(/STATUS_CHIP/);
    }
  });

  it('only the state a treasurer must act on stays destructive', () => {
    const source = read('features/payments/payoutBadge.ts');
    expect(source).toContain("label: 'Needs attention', variant: 'destructive'");
  });
});

describe('meaning is never carried by an aria-label the tree drops', () => {
  // Badge renders a role-less <div>, and a bare <span> is also role="generic".
  // Naming a generic element is PROHIBITED, so every aria-label on one was
  // silently discarded -- including the only honest qualifier on a money figure
  // ("not yet sent"). Meaning belongs in text, extended by `sr-only`.
  it.each(SURFACE)('%s has no aria-label on a Badge', rel => {
    for (const tag of badgeTags(read(rel))) {
      expect(tag, `aria-label on a role="generic" Badge: ${tag}`).not.toContain('aria-label');
    }
  });

  it.each(SURFACE)('%s has no aria-label on a bare span', rel => {
    const spans = (read(rel).match(/<span[\s][^>]*>/gs) ?? []).map(t => t.replace(/\s+/g, ' '));
    for (const tag of spans) {
      expect(tag, `aria-label on a role="generic" span: ${tag}`).not.toContain('aria-label');
    }
  });

  it('the unsettled transfer still says it is not sent, in text', () => {
    expect(read('features/financial/components/ClubFinancialReconciliationCard.tsx')).toContain(
      'not yet sent'
    );
  });
});

describe('recovery controls are readable in every accent and theme', () => {
  // `variant="link"` is text-primary, which measures 4.40:1 against the card
  // under heather + dark -- below AA for 14px text, on the one control that
  // recovers a failed money load.
  it.each(SURFACE)('%s uses no link-variant buttons', rel => {
    // Scan Button TAGS, not raw text: the files explain in comments why
    // `variant="link"` was removed, and a whole-file `toContain` matches the
    // explanation as readily as the defect.
    const buttons = (read(rel).match(/<Button[\s>][^>]*>/gs) ?? []).map(t => t.replace(/\s+/g, ' '));
    for (const tag of buttons) {
      expect(tag, `link-variant control (4.40:1 under heather+dark): ${tag}`).not.toContain(
        'variant="link"'
      );
    }
  });

  it('the reconciliation unavailable state is visually distinct from the card', () => {
    // Default Alert is bg-background: 1.07:1 light / 1.08:1 dark against --card.
    const source = read('features/financial/components/ClubFinancialReconciliationCard.tsx');
    const alert = source.slice(source.indexOf('reconciliation-unavailable'));
    expect(alert).toMatch(/chip-amber-bg/);
  });
});

describe('every colour class actually compiles', () => {
  // Tailwind CANNOT apply an alpha modifier to an arbitrary CSS variable, so
  // `border-[color:var(--x)]/40` is dropped from the production stylesheet
  // ENTIRELY and the element silently falls back to the preflight border. The
  // codebase already documents this at index.css:265, and the fix is
  // `color-mix(...)`. A source scan that only proves a class is PRESENT cannot
  // see this, so the un-emittable syntax itself is what gets asserted.
  const CSS_VAR_WITH_ALPHA = /\[color:var\(--[a-z0-9-]+\)\]\/\d/;

  it.each(SURFACE)('%s never puts an opacity modifier on a CSS-var colour', rel => {
    const offenders = (read(rel).match(new RegExp(CSS_VAR_WITH_ALPHA, 'g')) ?? []);
    expect(offenders, `dropped by Tailwind at build time: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('the page has a heading outline, not a jump from h1 to h4', () => {
  it('both card titles are headings', () => {
    for (const rel of [
      'features/payments/ClubPaymentsCard.tsx',
      'features/financial/components/ClubFinancialReconciliationCard.tsx',
    ]) {
      expect(read(rel)).toMatch(/<CardTitle role="heading" aria-level=\{2\}>/);
    }
  });

  it('section headings sit at h3, under the card titles', () => {
    const source = read('features/payments/ClubPaymentsCard.tsx');
    expect(source).not.toMatch(/<h4[\s>]/);
    expect(source).toMatch(/<h3[\s>]/);
  });
});
