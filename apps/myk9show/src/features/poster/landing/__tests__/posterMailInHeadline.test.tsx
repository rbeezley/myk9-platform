/**
 * MYK9-979 (Codex round 8 on #2707): on a mail-in show whose classes are
 * assigned, the Poster landing's final headline says how to enter, never
 * "Entries open when classes are assigned". Rendered through ShowPublicLanding
 * so the mail-in context comes from the real show, as in production.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowPublicLanding } from '@/components/shows/ShowDetails/ShowPublicLanding';
import type { Show } from '@/types/show-types';
import type { PosterLandingData } from '../types';

vi.mock('../../fonts', async importOriginal => {
  const actual = await importOriginal<typeof import('../../fonts')>();
  return { ...actual, ensurePosterFontsLoaded: vi.fn() };
});

const data: PosterLandingData = {
  clubName: 'Tri-County Dog Training Club',
  showName: 'Fall Scent Work Trial',
  showSubtitle: 'AKC Licensed Trial',
  welcomeText: null,
  trialChairName: null,
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2099-01-01',
  confirmationDate: null,
  trialStartDate: '2099-02-01',
  trialEndDate: '2099-02-02',
  timezone: 'America/Chicago',
  venueName: 'Expo Hall',
  venueAddress: '100 Dog Show Lane',
  venueCity: 'Tulsa, OK',
  trials: [],
  judges: [],
  entryCount: 0,
  entryLimit: null,
  fees: [],
  accommodations: [],
  vetClinic: null,
  coverImageUrl: null,
  pullQuote: null,
  pullQuoteAttribution: null,
  hospitalityNotes: null,
  awardsDescription: null,
  houseRulesNotes: null,
  secretaryName: null,
  secretaryEmail: null,
  licenseLanguage: 'AKC Licensed Trial',
  memberClubLanguage: 'A member club of the American Kennel Club.',
  journeySteps: [],
  entryWizardUrl: '/shows/show-1/register',
  officers: [],
  onTheDay: [],
};

vi.mock('../usePosterLandingData', () => ({
  usePosterLandingData: () => data,
}));

function headlines(): string[] {
  return screen.getAllByRole('heading').map(h => (h.textContent ?? '').replace(/\s+/g, ' ').trim());
}

describe('Poster landing — mail-in headline', () => {
  it('a mail-in show with classes says how to enter, not "classes are assigned"', () => {
    render(
      <ShowPublicLanding
        show={
          {
            id: 'show-1',
            name: data.showName,
            style: 'poster',
            onlineEntriesEnabled: false,
          } as Show
        }
        landingTrials={[]}
        hasEntryClassInventory
        entryWindowNotOpen={false}
      />
    );

    expect(headlines()).toContain('Enter by mail or at the show.');
    expect(headlines().join(' | ')).not.toMatch(/entries open when classes are assigned/i);
  });
});
