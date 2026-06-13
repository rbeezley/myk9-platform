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
const wizardPage = read(
  path.join(__dirname, '../../../pages/secretary/ShowCreationWizardPage.tsx')
);

describe('Show creation wizard — dark-mode theming guards', () => {
  it('ReviewStep error card and stats carry dark variants', () => {
    expect(reviewStep).toContain('dark:border-red-800/50');
    expect(reviewStep).toContain('dark:bg-red-900/20');
    expect(reviewStep).toContain('dark:text-red-400');
    expect(reviewStep).toContain('dark:text-blue-400');
    expect(reviewStep).toContain('dark:text-green-400');
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

  it('ClassSelectionStep empty state carries dark amber variants', () => {
    expect(classSelectionStep).toContain('dark:text-amber-400');
    expect(classSelectionStep).toContain('dark:bg-amber-400/10');
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
    expect(wizardPage).toContain('aria-expanded={validationExpanded}');
    expect(wizardPage).toContain('aria-controls="wizard-validation-details"');
    expect(wizardPage).toContain('id="wizard-validation-details"');
  });
});
