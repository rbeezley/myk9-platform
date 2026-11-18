/**
 * MYK9-2044: the recording fee statement is DERIVED from the premium document, never stored on
 * it: its organization and the trial dates it prints (else its start date). The PDF facts and the
 * published snapshot both derive it from the same premium, so they agree with each other and with
 * the printed schedule by construction. The per-style PDF line is pinned in
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
import { NEW_YEAR_SHOW } from '@/test/fixtures/recordingFeeCalendar';
import { render, screen } from '@/test/utils/testUtils';
import type { GeneratedPremium, PremiumStyle } from '@/types/premium-types';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: [] }),
}));

const ALL_STYLES = Object.keys(STYLE_TOKENS) as PremiumStyle[];
const [EVE, NEW_YEAR] = NEW_YEAR_SHOW.trialDates;
const NEW_YEAR_TEXT = 'AKC recording fee: $4.50 per entry; $5.50 per entry from January 1, 2027';

function scheduleTrial(date: string): GeneratedPremium['trials'][number] {
  return {
    name: `Trial ${date}`,
    date,
    startTime: null,
    eventNumber: null,
    type: '',
    judges: [],
    classes: [],
  };
}

/** An AKC premium whose printed schedule holds `dates`, starting on the first of them. */
function premiumFor(
  dates: readonly string[],
  org: GeneratedPremium['org'] = 'AKC'
): GeneratedPremium {
  const base = generatedPremium();
  return {
    ...base,
    org,
    show: { ...base.show, startDate: dates[0] ?? base.show.startDate },
    trials: dates.map(scheduleTrial),
  };
}

function snapshotOf(premium: GeneratedPremium) {
  return buildExperienceSnapshot({
    premium,
    premiumPath: 'show-1/artifact-1.pdf',
    premiumUrl: 'https://trusted.example/premium-published/show-1/artifact-1.pdf',
  });
}

describe('premium recording fee, derived from the document (MYK9-2044)', () => {
  it('names exactly the rates of the dates the schedule prints', () => {
    const pair = premiumFor([EVE, NEW_YEAR]);
    expect(buildPremiumFacts(pair).recordingFee).toBe(NEW_YEAR_TEXT);
    expect(snapshotOf(pair).recordingFee).toBe(NEW_YEAR_TEXT);

    // The January trial leaves the printed schedule, so its rate leaves the statement.
    const eveOnly = { ...pair, trials: pair.trials.filter(t => t.date !== NEW_YEAR) };
    expect(buildPremiumFacts(eveOnly).recordingFee).toBe('AKC recording fee: $4.50 per entry');
    expect(snapshotOf(eveOnly).recordingFee).toBe('AKC recording fee: $4.50 per entry');
  });

  it("follows the document's organization: AKC to UKC drops the line, UKC to AKC adds it", () => {
    const akc = premiumFor([NEW_YEAR]);
    const ukc: GeneratedPremium = { ...akc, org: 'UKC' };
    expect(buildPremiumFacts(ukc).recordingFee).toBeNull();
    expect(snapshotOf(ukc).recordingFee).toBeNull();

    const backToAkc: GeneratedPremium = { ...ukc, org: 'AKC' };
    expect(buildPremiumFacts(backToAkc).recordingFee).toBe('AKC recording fee: $5.50 per entry');
    expect(snapshotOf(backToAkc).recordingFee).toBe('AKC recording fee: $5.50 per entry');
  });

  it("falls back to the premium's start date when it prints no trial", () => {
    expect(buildPremiumFacts(premiumFor([])).recordingFee).toBe(
      'AKC recording fee: $4.50 per entry'
    );
  });

  it('states no line for a date with no known rate', () => {
    expect(buildPremiumFacts(premiumFor(['2028-01-01'])).recordingFee).toBeNull();
    expect(buildPremiumFacts(premiumFor(['2027-12-31', '2028-01-01'])).recordingFee).toBeNull();
    expect(snapshotOf(premiumFor(['2028-01-01'])).recordingFee).toBeNull();
  });

  it('parses an old stored premium that carries a recordingFee key, and ignores its value', () => {
    const stored = {
      ...premiumFor([NEW_YEAR]),
      recordingFee: {
        registry: 'AKC',
        rates: [{ amountCents: 999, appliesFrom: null }],
        text: 'AKC recording fee: $9.99 per entry',
      },
    };
    const parsed = parseGeneratedPremium(JSON.parse(JSON.stringify(stored)));

    expect('recordingFee' in parsed).toBe(false);
    expect(buildPremiumFacts(parsed).recordingFee).toBe('AKC recording fee: $5.50 per entry');
    expect(snapshotOf(parsed).recordingFee).toBe('AKC recording fee: $5.50 per entry');
  });
});

describe('public premium page states the published recording fee (MYK9-2044)', () => {
  const TRIAL = fromAny<Trial, unknown>({
    id: 't1',
    name: 'New Year Trial',
    trialNumber: 1,
    trialDate: NEW_YEAR,
  });

  function publishedShow(content: unknown, style: PremiumStyle): Show {
    return fromAny<Show, unknown>({
      id: 'show-1',
      name: 'New Year Scent Trial',
      organization: 'Test Club',
      startDate: EVE,
      endDate: NEW_YEAR,
      entryCloseDate: '2030-12-01',
      experienceIsPublished: true,
      experiencePublishedStyle: style,
      experiencePublishedContent: content,
      trials: [],
    });
  }

  it.each(ALL_STYLES)('%s prints the words the published PDF prints', style => {
    const premium = { ...premiumFor([EVE, NEW_YEAR]), style };
    const Landing = STYLED_LANDING_BY_STYLE[style];
    render(
      <Landing show={publishedShow(snapshotOf(premium), style)} trial={TRIAL} allTrials={[TRIAL]} />
    );

    expect(buildPremiumFacts(premium).recordingFee).toBe(NEW_YEAR_TEXT);
    expect(screen.getByTestId('landing-recording-fee')).toHaveTextContent(NEW_YEAR_TEXT);
  });

  it.each(ALL_STYLES)('%s prints no line for a snapshot published without one', style => {
    const { recordingFee: published, ...legacy } = snapshotOf({
      ...premiumFor([EVE, NEW_YEAR]),
      style,
    });
    expect(published).toBe(NEW_YEAR_TEXT);
    const Landing = STYLED_LANDING_BY_STYLE[style];
    render(<Landing show={publishedShow(legacy, style)} trial={TRIAL} allTrials={[TRIAL]} />);

    expect(screen.queryByTestId('landing-recording-fee')).not.toBeInTheDocument();
    expect(screen.queryByText(/recording fee/i)).not.toBeInTheDocument();
  });
});
