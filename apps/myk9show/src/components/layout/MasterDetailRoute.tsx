import React from 'react';
import { useParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { PageTransition } from '@/components/common/PageTransition';
import { PageHeader } from '@/components/common/PageHeader';
import { MASTER_DETAIL_QUERY } from './MasterDetailLayout';
import { DetailCrumbContext } from './DetailStateHeader';

interface MasterDetailRouteProps {
  /** The browse page; given `detail` it renders the split (compact list beside it). */
  List: React.ComponentType<{ detail?: React.ReactNode }>;
  /** The record page for `/:id`. */
  Detail: React.ComponentType;
  EmptyIcon: LucideIcon;
  /** Shown in the right pane until a record is picked, e.g. "Select a dog to see its details". */
  emptyText: string;
  /**
   * The list's own place in the trail (`{ label: 'Dogs', href: '/dogs' }`). Rendered at the top of
   * the right pane while nothing is open (Home > Dogs), where an open record's own header (its
   * breadcrumb and hero) takes over. The list column carries no title or trail of its own, so the
   * title and trail live in the detail column on every Browse tab, as on Shows.
   */
  crumb: { label: string; href: string };
}

/**
 * The one route element for a list route and its `/:id` route, so the list stays mounted when the
 * record changes: its scroll position, filters and selection survive a click. Wide screens are
 * always split, list left and record right (a prompt until one is picked); narrow ones keep the
 * page hop (the record replaces the list).
 *
 * `PageTransition` is keyed by pathname, so it wraps only the record, never the list.
 */
export const MasterDetailRoute: React.FC<MasterDetailRouteProps> = ({
  List,
  Detail,
  EmptyIcon,
  emptyText,
  crumb,
}) => {
  const { id } = useParams<{ id: string }>();
  const isWide = useMediaQuery(MASTER_DETAIL_QUERY);

  const record = id ? (
    <PageTransition>
      {/* Keyed so a record's own state (a just-created dog, open panels) never leaks to the next. */}
      <DetailCrumbContext.Provider value={crumb}>
        <Detail key={id} />
      </DetailCrumbContext.Provider>
    </PageTransition>
  ) : null;

  if (!isWide) return id ? record : <List />;

  return (
    <List
      detail={
        record ?? (
          <div className="flex h-full min-h-64 flex-col">
            {/* The page's one (screen-reader-only) h1 while nothing is open, as on Find Shows. */}
            <PageHeader breadcrumbs={[crumb]} title={crumb.label} />
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <EmptyIcon className="h-8 w-8" aria-hidden="true" />
              <p className="text-sm">{emptyText}</p>
            </div>
          </div>
        )
      }
    />
  );
};
