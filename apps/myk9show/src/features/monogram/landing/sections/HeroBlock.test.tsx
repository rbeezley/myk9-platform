/**
 * exhibitor-ux-remediation: the Venue meta cell showed "TBA" even when the
 * show's street address was known and already rendered elsewhere on the same
 * page (MonogramFooter) — venueName/venueCity are separate structured fields
 * that are simply never populated. Falls back to the address instead of
 * contradicting the rest of the page.
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { HeroBlock } from './HeroBlock';

const baseProps = {
  monogramLetters: 'HS',
  showName: 'Heartland Scent Work Classic',
  showSubtitle: 'AKC Licensed Trial',
  trialStartDate: '2026-08-01',
  trialEndDate: '2026-08-03',
  entryCloseDate: '2026-06-30',
  entryLimit: null,
  timezone: 'America/Chicago',
  entryWizardUrl: '/shows/show-1/register',
  classesHref: null,
};

describe('Monogram HeroBlock — venue fallback', () => {
  it('shows the street address when no structured venue name/city is set', () => {
    render(
      <HeroBlock
        {...baseProps}
        venueName={null}
        venueCity={null}
        venueAddress="100 Dog Show Lane, Tulsa, OK 74101"
      />
    );

    expect(screen.getByText('100 Dog Show Lane, Tulsa, OK 74101')).toBeInTheDocument();
    expect(screen.queryByText('TBA')).not.toBeInTheDocument();
  });

  it('prefers the structured venue name/city over the address when both are set', () => {
    render(
      <HeroBlock
        {...baseProps}
        venueName="Expo Hall"
        venueCity="Tulsa, OK"
        venueAddress="100 Dog Show Lane, Tulsa, OK 74101"
      />
    );

    expect(screen.getByText('Expo Hall · Tulsa, OK')).toBeInTheDocument();
  });

  it('falls back to TBA only when neither structured venue nor address is known', () => {
    render(<HeroBlock {...baseProps} venueName={null} venueCity={null} venueAddress={null} />);

    expect(screen.getByText('TBA')).toBeInTheDocument();
  });
});

describe('Monogram HeroBlock — decorative monogram is out of flow', () => {
  // Regression guard for the short-landscape fold fix: the 640px monogram must
  // render inside a dedicated `.mg-hero__monogram` WRAPPER (positioned absolute
  // + centered in monogram.css) rather than being applied to the emboss glyph
  // in normal flow. In flow it pushed the hero to ~1554px and dropped the CTA
  // far below the fold on short landscape tablets.
  it('wraps the monogram in an aria-hidden .mg-hero__monogram layer, not the glyph itself', () => {
    const { container } = render(
      <HeroBlock {...baseProps} venueName="Expo Hall" venueCity="Tulsa, OK" />
    );

    const monoLayer = container.querySelector('.mg-hero__monogram');
    expect(monoLayer).not.toBeNull();
    // The positioned element is the wrapper DIV, not the emboss SPAN — this is
    // what keeps the glyph out of the document flow.
    expect(monoLayer?.tagName).toBe('DIV');
    expect(monoLayer).toHaveAttribute('aria-hidden');
    // The emboss letters still render inside the wrapper.
    expect(monoLayer?.textContent).toContain('HS');
  });
});
