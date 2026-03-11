import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SortableTable, type ColumnDef } from '@/components/common/SortableTable';
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
        <Badge
          variant="secondary"
          className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
        >
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
        <Badge
          variant="secondary"
          className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
        >
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

const DATA_COLUMNS: ColumnDef<EnhancedShow>[] = [
  {
    key: 'name',
    label: 'Name',
    className: 'w-[220px]',
    getValue: show => (show.name || '').toLowerCase(),
  },
  {
    key: 'dateRange',
    label: 'Dates',
    className: 'w-[180px]',
    getValue: show => show.startDate || '',
  },
  {
    key: 'location',
    label: 'Location',
    className: 'w-[180px]',
    getValue: show => (show.location || '').toLowerCase(),
  },
  {
    key: 'organization',
    label: 'Organization',
    className: 'w-[140px]',
    getValue: show => (show.organization || '').toLowerCase(),
  },
  {
    key: 'status',
    label: 'Status',
    className: 'w-[120px]',
    getValue: show => (show.status || '').toLowerCase(),
  },
  {
    key: 'clubName',
    label: 'Host Club',
    className: 'w-[160px]',
    getValue: show => (show.clubName || '').toLowerCase(),
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

  // Prepend a "select" column when selection is enabled
  const columns = useMemo(() => {
    if (!hasSelection) return DATA_COLUMNS;
    const selectCol: ColumnDef<EnhancedShow> = {
      key: '_select',
      label: '',
      className: 'w-[48px]',
      getValue: show => (isSelected?.(show) ? '1' : '0'),
    };
    return [selectCol, ...DATA_COLUMNS];
  }, [hasSelection, isSelected]);

  const renderCell = (show: EnhancedShow, column: ColumnDef<EnhancedShow>) => {
    switch (column.key) {
      case '_select':
        return (
          <td className="px-4 py-3">
            <Checkbox
              checked={isSelected?.(show) ?? false}
              onCheckedChange={() => onToggleSelect?.(show)}
              aria-label={`Select ${show.name}`}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            />
          </td>
        );
      case 'name':
        return (
          <td className="px-4 py-3">
            <div className="min-w-0">
              <div className="font-medium truncate">{show.name}</div>
              {show.events.length > 0 && (
                <div className="text-xs text-muted-foreground truncate">
                  {show.events.join(', ')}
                </div>
              )}
            </div>
          </td>
        );
      case 'dateRange':
        return (
          <td className="px-4 py-3 text-muted-foreground">
            {show.startDate ? formatDateRange(show.startDate, show.endDate) : '\u2014'}
          </td>
        );
      case 'location':
        return (
          <td className="px-4 py-3 text-muted-foreground truncate">{show.location || '\u2014'}</td>
        );
      case 'organization':
        return (
          <td className="px-4 py-3 text-muted-foreground truncate">
            {show.organization || '\u2014'}
          </td>
        );
      case 'status':
        return <td className="px-4 py-3">{getStatusBadge(show.status)}</td>;
      case 'clubName':
        return (
          <td className="px-4 py-3 text-muted-foreground truncate">{show.clubName || '\u2014'}</td>
        );
      default:
        return <td className="px-4 py-3" />;
    }
  };

  // Render a select-all header for the table when selection is active
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
      <SortableTable<EnhancedShow>
        items={shows}
        columns={columns}
        defaultSortColumn="name"
        getRowKey={show => show.id}
        onRowClick={show => navigate(`/shows/${show.id}`)}
        renderCell={renderCell}
      />
    </div>
  );
};

export default ShowsTableView;
