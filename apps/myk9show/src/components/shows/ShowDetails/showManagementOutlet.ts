import { useOutletContext } from 'react-router-dom';
import type { ShowDetailTabsProps } from '@/components/shows/ShowDetails/ShowDetailTabs';

/**
 * What `ShowManagementShell` hands its `<Outlet/>`. Every tab is a real page
 * now (MYK9-630 phase 2), and the Setup page renders bodies — Trials, Classes,
 * Show Map — that used to be tabs on the show page itself. Rather than have
 * those pages re-read trials, classes and entries (three more reads that could
 * disagree with the badges above them), the shell passes down the data the
 * page has ALREADY loaded. Links, not re-implementations; one read, one number.
 */
export type ShowManagementOutletContext = ShowDetailTabsProps;

export function useShowManagementOutlet(): ShowManagementOutletContext {
  return useOutletContext<ShowManagementOutletContext>();
}
