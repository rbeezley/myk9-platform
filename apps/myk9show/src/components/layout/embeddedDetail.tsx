import { createContext, useContext } from 'react';

const EmbeddedDetailContext = createContext(false);

/**
 * True while a detail view is rendered inside a master-detail pane rather than as its own page.
 * `PageShell` and `RecordPageLayout` read it: a pane has no page chrome (max width, page padding,
 * its own `app-shell-page` surface) and is far narrower than the viewport its `xl:` classes see.
 */
export const EmbeddedDetailProvider = EmbeddedDetailContext.Provider;

export function useEmbeddedDetail(): boolean {
  return useContext(EmbeddedDetailContext);
}
