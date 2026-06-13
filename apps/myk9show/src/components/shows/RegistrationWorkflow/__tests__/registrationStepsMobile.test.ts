/**
 * Mobile/dark-mode guard for the exhibitor registration step components
 * (impeccable #7 PR B). Source-text regression tests, matching the repo's
 * fs.readFileSync convention — they pin the dark: variants, semantic tokens, and
 * mobile touch-target rules so a refactor can't silently drop them. Exhibitors
 * enter shows from phones, so these are correctness invariants, not nits.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(dir, rel), 'utf8');

const dogStep = read('DogSelectionStep.tsx');
const classComponents = read('ClassSelectionStep.components.tsx');
const classStep = read('ClassSelectionStep.tsx');
const inlineHandler = read('InlineHandlerSection.tsx');
const confirmation = read('ConfirmationStep.tsx');
const summary = read('PaymentStep/RegistrationSummary.tsx');
const css = readFileSync(
  path.join(__dirname, '../../../../styles/myk9-registration-workflow.css'),
  'utf8'
);

describe('registration steps — dark-mode theming guards', () => {
  it('DogSelectionStep uses semantic tokens, not raw gray, and dark-aware status colors', () => {
    expect(dogStep).not.toContain('text-gray-');
    expect(dogStep).toContain('text-muted-foreground');
    expect(dogStep).toContain('text-destructive'); // eligibility issues
    expect(dogStep).toContain('dark:text-amber-400'); // warnings
  });

  it('ClassSelectionStep status colors carry dark variants and use bg-muted', () => {
    expect(classComponents).toContain('dark:text-teal-400');
    expect(classComponents).not.toContain('bg-gray-50');
  });

  it('RegistrationSummary drops raw gray and dark-adapts the discount color', () => {
    expect(summary).not.toContain('text-gray-600');
    expect(summary).toContain('dark:text-green-400');
  });

  it('ConfirmationStep status list/badge colors carry dark variants', () => {
    expect(confirmation).toContain('dark:text-green-400');
    expect(confirmation).toContain('dark:text-orange-400');
    expect(confirmation).toContain('text-destructive'); // missing-info
  });
});

describe('registration steps — mobile responsive guards', () => {
  it('the dog list scroll height is viewport-relative on phones', () => {
    expect(dogStep).toContain('h-[55vh]');
  });

  it('the dog-tab strip can scroll horizontally instead of overflowing', () => {
    expect(classStep).toContain('overflow-x-auto');
  });

  it('the inline-handler entry row stacks on mobile', () => {
    expect(inlineHandler).toContain('sm:flex-row');
  });

  it('level chips keep a 44px tap height on phones', () => {
    // Inside the max-width:480px block, the chip must not shrink below 44px tall.
    const mobileBlock = css.slice(css.indexOf('max-width: 480px'));
    expect(mobileBlock).toContain('min-height: 44px');
  });
});
