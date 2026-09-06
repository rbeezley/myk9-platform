import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import { EntryStatusBadge } from '@/components/shows/EntryStatusBadge';
import { getEntryStatus } from '@/utils/entryStatusUtils';
import { formatShowsTableDateRange, splitShowLocation } from './ShowsTableView.helpers';

interface ShowsTableViewProps {
  shows: EnhancedShow[];
  isSelected?: (item: EnhancedShow) => boolean;
  onToggleSelect?: (item: EnhancedShow) => void;
  isAllSelected?: boolean;
  onToggleAll?: () => void;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return (
        <Badge variant="secondary" className="text-xs bg-success/10 text-success ">
          Completed
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="secondary" className="text-xs bg-destructive/10 text-destructive ">
          Cancelled
        </Badge>
      );
    case 'archived':
      return (
        <Badge
          variant="secondary"
          className="text-xs bg-gray-100 text-gray-500 dark:bg-gray-800/30 dark:text-gray-400"
        >
          Archived
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-xs bg-info/10 text-info-strong">
          {status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : 'Active'}
        </Badge>
      );
  }
}

// Organization sits in the Show subline and Status is a secretary concern, so
// both start hidden. They stay in the Columns menu (and in the CSV once shown),
// which is what keeps the public table at five columns with no horizontal
// scroll (MYK9-427).
const DEFAULT_COLUMN_VISIBILITY = { organization: false, status: false } as const;

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
    },
    cell: ({ row }) => getStatusBadge(row.original.status),
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
  isSelected,
  onToggleSelect,
  isAllSelected,
  onToggleAll,
}) => {
  const navigate = useNavigate();
  const hasSelection = Boolean(onToggleSelect);

  const columns = useMemo<ColumnDef<EnhancedShow, unknown>[]>(() => {
    if (!hasSelection) return DATA_COLUMNS;
    const selectCol: ColumnDef<EnhancedShow, unknown> = {
      id: '_select',
      header: () => null,
      enableSorting: false,
      cell: ({ row }) => (
        <Checkbox
          checked={isSelected?.(row.original) ?? false}
          onCheckedChange={() => onToggleSelect?.(row.original)}
          aria-label={`Select ${row.original.name}`}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />
      ),
      meta: { interactive: true, exportDisabled: true } satisfies DataTableColumnMeta,
    };
    return [selectCol, ...DATA_COLUMNS];
  }, [hasSelection, isSelected, onToggleSelect]);

  const selectAllHeader = hasSelection ? (
    <div className="px-4 py-2 border-b border-border/30 bg-muted/20 flex items-center gap-2">
      <Checkbox
        checked={isAllSelected ?? false}
        onCheckedChange={() => onToggleAll?.()}
        aria-label="Select all shows"
      />
      <span className="text-xs text-muted-foreground">Select all</span>
    </div>
  ) : null;

  return (
    <div>
      {selectAllHeader}
      <DataTable<EnhancedShow>
        tableId="showsBrowse"
        data={shows}
        columns={columns}
        defaultColumnVisibility={DEFAULT_COLUMN_VISIBILITY}
        // Page-level ListControls owns search; table keeps only its Columns control.
        showSearch={false}
        getRowId={show => show.id}
        onRowClick={show => navigate(`/shows/${show.id}`)}
      />
    </div>
  );
};

export default ShowsTableView;
