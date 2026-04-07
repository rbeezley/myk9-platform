import type React from 'react';

/**
 * Triggers the browser print dialog for the contents of the given iframe.
 */
export function printIframe(iframeRef: React.RefObject<HTMLIFrameElement | null>): void {
  const iframe = iframeRef.current;
  if (!iframe?.contentDocument?.body?.innerHTML) return;
  iframe.contentWindow?.print();
}
