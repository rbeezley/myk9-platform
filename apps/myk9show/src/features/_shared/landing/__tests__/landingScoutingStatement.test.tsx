/**
 * MYK9-2043: every public landing style prints AKC's fixed statement about not scouting the
 * trial location, in the regulation's words, and no style prints it for a UKC or ASCA trial. MYK9-2225: an ASCA trial prints ASCA's required
 * statements (§1.5) in the same section instead.
 * Renders the REAL pages; only the Supabase transport is stubbed.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { render } from '@/test/utils/testUtils';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import {
  AKC_PREMIUM_SCOUTING_STATEMENT,
  ASCA_PREMIUM_REQUIRED_STATEMENT,
} from '@/features/registries';
import type { PremiumStyle } from '@/types/premium-types';

interface PageProps {
  show: Show;
  trial: Trial;
  allTrials: Trial[];
}

const STYLES = Object.entries(STYLED_LANDING_BY_STYLE) as Array<
  [PremiumStyle, ComponentType<PageProps>]
>;

const show = {
  id: 'show-heartland',
  name: 'Heartland Scent Work Classic',
  organization: 'Heartland Dog Club',
} as Show;

function trialFor(registryId: string): Trial {
  return {
    id: 'trial-1',
    showId: show.id,
    showName: show.name,
    trialDate: '2026-08-01',
    trialNumber: 'Trial 1',
    status: 'no-status',
    registryId,
  } as unknown as Trial;
}

describe.each(STYLES)('%s landing scouting statement (MYK9-2043)', (_style, Page) => {
  beforeEach(() => {
    mockViewportWidth(1280);
  });

  it('prints the AKC statement in the regulation’s words for an AKC trial', () => {
    const trial = trialFor('AKC');
    render(<Page show={show} trial={trial} allTrials={[trial]} />);

    const section = screen.getByTestId('landing-scouting-statement');
    expect(
      within(section).getByRole('heading', { name: 'Scouting the Trial Location' })
    ).toBeTruthy();
    expect(within(section).getByText(AKC_PREMIUM_SCOUTING_STATEMENT)).toBeTruthy();
  });

  it('prints no scouting statement for a UKC trial', () => {
    const trial = trialFor('UKC');
    render(<Page show={show} trial={trial} allTrials={[trial]} />);

    expect(screen.queryByTestId('landing-scouting-statement')).toBeNull();
    expect(screen.queryByText(/scout the trial location/)).toBeNull();
  });

  it('prints ASCA’s required statements, and no scouting statement, for an ASCA trial', () => {
    const trial = trialFor('ASCA');
    render(<Page show={show} trial={trial} allTrials={[trial]} />);

    const section = screen.getByTestId('landing-scouting-statement');
    expect(
      within(section).getByRole('heading', { name: ASCA_PREMIUM_REQUIRED_STATEMENT.label })
    ).toBeTruthy();
    expect(within(section).getByText(ASCA_PREMIUM_REQUIRED_STATEMENT.text)).toBeTruthy();
    expect(screen.queryByText(/scout the trial location/)).toBeNull();
  });
});
