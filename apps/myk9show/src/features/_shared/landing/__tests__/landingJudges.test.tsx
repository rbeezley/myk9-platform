/**
 * MYK9-985 — the public landing listed no judges: `Trial.judge` is never assigned, so every
 * style fell back to "Judges to be announced" (Headline) or dropped the section (the rest).
 * These render the REAL page + REAL data hooks for all eight styles; only the get_show_judges
 * transport is stubbed, with the row shape the RPC returns to an anonymous visitor.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { render } from '@/test/utils/testUtils';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/supabaseClient')>();
  return { ...actual, supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } };
});

const { BannerLandingPage } = await import('@/features/banner/landing/BannerLandingPage');
const { FieldGuideLandingPage } =
  await import('@/features/fieldGuide/landing/FieldGuideLandingPage');
const { GazetteLandingPage } = await import('@/features/gazette/landing/GazetteLandingPage');
const { HeadlineLandingPage } = await import('@/features/headline/landing/HeadlineLandingPage');
const { HeritageLandingPage } = await import('@/features/heritage/landing/HeritageLandingPage');
const { MagazineLandingPage } = await import('@/features/magazine/landing/MagazineLandingPage');
const { MonogramLandingPage } = await import('@/features/monogram/landing/MonogramLandingPage');
const { PosterLandingPage } = await import('@/features/poster/landing/PosterLandingPage');

interface PageProps {
  show: Show;
  trial: Trial;
  allTrials: Trial[];
}

const STYLES: Array<[string, ComponentType<PageProps>]> = [
  ['banner', BannerLandingPage],
  ['fieldGuide', FieldGuideLandingPage],
  ['gazette', GazetteLandingPage],
  ['headline', HeadlineLandingPage],
  ['heritage', HeritageLandingPage],
  ['magazine', MagazineLandingPage],
  ['monogram', MonogramLandingPage],
  ['poster', PosterLandingPage],
];

const show = {
  id: 'show-heartland',
  name: 'Heartland Scent Work Classic',
  organization: 'Heartland Dog Club',
} as Show;

function makeTrial(id: string, trialNumber: string, trialDate: string): Trial {
  return {
    id,
    showId: show.id,
    showName: show.name,
    trialDate,
    trialNumber,
    status: 'no-status',
  } as unknown as Trial;
}

const trial1 = makeTrial('trial-1', 'Trial 1', '2026-08-01');
const trial2 = makeTrial('trial-2', 'Trial 2', '2026-08-02');

function rpcRow(
  id: string,
  personId: string,
  first: string,
  last: string,
  trialId: string,
  status = 'confirmed'
) {
  return {
    assignment_id: id,
    person_id: personId,
    first_name: first,
    last_name: last,
    trial_id: trialId,
    class_id: `class-${id}`,
    status,
  };
}

describe.each(STYLES)('%s landing judges (MYK9-985)', (_style, Page) => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockViewportWidth(1280);
  });

  const renderPage = () => render(<Page show={show} trial={trial1} allTrials={[trial1, trial2]} />);

  it('lists each confirmed judge once, across trials, with no placeholder', async () => {
    mockRpc.mockResolvedValue({
      data: [
        rpcRow('a-1', 'p-donovan', 'Pat', 'Donovan', 'trial-1'),
        rpcRow('a-2', 'p-donovan', 'Pat', 'Donovan', 'trial-1'),
        rpcRow('a-3', 'p-donovan', 'Pat', 'Donovan', 'trial-2'),
        rpcRow('a-4', 'p-lee', 'Sam', 'Lee', 'trial-2'),
        rpcRow('a-5', 'p-invited', 'Ina', 'Invited', 'trial-2', 'invited'),
      ],
      error: null,
    });
    renderPage();

    await waitFor(() => expect(screen.getAllByText(/pat donovan/i).length).toBeGreaterThan(0));
    expect(mockRpc).toHaveBeenCalledWith('get_show_judges', { p_show_id: show.id });
    expect(screen.getAllByText(/sam lee/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/ina invited/i)).toBeNull();
    expect(screen.queryByText(/Judges to be announced/i)).toBeNull();
  });

  it('shows no judge names when the show has no assignments', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    renderPage();

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(screen.queryByText(/pat donovan/i)).toBeNull();
  });
});

describe('Headline placeholder', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockViewportWidth(1280);
  });

  it('is shown only when the show has no confirmed assignments', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    render(<HeadlineLandingPage show={show} trial={trial1} allTrials={[trial1, trial2]} />);
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(screen.getByText('Judges to be announced')).toBeTruthy();
  });
});
