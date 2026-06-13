import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/data-table';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';

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
        <Badge
          variant="secondary"
          className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
        >
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
        <Badge variant="secondary" className="text-xs bg-info/10 text-info ">
          {status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : 'Active'}
        </Badge>
      );
  }
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  if (startDate === endDate) return start;
  const end = new Date(endDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${start} - ${end}`;
}

const DATA_COLUMNS: ColumnDef<EnhancedShow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    accessorFn: show => (show.name ?? '').toLowerCase(),
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="font-medium truncate">{row.original.name}</div>
        {row.original.events.length > 0 && (
          <div className="text-xs text-muted-foreground truncate">
            {row.original.events.join(', ')}
          </div>
        )}
      </div>
    ),
  },
  {
    id: 'dateRange',
    header: 'Dates',
    accessorFn: show => show.startDate ?? '',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.startDate
          ? formatDateRange(row.original.startDate, row.original.endDate)
          : '\u2014'}
      </span>
    ),
  },
  {
    accessorKey: 'location',
    header: 'Location',
    accessorFn: show => (show.location ?? '').toLowerCase(),
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">{row.original.location || '\u2014'}</span>
    ),
  },
  {
    accessorKey: 'organization',
    header: 'Organization',
    accessorFn: show => (show.organization ?? '').toLowerCase(),
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
    cell: ({ row }) => getStatusBadge(row.original.status),
  },
  {
    accessorKey: 'clubName',
    header: 'Host Club',
    accessorFn: show => (show.clubName ?? '').toLowerCase(),
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
        getRowId={show => show.id}
        onRowClick={show => navigate(`/shows/${show.id}`)}
      />
    </div>
  );
};

export default ShowsTableView;
