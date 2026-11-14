import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { downloadPdfBytes } from '@/features/organization-forms/downloadPdf';

/**
 * Loads PDF bytes into the preview iframe, and reports when the frame holds exactly those bytes.
 * A layout effect: Print goes disabled in the commit that empties the frame (MYK9-1904).
 */
export function usePacketFrame(bytes: Uint8Array | null): {
  frameRef: RefObject<HTMLIFrameElement | null>;
  frameReady: boolean;
} {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameFor, setFrameFor] = useState<Uint8Array | null>(null);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (frame.getAttribute('src')?.startsWith('blob:')) frame.src = 'about:blank';
    if (!bytes) return;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'application/pdf' }));
    frame.src = url;
    // The iframe is an external system; this mirrors which bytes it now holds.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrameFor(bytes);
    return () => {
      URL.revokeObjectURL(url);
      setFrameFor(null);
    };
  }, [bytes]);
  return { frameRef, frameReady: bytes !== null && frameFor === bytes };
}

/** A file name from some words: letters, digits and dashes, ending in `.pdf`. */
export function packetFileName(parts: Array<string | null>): string {
  const base = parts.filter(Boolean).join(' ');
  return `${base.replace(/[^\w\s.-]+/g, '').replace(/\s+/g, '-')}.pdf`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Saving a PDF marks nothing as printed. */
export function savePacketPdf(bytes: Uint8Array, fileName: string): void {
  downloadPdfBytes(bytes, fileName);
}
