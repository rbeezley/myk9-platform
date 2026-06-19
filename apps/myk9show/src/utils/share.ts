export interface ShareOptions {
  title: string;
  text: string;
  url: string;
  /** If set, copy this instead of url on clipboard fallback (e.g., LiveResults copies results text). */
  clipboardText?: string;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled';

export interface ShareFileOptions {
  title: string;
  text: string;
  fileName: string;
}

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

export async function shareFile(blob: Blob, options: ShareFileOptions): Promise<ShareResult> {
  const file = new File([blob], options.fileName, { type: blob.type || 'image/png' });
  const data = { title: options.title, text: options.text, files: [file] };

  if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = options.fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }

  try {
    await navigator.clipboard?.writeText(options.text);
  } catch {
    // The PNG download already succeeded; clipboard support is best-effort.
  }
  return 'copied';
}
