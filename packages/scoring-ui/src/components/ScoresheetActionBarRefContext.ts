/**
 * Seam for the host app: provide a callback ref and the scoresheet action bar
 * hands it its root node on attach and null on detach. The app uses it to tell
 * its toaster how tall the bar is (this package cannot import app hooks).
 */
import { createContext } from 'react';

export type ScoresheetActionBarRef = (node: HTMLDivElement | null) => void;
export const ScoresheetActionBarRefContext = createContext<ScoresheetActionBarRef | null>(null);
