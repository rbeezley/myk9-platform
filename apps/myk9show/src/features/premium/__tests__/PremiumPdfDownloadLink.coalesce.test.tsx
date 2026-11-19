import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { GeneratedPremium } from '@/types/premium-types';

const renderMock = vi.hoisted(() => vi.fn());
vi.mock('../publishPremium', () => ({
  renderPremiumPdf: (...args: unknown[]) => renderMock(...args),
}));

import PremiumPdfDownloadLink, { PDF_BUILD_SETTLE_MS } from '../PremiumPdfDownloadLink';

const premium = (title: string) => ({ org: 'UKC', title }) as unknown as GeneratedPremium;

function link(p: GeneratedPremium) {
  return (
    <PremiumPdfDownloadLink
      showId="show-1"
      premium={p}
      inkSaver={false}
      fileName="premium.pdf"
      onDownloaded={() => undefined}
      onError={() => undefined}
      onUrl={() => undefined}
      onPreview={() => undefined}
    />
  );
}

describe('PremiumPdfDownloadLink build coalescing (MYK9-2215)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    renderMock.mockReset().mockResolvedValue(new Blob(['x'], { type: 'application/pdf' }));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds once, for the newest premium, after a burst of edits', async () => {
    const { rerender } = render(link(premium('a')));
    rerender(link(premium('ab')));
    rerender(link(premium('abc')));
    expect(renderMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PDF_BUILD_SETTLE_MS);
    });
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ title: 'abc' });
  });
});
