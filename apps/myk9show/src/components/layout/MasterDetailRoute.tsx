import React from 'react';
import { useParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { PageTransition } from '@/components/common/PageTransition';
import { MASTER_DETAIL_QUERY } from './MasterDetailLayout';

interface MasterDetailRouteProps {
  /** The browse page; given `detail` it renders the split (compact list beside it). */
  List: React.ComponentType<{ detail?: React.ReactNode }>;
  /** The record page for `/:id`. */
  Detail: React.ComponentType;
  EmptyIcon: LucideIcon;
  /** Shown in the right pane until a record is picked, e.g. "Select a dog to see its details". */
  emptyText: string;
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
}) => {
  const { id } = useParams<{ id: string }>();
  const isWide = useMediaQuery(MASTER_DETAIL_QUERY);

  const record = id ? (
    <PageTransition>
      {/* Keyed so a record's own state (a just-created dog, open panels) never leaks to the next. */}
      <Detail key={id} />
    </PageTransition>
  ) : null;

  if (!isWide) return id ? record : <List />;

  return (
    <List
      detail={
        record ?? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <EmptyIcon className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm">{emptyText}</p>
          </div>
        )
      }
    />
  );
};
