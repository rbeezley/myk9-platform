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
const basicShowInfoSection = read(path.join(stepsDir, 'ShowDetailsStep.sections.tsx'));
const trialConfigStep = read(path.join(stepsDir, 'TrialConfigurationStep.tsx'));
const classSelectionStep = read(path.join(stepsDir, 'ClassSelectionStep.tsx'));
const judgesPicker = read(path.join(stepsDir, 'JudgesPicker.tsx'));
const officialPicker = read(path.join(stepsDir, 'OfficialPicker.tsx'));
// The validation-banner disclosure was extracted out of ShowCreationWizardPage
// into its own sibling component; the a11y guard follows the markup to its new
// home. The pinned aria string-literals stay byte-identical.
const validationBanner = read(
  path.join(
    __dirname,
    '../../../pages/secretary/ShowCreationWizard/WizardValidationBanner.tsx'
  )
);
const wizardPage = read(
  path.join(__dirname, '../../../pages/secretary/ShowCreationWizardPage.tsx')
);
const wizardNavigation = read(
  path.join(__dirname, '../../../components/shows/wizard/components/WizardNavigation.tsx')
);
const indexCss = read(path.join(__dirname, '../../../index.css'));

const parseRgbToken = (css: string, token: string): [number, number, number] => {
  const match = css.match(new RegExp(`--${token}:\\s*([\\d\\s]+);`));

  if (!match) {
    throw new Error(`Missing CSS token --${token}`);
  }

  const channels = match[1].trim().split(/\s+/).map(Number);

  if (channels.length !== 3 || channels.some(channel => Number.isNaN(channel))) {
    throw new Error(`Invalid RGB token --${token}: ${match[1]}`);
  }

  return channels as [number, number, number];
};

const relativeLuminance = ([red, green, blue]: [number, number, number]) => {
  const [r, g, b] = [red, green, blue].map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (foreground: [number, number, number], background: [number, number, number]) => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
};

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
    expect(basicShowInfoSection).toContain('text-sm text-destructive mt-1');
  });

  it('ClassSelectionStep empty state uses semantic warning tokens', () => {
    expect(classSelectionStep).toContain('text-warning');
    expect(classSelectionStep).toContain('bg-warning/10');
  });

  it('JudgesPicker qualified badge uses the success token (AA-legible), not raw emerald-400', () => {
    expect(judgesPicker).toContain('text-success border-success/30');
    expect(judgesPicker).not.toContain('emerald-400');
    expect(judgesPicker).not.toContain('text-[10px]');
  });

  it('OfficialPicker auto-fill badge uses the info token, not raw indigo-400', () => {
    expect(officialPicker).toContain('text-info border-info/30');
    expect(officialPicker).not.toContain('indigo-400');
    expect(officialPicker).not.toContain('text-[10px]');
  });

  it('Validation banner uses a flat warning tint, not a raw amber gradient + blur', () => {
    expect(validationBanner).toContain('bg-warning/10');
    expect(validationBanner).not.toContain('from-amber-');
    expect(validationBanner).not.toContain('backdrop-blur');
  });

  it('"Leave Wizard" confirm action uses the semantic warning token, not raw amber palette', () => {
    // A caution action (discarding unsaved work) — the --warning token is
    // AA-verified in both modes; raw bg-amber-500 had no dark counterpart and a
    // weaker tint-contrast (DESIGN.md index.css line 230).
    expect(wizardPage).toContain('bg-warning text-warning-foreground hover:bg-warning/90');
    expect(wizardPage).not.toContain('bg-amber-500');
  });

  it('"Leave Wizard" warning button foreground clears AA contrast in dark mode', () => {
    const darkBlock = indexCss.match(/\.dark\s*\{[\s\S]*?\n {2}\}/)?.[0];

    if (!darkBlock) {
      throw new Error('Missing .dark token block');
    }

    const warning = parseRgbToken(darkBlock, 'warning');
    const warningForeground = parseRgbToken(darkBlock, 'warning-foreground');

    expect(contrastRatio(warningForeground, warning)).toBeGreaterThanOrEqual(4.5);
  });

  it('Wizard nav loading spinner uses border-current (adapts to button fg), not raw border-white', () => {
    expect(wizardNavigation).toContain('border-current');
    expect(wizardNavigation).not.toContain('border-white');
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

  it('Wizard validation banner announces on appearance (role="alert")', () => {
    // The banner is conditionally mounted when Next fails validation; role=alert
    // makes screen readers announce the summary instead of silently appearing.
    expect(validationBanner).toContain('role="alert"');
  });
});
