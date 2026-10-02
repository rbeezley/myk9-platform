import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEntryDogLink } from '@/features/registration/entryDogContext';
import { type ColumnDef } from '@tanstack/react-table';
import { StatusBadge } from '@/components/status';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import { EntryStatusBadge } from '@/components/shows/EntryStatusBadge';
import { getEntryStatus } from '@/utils/entryStatusUtils';
import { formatShowsTableDateRange, splitShowLocation } from './ShowsTableView.helpers';

interface ShowsTableViewProps {
  shows: EnhancedShow[];
  canManageShow: (show: EnhancedShow) => boolean;
  isSelected?: (item: EnhancedShow) => boolean;
  onToggleSelect?: (item: EnhancedShow) => void;
}

// Organization sits in the Show subline, so it starts hidden. Status is a secretary concern: it
// shows on the Managing table (the viewer who can select rows) and stays off the public one,
// which is what keeps that table at five columns with no horizontal scroll (MYK9-427). There is
// no Columns menu (owner decision 4), so what shows is decided here.
const PUBLIC_COLUMN_VISIBILITY = { organization: false, status: false } as const;
const MANAGING_COLUMN_VISIBILITY = { organization: false } as const;

const DATA_COLUMNS: ColumnDef<EnhancedShow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Show',
    accessorFn: show => (show.name ?? '').toLowerCase(),
    meta: {
      exportHeader: 'Show',
      exportValue: (show: unknown) => (show as EnhancedShow).name || '',
    },
    cell: ({ row }) => {
      // events can repeat the organization (seed data does); say it once.
      const subline = [
        row.original.organization,
        ...row.original.events.filter(e => e !== row.original.organization),
      ].filter(Boolean);
      return (
        <div className="min-w-0">
          <div className="font-medium">{row.original.name}</div>
          {subline.length > 0 && (
            <div className="text-xs text-muted-foreground">{subline.join(' · ')}</div>
          )}
        </div>
      );
    },
  },
  {
    id: 'dateRange',
    header: 'Dates',
    accessorFn: show => show.startDate ?? '',
    meta: {
      exportHeader: 'Dates',
      exportValue: (show: unknown) => {
        const row = show as EnhancedShow;
        return row.startDate ? formatShowsTableDateRange(row.startDate, row.endDate) : '';
      },
    },
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.startDate
          ? formatShowsTableDateRange(row.original.startDate, row.original.endDate)
          : '\u2014'}
      </span>
    ),
  },
  {
    accessorKey: 'location',
    header: 'Location',
    accessorFn: show => (show.location ?? '').toLowerCase(),
    meta: {
      exportHeader: 'Location',
      exportValue: (show: unknown) => (show as EnhancedShow).location || '',
    },
    cell: ({ row }) => {
      // Two lines (venue / city) instead of one truncated string, so the column
      // needs no horizontal scroll to be readable (MYK9-427).
      const { venue, locality } = splitShowLocation(row.original.location);
      if (!venue) return <span className="text-muted-foreground">{'\u2014'}</span>;
      return (
        <div className="min-w-0 leading-snug">
          <div>{venue}</div>
          {locality && <div className="text-xs text-muted-foreground">{locality}</div>}
        </div>
      );
    },
  },
  {
    id: 'entries',
    header: 'Entries',
    accessorFn: show => getEntryStatus(show, show.userHasEntries).label,
    meta: {
      exportHeader: 'Entries',
      exportValue: (show: unknown) => {
        const row = show as EnhancedShow;
        return getEntryStatus(row, row.userHasEntries).label;
      },
    },
    cell: ({ row }) => (
      <EntryStatusBadge
        show={row.original}
        userHasEntries={row.original.userHasEntries}
        className="whitespace-nowrap"
      />
    ),
  },
  {
    accessorKey: 'organization',
    header: 'Organization',
    accessorFn: show => (show.organization ?? '').toLowerCase(),
    meta: {
      exportHeader: 'Organization',
      exportValue: (show: unknown) => (show as EnhancedShow).organization || '',
      exportHidden: true,
    },
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">
        {row.original.organization || '\u2014'}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    accessorFn: show => (show.status ?? '').toLowerCase(),
    meta: {
      exportHeader: 'Status',
      exportValue: (show: unknown) => (show as EnhancedShow).status || '',
      exportHidden: true,
    },
    cell: ({ row }) => (
      <StatusBadge
        family="show"
        status={row.original.status}
        className="whitespace-nowrap text-xs"
      />
    ),
  },
  {
    accessorKey: 'clubName',
    header: 'Host Club',
    accessorFn: show => (show.clubName ?? '').toLowerCase(),
    meta: {
      exportHeader: 'Host Club',
      exportValue: (show: unknown) => (show as EnhancedShow).clubName || '',
    },
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">{row.original.clubName || '\u2014'}</span>
    ),
  },
];

export const ShowsTableView: React.FC<ShowsTableViewProps> = ({
  shows,
  canManageShow,
  isSelected,
  onToggleSelect,
}) => {
  const navigate = useNavigate();
  const entryDogLink = useEntryDogLink();
  const hasSelection = Boolean(onToggleSelect && shows.some(canManageShow));

  const columns = useMemo<ColumnDef<EnhancedShow, unknown>[]>(() => {
    if (!hasSelection) return DATA_COLUMNS;
    const selectCol: ColumnDef<EnhancedShow, unknown> = {
      id: '_select',
      header: () => null,
      enableSorting: false,
      cell: ({ row }) =>
        canManageShow(row.original) ? (
          <Checkbox
            checked={isSelected?.(row.original) ?? false}
            onCheckedChange={() => onToggleSelect?.(row.original)}
            aria-label={`Select ${row.original.name}`}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          />
        ) : null,
      meta: { interactive: true, exportDisabled: true } satisfies DataTableColumnMeta,
    };
    return [selectCol, ...DATA_COLUMNS];
  }, [canManageShow, hasSelection, isSelected, onToggleSelect]);

  return (
    <DataTable<EnhancedShow>
      tableId="showsBrowse"
      data={shows}
      columns={columns}
      defaultColumnVisibility={
        onToggleSelect ? MANAGING_COLUMN_VISIBILITY : PUBLIC_COLUMN_VISIBILITY
      }
      // The page-level ListFilterBar owns search, and ListResultLine owns
      // "select all matching" (list-toolkit, MYK9-798) — the table keeps only
      // its per-row checkboxes.
      showSearch={false}
      getRowId={show => show.id}
      onRowClick={show => navigate(entryDogLink(`/shows/${show.id}`))}
    />
  );
};

export default ShowsTableView;
