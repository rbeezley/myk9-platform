import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
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
    // Each edit lands before the previous one's deadline, so each restarts the wait.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PDF_BUILD_SETTLE_MS - 100);
    });
    rerender(link(premium('ab')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PDF_BUILD_SETTLE_MS - 100);
    });
    rerender(link(premium('abc')));
    // Past the FIRST edit's deadline: a timer that never reset would have built by now.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(renderMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PDF_BUILD_SETTLE_MS);
    });
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ title: 'abc' });
  });

  it('never offers a revoked link when the inputs flip back before the next build (MYK9-2215)', async () => {
    const created = ['blob:first', 'blob:second'];
    URL.createObjectURL = vi.fn(() => created.shift() ?? 'blob:later');
    const a = premium('a');
    const { rerender } = render(link(a));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PDF_BUILD_SETTLE_MS);
    });
    expect(screen.getByRole('link', { name: /download pdf/i })).toHaveAttribute(
      'href',
      'blob:first'
    );

    // Change, then flip back to the very same premium object before any rebuild settles.
    rerender(link(premium('b')));
    rerender(link(a));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    expect(screen.queryByRole('link', { name: /download pdf/i })).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PDF_BUILD_SETTLE_MS);
    });
    expect(screen.getByRole('link', { name: /download pdf/i })).toHaveAttribute(
      'href',
      'blob:second'
    );
  });
});
