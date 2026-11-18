/**
 * MYK9-2044: the recording fee statement generate-premium sends reaches the premium's facts,
 * survives the parse the generate call goes through (which strips unknown keys), and rides the
 * published snapshot to the public page in every style. The per-style PDF line is pinned in
 * premiumFactsParity.test.tsx.
 */
import { describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import { generatedPremium } from './fixtures/generatedPremium';
import { buildPremiumFacts } from '../premiumFacts';
import { parseGeneratedPremium } from '../premiumPublishSchema';
import { STYLE_TOKENS } from '../pdf/pdfStyles';
import { buildExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import { render, screen } from '@/test/utils/testUtils';
import type { GeneratedPremium, PremiumStyle } from '@/types/premium-types';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: [] }),
}));

const ALL_STYLES = Object.keys(STYLE_TOKENS) as PremiumStyle[];

const FEE_2027 = {
  registry: 'AKC' as const,
  rates: [{ amountCents: 550, appliesFrom: null }],
  text: 'AKC recording fee: $5.50 per entry',
};
const NEW_YEAR_FEE = {
  registry: 'AKC' as const,
  rates: [
    { amountCents: 450, appliesFrom: null },
    { amountCents: 550, appliesFrom: '2027-01-01' },
  ],
  text: 'AKC recording fee: $4.50 per entry; $5.50 per entry from January 1, 2027',
};

function withFee(recordingFee: GeneratedPremium['recordingFee']): GeneratedPremium {
  return { ...generatedPremium(), recordingFee };
}

describe('premium recording fee fact (MYK9-2044)', () => {
  it('carries the statement the function wrote', () => {
    expect(buildPremiumFacts(withFee(FEE_2027)).recordingFee).toBe(
      'AKC recording fee: $5.50 per entry'
    );
  });

  it.each([null, undefined])('has no line when the function sent %s', recordingFee => {
    expect(buildPremiumFacts(withFee(recordingFee)).recordingFee).toBeNull();
  });

  it('survives the same parse the generate call goes through', () => {
    const wire = (premium: GeneratedPremium) => JSON.parse(JSON.stringify(premium));

    expect(buildPremiumFacts(parseGeneratedPremium(wire(withFee(FEE_2027)))).recordingFee).toBe(
      'AKC recording fee: $5.50 per entry'
    );
    expect(buildPremiumFacts(parseGeneratedPremium(wire(withFee(null)))).recordingFee).toBeNull();
  });

  it('keeps both rates of a statement across a rate change through the parse', () => {
    const parsed = parseGeneratedPremium(JSON.parse(JSON.stringify(withFee(NEW_YEAR_FEE))));

    expect(parsed.recordingFee).toEqual(NEW_YEAR_FEE);
    expect(buildPremiumFacts(parsed).recordingFee).toBe(NEW_YEAR_FEE.text);
  });

  it('still parses a stored premium with no recording fee, or one saved before it carried rates', () => {
    // The shared fixture predates the recording fee and carries no such key.
    expect('recordingFee' in generatedPremium()).toBe(false);
    expect(
      parseGeneratedPremium(JSON.parse(JSON.stringify(generatedPremium()))).recordingFee
    ).toBeUndefined();

    const earlyShape = {
      ...generatedPremium(),
      recordingFee: {
        registry: 'AKC',
        amountCents: 550,
        text: 'AKC recording fee: $5.50 per entry',
      },
    };
    const parsed = parseGeneratedPremium(JSON.parse(JSON.stringify(earlyShape)));
    expect(parsed.recordingFee).toEqual({
      registry: 'AKC',
      rates: [],
      text: 'AKC recording fee: $5.50 per entry',
    });
    expect(buildPremiumFacts(parsed).recordingFee).toBe('AKC recording fee: $5.50 per entry');
  });
});

describe('public premium page states the published recording fee (MYK9-2044)', () => {
  const TRIAL = fromAny<Trial, unknown>({
    id: 't1',
    name: 'New Year Trial',
    trialNumber: 1,
    trialDate: '2027-01-01',
  });

  function publishedShow(premium: GeneratedPremium): Show {
    return fromAny<Show, unknown>({
      id: 'show-1',
      name: 'New Year Scent Trial',
      organization: 'Test Club',
      startDate: '2026-12-31',
      endDate: '2027-01-01',
      entryCloseDate: '2030-12-01',
      experienceIsPublished: true,
      experiencePublishedStyle: premium.style,
      experiencePublishedContent: buildExperienceSnapshot({
        premium,
        premiumPath: 'show-1/artifact-1.pdf',
        premiumUrl: 'https://trusted.example/premium-published/show-1/artifact-1.pdf',
      }),
      trials: [],
    });
  }

  it('publishes the statement in the snapshot, and null when the premium has none', () => {
    const premium = withFee(NEW_YEAR_FEE);
    expect(publishedShow(premium).experiencePublishedContent?.recordingFee).toEqual(NEW_YEAR_FEE);
    expect(publishedShow(withFee(undefined)).experiencePublishedContent?.recordingFee).toBeNull();
  });

  it.each(ALL_STYLES)('%s prints the words the published PDF prints', style => {
    const premium = { ...withFee(NEW_YEAR_FEE), style };
    const Landing = STYLED_LANDING_BY_STYLE[style];
    render(<Landing show={publishedShow(premium)} trial={TRIAL} allTrials={[TRIAL]} />);

    expect(screen.getByTestId('landing-recording-fee')).toHaveTextContent(
      buildPremiumFacts(premium).recordingFee ?? 'missing'
    );
    expect(screen.getByTestId('landing-recording-fee')).toHaveTextContent(
      'AKC recording fee: $4.50 per entry; $5.50 per entry from January 1, 2027'
    );
  });

  it.each(ALL_STYLES)('%s prints no line for a snapshot published without one', style => {
    const premium = { ...withFee(null), style };
    const show = publishedShow(premium);
    const legacy = fromAny<Show, unknown>({
      ...show,
      experiencePublishedContent: { ...show.experiencePublishedContent, recordingFee: undefined },
    });
    const Landing = STYLED_LANDING_BY_STYLE[style];
    render(<Landing show={legacy} trial={TRIAL} allTrials={[TRIAL]} />);

    expect(screen.queryByTestId('landing-recording-fee')).not.toBeInTheDocument();
    expect(screen.queryByText(/recording fee/i)).not.toBeInTheDocument();
  });
});
