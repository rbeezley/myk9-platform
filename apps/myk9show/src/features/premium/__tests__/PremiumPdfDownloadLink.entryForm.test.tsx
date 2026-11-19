import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { render } from '@/test/utils/testUtils';
import type { GeneratedPremium } from '@/types/premium-types';

vi.mock('@react-pdf/renderer', () => ({
  PDFDownloadLink: ({
    children,
  }: {
    children: (state: { loading: boolean; error: null; url: string }) => ReactNode;
  }) => <div>{children({ loading: false, error: null, url: 'blob:raw-premium' })}</div>,
}));
vi.mock('../pdf/AKCPremiumTemplate', () => ({ AKCPremiumTemplate: () => null }));
vi.mock('../pdf/UKCPremiumTemplate', () => ({ UKCPremiumTemplate: () => null }));

const appendMock = vi.fn();
vi.mock('../akcEntryFormAppendix', async importOriginal => ({
  ...(await importOriginal<typeof import('../akcEntryFormAppendix')>()),
  appendAkcEntryForm: (blob: Blob) => appendMock(blob),
}));

import PremiumPdfDownloadLink from '../PremiumPdfDownloadLink';

function premium(org: 'AKC' | 'UKC', type = 'scent_work'): GeneratedPremium {
  return { org, trials: [{ type }] } as unknown as GeneratedPremium;
}

function renderLink(p: GeneratedPremium) {
  const props = {
    onDownloaded: vi.fn(),
    onError: vi.fn(),
    onUrl: vi.fn(),
    onPreview: vi.fn(),
  };
  render(<PremiumPdfDownloadLink premium={p} inkSaver={false} fileName="premium.pdf" {...props} />);
  return props;
}

describe('editor Preview and Download include the AKC entry form (MYK9-2057)', () => {
  beforeEach(() => {
    appendMock.mockReset().mockResolvedValue(new Blob(['joined'], { type: 'application/pdf' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['raw'], { type: 'application/pdf' })))
    );
    URL.createObjectURL = vi.fn(() => 'blob:joined-premium');
    URL.revokeObjectURL = vi.fn();
  });

  it('previews the joined file for an AKC Scent Work premium', async () => {
    const props = renderLink(premium('AKC'));
    await waitFor(() => expect(props.onUrl).toHaveBeenCalledWith('blob:joined-premium'));
    expect(props.onUrl).not.toHaveBeenCalledWith('blob:raw-premium');
    expect(appendMock).toHaveBeenCalledTimes(1);
  });

  it('downloads the joined file', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const props = renderLink(premium('AKC'));
    await waitFor(() => expect(props.onUrl).toHaveBeenCalledWith('blob:joined-premium'));
    await userEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.href).toBe('blob:joined-premium');
    expect(anchor.download).toBe('premium.pdf');
    expect(props.onDownloaded).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it('leaves a UKC premium as rendered', async () => {
    const props = renderLink(premium('UKC'));
    await waitFor(() => expect(props.onUrl).toHaveBeenCalledWith('blob:raw-premium'));
    expect(appendMock).not.toHaveBeenCalled();
  });

  it('reports a failed join through onError', async () => {
    appendMock.mockRejectedValue(new Error('template missing'));
    const props = renderLink(premium('AKC'));
    await waitFor(() =>
      expect(props.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'template missing' })
      )
    );
    expect(props.onUrl).not.toHaveBeenCalled();
  });
});
