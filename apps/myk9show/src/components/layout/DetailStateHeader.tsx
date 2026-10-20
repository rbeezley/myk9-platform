import { createContext, useContext } from 'react';
import { PageHeader } from '@/components/common/PageHeader';

export interface DetailCrumb {
  label: string;
  href: string;
}

/** The list's own place in the trail, provided by `MasterDetailRoute` around the record. */
export const DetailCrumbContext = createContext<DetailCrumb | null>(null);

/**
 * The trail (and the page's screen-reader h1) for a record that is not ready: loading, failed,
 * offline, not found. A ready record brings its own header; the list column carries none, so
 * without this a deep link to a record that is still loading would have neither (MYK9-1267).
 * Pass `omitTitle` where the state paints its own h1, so there is never a second one.
 */
export function DetailStateHeader({ omitTitle = false }: { omitTitle?: boolean }) {
  const crumb = useContext(DetailCrumbContext);
  if (!crumb) return null;
  return <PageHeader breadcrumbs={[crumb]} title={crumb.label} omitTitle={omitTitle} />;
}
