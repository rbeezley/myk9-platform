import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(join(__dirname, '..', '..', relativePath), 'utf8');

describe('fixed-light and fixed-display literal color surfaces', () => {
  it('documents the named literal-color families from the UI matrix', () => {
    const printableReport = readSource('components/reports/PrintableReport.tsx');
    const tvDisplay = readSource('pages/TVDisplay/index.tsx');
    const creditCardVisual = readSource(
      'components/shows/RegistrationWorkflow/PaymentStep/CreditCardVisual.tsx'
    );
    const landingCss = readSource('styles/landing.css');
    const heritageLanding = readSource('features/heritage/landing/HeritageLandingPage.tsx');

    expect(printableReport).toContain('INTENT: Printable reports are fixed-light paper artifacts');
    expect(printableReport).toContain('bg-white text-black');

    expect(tvDisplay).toContain('INTENT: TVDisplay is a fixed-dark venue screen');
    expect(tvDisplay).toContain('bg-zinc-950');

    expect(creditCardVisual).toContain('INTENT: Credit-card artwork uses fixed issuer/chip colors');
    expect(creditCardVisual).toContain('from-slate-800 via-slate-900 to-slate-950');

    expect(landingCss).toContain('INTENT: The page should always render in the editorial light palette');
    expect(landingCss).toContain('color-scheme: light');

    expect(heritageLanding).toContain('INTENT: Heritage is a deliberately fixed-light public style');
    expect(heritageLanding).toContain("background: 'var(--hl-paper)'");
  });
});
