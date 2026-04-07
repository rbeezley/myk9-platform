import type React from 'react';

/**
 * Triggers the browser print dialog for the contents of the given iframe.
 */
export function printIframe(iframeRef: React.RefObject<HTMLIFrameElement | null>): void {
  iframeRef.current?.contentWindow?.print();
}
