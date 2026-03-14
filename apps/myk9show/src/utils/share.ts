export interface ShareOptions {
  title: string;
  text: string;
  url: string;
  /** If set, copy this instead of url on clipboard fallback (e.g., LiveResults copies results text). */
  clipboardText?: string;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled';

/**
 * Share content via native share sheet, or copy to clipboard as fallback.
 * Copies `clipboardText` if provided, otherwise copies `url`.
 */
export async function shareOrCopy(options: ShareOptions): Promise<ShareResult> {
  if (navigator.share) {
    try {
      const { clipboardText: _, ...shareData } = options;
      await navigator.share(shareData);
      return 'shared';
    } catch (err) {
      // User cancelled the share sheet
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled';
      }
      // Other share error — fall through to clipboard
    }
  }

  await navigator.clipboard.writeText(options.clipboardText ?? options.url);
  return 'copied';
}
