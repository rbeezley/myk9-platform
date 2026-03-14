import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shareOrCopy } from './share';

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
