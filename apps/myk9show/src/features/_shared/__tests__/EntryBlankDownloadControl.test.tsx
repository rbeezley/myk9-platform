import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { EntryBlankDownloadControl } from '../EntryBlankDownloadControl';

const { pdfMock, saveAsMock, loadReactPdfMock } = vi.hoisted(() => ({
  pdfMock: vi.fn(),
  saveAsMock: vi.fn(),
  loadReactPdfMock: vi.fn(),
}));

vi.mock('../loadReactPdf', () => ({ loadReactPdf: loadReactPdfMock }));
vi.mock('file-saver', () => ({ saveAs: saveAsMock }));

interface DocProps {
  name: string;
}
const Doc: ComponentType<DocProps> = () => null;
const BLOB = new Blob(['%PDF'], { type: 'application/pdf' });

function setup(
  overrides: { missingRegistration?: boolean; loadDocument?: () => Promise<never> } = {}
) {
  const loadDocument = vi.fn(overrides.loadDocument ?? (() => Promise.resolve(Doc)));
  const view = render(
    <EntryBlankDownloadControl
      loadDocument={loadDocument as () => Promise<ComponentType<DocProps>>}
      documentProps={{ name: 'Tera' }}
      dog={{ missingRegistration: overrides.missingRegistration ?? false }}
      fileName="spring-trial-entry-blank.pdf"
      label="Download Tera — Advanced Exterior"
    />
  );
  return { loadDocument, ...view };
}

describe('EntryBlankDownloadControl', () => {
  beforeEach(() => {
    pdfMock.mockReset();
    saveAsMock.mockReset();
    loadReactPdfMock.mockReset();
    loadReactPdfMock.mockResolvedValue({ pdf: pdfMock });
    pdfMock.mockReturnValue({ toBlob: () => Promise.resolve(BLOB) });
  });

  it('loads neither the document nor the renderer until the button is used', () => {
    const { loadDocument } = setup();

    expect(screen.getByRole('button', { name: 'Download Tera — Advanced Exterior' })).toBeEnabled();
    expect(loadDocument).not.toHaveBeenCalled();
    expect(loadReactPdfMock).not.toHaveBeenCalled();
    expect(pdfMock).not.toHaveBeenCalled();
    expect(saveAsMock).not.toHaveBeenCalled();
  });

  it('warms the chunks on hover without generating anything', async () => {
    const { user, loadDocument } = setup();

    await user.hover(screen.getByRole('button', { name: 'Download Tera — Advanced Exterior' }));

    await waitFor(() => expect(loadDocument).toHaveBeenCalledTimes(1));
    expect(loadReactPdfMock).toHaveBeenCalledTimes(1);
    expect(pdfMock).not.toHaveBeenCalled();
    expect(saveAsMock).not.toHaveBeenCalled();
  });

  it('on click renders the document, shows Preparing on the button, then downloads once', async () => {
    let resolveBlob: (blob: Blob) => void = () => undefined;
    pdfMock.mockReturnValue({
      toBlob: () =>
        new Promise<Blob>(resolve => {
          resolveBlob = resolve;
        }),
    });
    const { user, loadDocument } = setup();

    await user.click(screen.getByRole('button', { name: 'Download Tera — Advanced Exterior' }));

    const preparing = await screen.findByRole('button', {
      name: 'Preparing Tera — Advanced Exterior…',
    });
    expect(preparing).toBeDisabled();
    expect(preparing).toHaveTextContent('Preparing…');
    expect(loadDocument).toHaveBeenCalled();
    expect(loadReactPdfMock).toHaveBeenCalled();
    expect(saveAsMock).not.toHaveBeenCalled();

    const element = pdfMock.mock.calls[0]?.[0] as { type: unknown; props: unknown };
    expect(element.type).toBe(Doc);
    expect(element.props).toEqual({ name: 'Tera' });

    resolveBlob(BLOB);

    await waitFor(() => expect(saveAsMock).toHaveBeenCalledTimes(1));
    expect(saveAsMock).toHaveBeenCalledWith(BLOB, 'spring-trial-entry-blank.pdf');
    expect(
      await screen.findByRole('button', { name: 'Download Tera — Advanced Exterior' })
    ).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error and re-enables the button when the document fails to load', async () => {
    const { user } = setup({ loadDocument: () => Promise.reject(new Error('chunk failed')) });

    await user.click(screen.getByRole('button', { name: 'Download Tera — Advanced Exterior' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t prepare Tera — Advanced Exterior'
    );
    expect(screen.getByRole('button', { name: 'Download Tera — Advanced Exterior' })).toBeEnabled();
    expect(saveAsMock).not.toHaveBeenCalled();
  });

  it('shows an error when the PDF fails to render, and a retry downloads', async () => {
    pdfMock.mockReturnValueOnce({ toBlob: () => Promise.reject(new Error('layout failed')) });
    const { user } = setup();
    const button = () => screen.getByRole('button', { name: 'Download Tera — Advanced Exterior' });

    await user.click(button());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(saveAsMock).not.toHaveBeenCalled();

    await user.click(button());
    await waitFor(() => expect(saveAsMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the missing-registration warning, and its click is the acknowledgement that downloads', async () => {
    const { user, loadDocument } = setup({ missingRegistration: true });

    expect(screen.getByRole('alert')).toHaveTextContent('no registration for this trial');
    expect(loadDocument).not.toHaveBeenCalled();
    expect(saveAsMock).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', {
        name: 'Generate partly filled form for Tera — Advanced Exterior',
      })
    );

    await waitFor(() => expect(saveAsMock).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('button', { name: /Generate partly filled form/ })
    ).not.toBeInTheDocument();
  });
});
