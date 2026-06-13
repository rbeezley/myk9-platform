/**
 * Mechanical-sweep guard (impeccable page #6 — Show creation wizard).
 *
 * These are source-text regression tests, matching the repo's existing
 * fs.readFileSync convention. They pin the dark-mode theming + a11y fixes so a
 * future refactor can't silently drop a `dark:` variant or an aria attribute —
 * defects that typecheck and render-snapshot tests are both blind to.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const stepsDir = path.join(__dirname, '../../../components/shows/wizard/steps');
const read = (p: string) => readFileSync(p, 'utf8');

const reviewStep = read(path.join(stepsDir, 'ReviewStep.tsx'));
const showDetailsStep = read(path.join(stepsDir, 'ShowDetailsStep.tsx'));
const trialConfigStep = read(path.join(stepsDir, 'TrialConfigurationStep.tsx'));
const classSelectionStep = read(path.join(stepsDir, 'ClassSelectionStep.tsx'));
// The validation-banner disclosure was extracted out of ShowCreationWizardPage
// into its own sibling component; the a11y guard follows the markup to its new
// home. The pinned aria string-literals stay byte-identical.
const validationBanner = read(
  path.join(
    __dirname,
    '../../../pages/secretary/ShowCreationWizard/WizardValidationBanner.tsx'
  )
);

describe('Show creation wizard — dark-mode theming guards', () => {
  it('ReviewStep error card and stats use semantic tokens (no hand-paired dark: variants)', () => {
    expect(reviewStep).toContain('border-destructive/30');
    expect(reviewStep).toContain('bg-destructive/10');
    expect(reviewStep).toContain('text-destructive');
    expect(reviewStep).toContain('text-info');
    expect(reviewStep).toContain('text-success');
    expect(reviewStep).toContain('dark:text-purple-400');
  });

  it('ReviewStep no longer uses non-adapting gray text utilities', () => {
    expect(reviewStep).not.toContain('text-gray-700');
    expect(reviewStep).not.toContain('text-gray-400');
  });

  it('ShowDetailsStep validation errors use the semantic destructive token', () => {
    expect(showDetailsStep).not.toContain('text-red-500');
    expect(showDetailsStep).toContain('text-sm text-destructive mt-1');
  });

  it('ClassSelectionStep empty state uses semantic warning tokens', () => {
    expect(classSelectionStep).toContain('text-warning');
    expect(classSelectionStep).toContain('bg-warning/10');
  });
});

describe('Show creation wizard — a11y guards', () => {
  it('TrialConfigurationStep delete button has an accessible name and adapts in dark mode', () => {
    expect(trialConfigStep).toContain('aria-label={`Remove Trial ${index + 1}`}');
    expect(trialConfigStep).toContain(
      'text-destructive hover:text-destructive hover:bg-destructive/10'
    );
    expect(trialConfigStep).not.toContain('hover:bg-red-50');
  });

  it('Wizard validation banner is a labelled disclosure (aria-expanded/controls)', () => {
    expect(validationBanner).toContain('aria-expanded={expanded}');
    expect(validationBanner).toContain('aria-controls="wizard-validation-details"');
    expect(validationBanner).toContain('id="wizard-validation-details"');
  });
});
