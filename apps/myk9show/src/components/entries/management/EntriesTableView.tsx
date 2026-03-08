import React from 'react';
import { Badge } from '@/components/ui/badge';
import { SortableTable, type ColumnDef } from '@/components/common/SortableTable';
import { getEntryStatusBadge, getPaymentStatusBadge } from '@/utils/entryManagementUtils';
import type { EntryManagementEntry } from '@/types/entry-management-types';

interface EntriesTableViewProps {
  entries: EntryManagementEntry[];
  onEntryClick?: (entry: EntryManagementEntry) => void;
}

const COLUMNS: ColumnDef<EntryManagementEntry>[] = [
  {
    key: 'dogName',
    label: 'Dog Name',
    className: 'w-[180px]',
    getValue: entry => (entry.dogName || '').toLowerCase(),
  },
  {
    key: 'handlerName',
    label: 'Handler',
    className: 'w-[160px]',
    getValue: entry => (entry.handlerName || '').toLowerCase(),
  },
  {
    key: 'classes',
    label: 'Classes',
    className: 'w-[120px]',
    getValue: entry => String(entry.classes.length).padStart(5, '0'),
  },
  {
    key: 'armbandNumber',
    label: 'Armband #',
    className: 'w-[100px]',
    getValue: entry => (entry.armbandNumber || '').toLowerCase(),
  },
  {
    key: 'entryStatus',
    label: 'Status',
    className: 'w-[120px]',
    getValue: entry => (entry.entryStatus || '').toLowerCase(),
  },
  {
    key: 'submittedAt',
    label: 'Date',
    className: 'w-[120px]',
    getValue: entry => (entry.submittedAt ? entry.submittedAt.toISOString() : ''),
  },
];

function renderCell(entry: EntryManagementEntry, column: ColumnDef<EntryManagementEntry>) {
  switch (column.key) {
    case 'dogName':
      return (
        <td className="px-4 py-3">
          <div className="min-w-0">
            <div className="font-medium truncate">{entry.dogName}</div>
            <div className="text-xs text-muted-foreground truncate">{entry.entryNumber}</div>
          </div>
        </td>
      );
    case 'handlerName':
      return (
        <td className="px-4 py-3 text-muted-foreground truncate">
          {entry.handlerName || '\u2014'}
        </td>
      );
    case 'classes':
      return (
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {entry.classes.length > 0 ? (
              <>
                {entry.classes.slice(0, 2).map(cls => (
                  <Badge key={cls.id} variant="secondary" className="text-xs">
                    {cls.name}
                  </Badge>
                ))}
                {entry.classes.length > 2 && (
                  <Badge variant="secondary" className="text-xs">
                    +{entry.classes.length - 2}
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{'\u2014'}</span>
            )}
          </div>
        </td>
      );
    case 'armbandNumber':
      return (
        <td className="px-4 py-3">
          {entry.armbandNumber ? (
            <Badge variant="outline" className="text-xs">
              {entry.armbandNumber}
            </Badge>
          ) : (
            <span className="text-muted-foreground">{'\u2014'}</span>
          )}
        </td>
      );
    case 'entryStatus':
      return (
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {getEntryStatusBadge(entry.entryStatus)}
            {getPaymentStatusBadge(entry.paymentStatus)}
          </div>
        </td>
      );
    case 'submittedAt':
      return (
        <td className="px-4 py-3 text-muted-foreground">
          {entry.submittedAt
            ? new Date(entry.submittedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            : '\u2014'}
        </td>
      );
    default:
      return <td className="px-4 py-3" />;
  }
}

export const EntriesTableView: React.FC<EntriesTableViewProps> = ({ entries, onEntryClick }) => {
  return (
    <SortableTable<EntryManagementEntry>
      items={entries}
      columns={COLUMNS}
      defaultSortColumn="dogName"
      getRowKey={entry => entry.id}
      onRowClick={onEntryClick}
      renderCell={renderCell}
    />
  );
};

export default EntriesTableView;
