/**
 * MYK9-2173: the resolved cover image is bound to the URL it was resolved from, so a Regenerate
 * that changes or removes the cover rebuilds the premium with the new cover, or none.
 */
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PremiumContentEditor } from '../PremiumContentEditor';
import { generatedPremium } from './fixtures/generatedPremium';
import type { GeneratedPremium } from '@/types/premium-types';

const generateMock = vi.hoisted(() => vi.fn());

vi.mock('../useGeneratePremium', () => ({
  useGeneratePremium: () => ({
    generate: generateMock,
    isLoading: false,
    error: null,
    reset: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/usePremiumGenerations', () => ({
  useLogPremiumGeneration: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/queries/usePremiumTemplates', () => ({
  useUpdatePremiumTemplate: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/services/imageUploadService', () => ({ uploadShowCover: vi.fn() }));
vi.mock('../coverImageDataUrl', () => ({
  fileToDataUrl: vi.fn(),
  resolvePdfCoverImageSrc: vi.fn(async (url: string | null) =>
    url ? `data:resolved-${url}` : null
  ),
}));
vi.mock('../pdf/AKCPremiumTemplate', () => ({ AKCPremiumTemplate: () => <div /> }));
vi.mock('../pdf/UKCPremiumTemplate', () => ({ UKCPremiumTemplate: () => <div /> }));
vi.mock('../publishPremium', () => ({
  renderPremiumPdf: vi.fn(() => new Promise(() => undefined)),
}));

function premiumWithCover(coverImageUrl: string | null): GeneratedPremium {
  const base = generatedPremium();
  return { ...base, supplemental: { ...base.supplemental, coverImageUrl } };
}

async function regenerateTo(next: GeneratedPremium) {
  let resolve: (p: GeneratedPremium) => void = () => {};
  generateMock.mockImplementation(() => new Promise<GeneratedPremium>(r => (resolve = r)));
  fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }));
  await act(async () => resolve(next));
}

describe('PremiumContentEditor cover after Regenerate', () => {
  afterEach(() => {
    generateMock.mockReset();
  });

  it('uses the new cover when Regenerate changes it', async () => {
    const onPremiumChange = vi.fn();
    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        active
        initialPremium={premiumWithCover('https://x/old.png')}
        onPremiumChange={onPremiumChange}
      />
    );
    await waitFor(() =>
      expect(onPremiumChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          supplemental: expect.objectContaining({
            coverImageUrl: 'data:resolved-https://x/old.png',
          }),
        })
      )
    );

    await regenerateTo(premiumWithCover('https://x/new.png'));

    await waitFor(() =>
      expect(onPremiumChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          supplemental: expect.objectContaining({
            coverImageUrl: 'data:resolved-https://x/new.png',
          }),
        })
      )
    );
    const urls = onPremiumChange.mock.calls.map(c => c[0]?.supplemental.coverImageUrl);
    expect(urls.at(-1)).not.toContain('old.png');
  });

  it('uses no cover when Regenerate removes it', async () => {
    const onPremiumChange = vi.fn();
    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        active
        initialPremium={premiumWithCover('https://x/old.png')}
        onPremiumChange={onPremiumChange}
      />
    );
    await waitFor(() =>
      expect(onPremiumChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          supplemental: expect.objectContaining({
            coverImageUrl: 'data:resolved-https://x/old.png',
          }),
        })
      )
    );

    await regenerateTo(premiumWithCover(null));

    await waitFor(() =>
      expect(onPremiumChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          supplemental: expect.objectContaining({ coverImageUrl: null }),
        })
      )
    );
  });
});
