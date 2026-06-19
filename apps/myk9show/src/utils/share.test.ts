import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shareFile, shareOrCopy } from './share';

const shareOptions = {
  title: 'Rocky Mountain Classic — June 14–15, 2026',
  text: 'AKC Dog Show in Denver, CO · Rocky Mountain Dog Club',
  url: 'https://example.com/shows/123',
};

describe('shareOrCopy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses navigator.share when available', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: shareMock,
      writable: true,
      configurable: true,
    });

    const result = await shareOrCopy(shareOptions);

    expect(shareMock).toHaveBeenCalledWith(shareOptions);
    expect(result).toBe('shared');
  });

  it('falls back to clipboard when navigator.share is unavailable', async () => {
    // Remove navigator.share
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const result = await shareOrCopy(shareOptions);

    expect(writeTextMock).toHaveBeenCalledWith(shareOptions.url);
    expect(result).toBe('copied');
  });

  it('falls back to clipboard when navigator.share throws AbortError', async () => {
    const abortError = new DOMException('Share canceled', 'AbortError');
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(abortError),
      writable: true,
      configurable: true,
    });

    // AbortError means user cancelled — should resolve without fallback
    const result = await shareOrCopy(shareOptions);
    expect(result).toBe('cancelled');
  });

  it('falls back to clipboard when navigator.share throws non-abort error', async () => {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new Error('Share failed')),
      writable: true,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const result = await shareOrCopy(shareOptions);

    expect(writeTextMock).toHaveBeenCalledWith(shareOptions.url);
    expect(result).toBe('copied');
  });

  it('copies clipboardText instead of url when provided', async () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const result = await shareOrCopy({
      ...shareOptions,
      clipboardText: 'Results summary text here',
    });

    expect(writeTextMock).toHaveBeenCalledWith('Results summary text here');
    expect(result).toBe('copied');
  });

  it('throws when both share and clipboard fail', async () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard failed')) },
      writable: true,
      configurable: true,
    });

    await expect(shareOrCopy(shareOptions)).rejects.toThrow('Clipboard failed');
  });
});

describe('shareFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses native file share when supported', async () => {
    const fileShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => true),
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', {
      value: fileShare,
      configurable: true,
    });

    const result = await shareFile(new Blob(['png'], { type: 'image/png' }), {
      title: 'Ditto qualified',
      text: 'Ditto earned a Q.',
      fileName: 'ditto-result.png',
    });

    expect(fileShare).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Ditto qualified',
        text: 'Ditto earned a Q.',
        files: [expect.any(File)],
      })
    );
    expect(result).toBe('shared');
  });

  it('downloads and copies text when file share is unavailable', async () => {
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => false),
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });
    const click = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:result');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const result = await shareFile(new Blob(['png'], { type: 'image/png' }), {
      title: 'Ditto qualified',
      text: 'Ditto earned a Q.',
      fileName: 'ditto-result.png',
    });

    expect(click).toHaveBeenCalled();
    expect(writeTextMock).toHaveBeenCalledWith('Ditto earned a Q.');
    expect(result).toBe('copied');
  });

  it('still reports a completed download when clipboard text copy fails', async () => {
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => false),
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard blocked')) },
      configurable: true,
    });
    const click = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:result');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const result = await shareFile(new Blob(['png'], { type: 'image/png' }), {
      title: 'Ditto qualified',
      text: 'Ditto earned a Q.',
      fileName: 'ditto-result.png',
    });

    expect(click).toHaveBeenCalled();
    expect(result).toBe('copied');
  });

  it('[ADDED] returns cancelled when the native file share sheet is dismissed', async () => {
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => true),
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new DOMException('Share canceled', 'AbortError')),
      configurable: true,
    });

    const result = await shareFile(new Blob(['png'], { type: 'image/png' }), {
      title: 'Ditto qualified',
      text: 'Ditto earned a Q.',
      fileName: 'ditto-result.png',
    });

    expect(result).toBe('cancelled');
  });
});
