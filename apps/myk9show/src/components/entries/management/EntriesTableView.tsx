import React, { useMemo } from 'react';
import { type ColumnDef, type DisplayColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import { getEntryStatusBadge, getPaymentStatusBadge } from '@/utils/entryManagementUtils';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EmailStatusIcon } from '@/components/entries/EmailStatusIcon';
import type { EmailLogEntry } from '@/hooks/useEmailStatus';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { EntryStatus } from '@/types/show-registration-types';
import { EntryRowActionMenu, type EntryRowActionMenuProps } from './EntryRowActionMenu';

/** Minimal selection surface (a subset of useBulkSelection) for the select column. */
export interface EntriesTableSelection {
  isSelected: (entry: EntryManagementEntry) => boolean;
  toggleItem: (entry: EntryManagementEntry) => void;
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  toggleAll: () => void;
}

interface EntriesTableViewProps {
  entries: EntryManagementEntry[];
  onEntryClick?: (entry: EntryManagementEntry) => void;
  emailStatusMap?: Record<string, EmailLogEntry> | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
  onStatusChange?: ((entryId: string, status: EntryStatus) => void) | undefined;
  onCheckInEntry?: ((entryId: string) => void) | undefined;
  onOpenArmbandDialog?: ((entry: EntryManagementEntry) => void) | undefined;
  onOpenCompDialog?: ((entry: EntryManagementEntry) => void) | undefined;
  onUncompEntry?: ((entryId: string) => void) | undefined;
  onRemoveEntry?: ((entryId: string) => void) | undefined;
  /** When provided, renders a leading checkbox select column wired to this selection. */
  selection?: EntriesTableSelection | undefined;
  emptyState?: React.ReactNode;
}

function buildSelectColumn(
  selection: EntriesTableSelection
): DisplayColumnDef<EntryManagementEntry, unknown> {
  return {
    id: '_select',
    header: () => (
      <Checkbox
        checked={selection.isAllSelected}
        indeterminate={selection.isPartiallySelected}
        onCheckedChange={() => selection.toggleAll()}
        aria-label="Select all entries"
      />
    ),
    cell: ({ row }) => (
      <span className="flex items-center" onClick={e => e.stopPropagation()} role="presentation">
        <Checkbox
          checked={selection.isSelected(row.original)}
          onCheckedChange={() => selection.toggleItem(row.original)}
          aria-label={`Select ${row.original.dogName}`}
        />
      </span>
    ),
    enableSorting: false,
    enableHiding: false,
  };
}

function buildColumns(
  emailStatusMap?: Record<string, EmailLogEntry>,
  onResendEmail?: (registrationId: string) => void,
  isResendDisabled?: (registrationId: string) => boolean,
  actionHandlers?: Omit<EntryRowActionMenuProps, 'entry'> | undefined
): ColumnDef<EntryManagementEntry, unknown>[] {
  const columns: ColumnDef<EntryManagementEntry, unknown>[] = [
    {
      accessorKey: 'armbandNumber',
      header: 'Armband',
      accessorFn: entry => (entry.armbandNumber ?? '').toLowerCase(),
      cell: ({ row }) => <ArmbandBadge armband={row.original.armbandNumber} />,
      meta: {
        exportValue: row => (row as EntryManagementEntry).armbandNumber ?? '',
      } satisfies DataTableColumnMeta,
    },
    {
      accessorKey: 'dogName',
      header: 'Dog',
      accessorFn: entry => (entry.dogName ?? '').toLowerCase(),
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium truncate">{row.original.dogName}</div>
          <div className="text-xs text-muted-foreground truncate">{row.original.entryNumber}</div>
        </div>
      ),
      meta: {
        exportValue: row => (row as EntryManagementEntry).dogName,
      } satisfies DataTableColumnMeta,
    },
    {
      accessorKey: 'handlerName',
      header: 'Handler',
      accessorFn: entry => (entry.handlerName ?? '').toLowerCase(),
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate">
          {row.original.handlerName || '\u2014'}
        </span>
      ),
      meta: {
        exportValue: row => (row as EntryManagementEntry).handlerName || '',
      } satisfies DataTableColumnMeta,
    },
    {
      accessorKey: 'classes',
      header: 'Classes',
      accessorFn: entry => entry.classes.length,
      sortingFn: 'basic',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.classes.length > 0 ? (
            <>
              {row.original.classes.slice(0, 2).map(cls => (
                <Badge key={cls.id} variant="secondary" className="text-xs">
                  {cls.name}
                </Badge>
              ))}
              {row.original.classes.length > 2 && (
                <Badge variant="secondary" className="text-xs">
                  +{row.original.classes.length - 2}
                </Badge>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">{'\u2014'}</span>
          )}
        </div>
      ),
      meta: {
        exportValue: row => (row as EntryManagementEntry).classes.map(cls => cls.name).join('; '),
      } satisfies DataTableColumnMeta,
    },
    {
      accessorKey: 'entryStatus',
      header: 'Status',
      accessorFn: entry => (entry.entryStatus ?? '').toLowerCase(),
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {getEntryStatusBadge(row.original.entryStatus)}
          {getPaymentStatusBadge(row.original.paymentStatus)}
          {emailStatusMap && (
            <EmailStatusIcon
              status={emailStatusMap[row.original.registrationId]?.status}
              errorMessage={emailStatusMap[row.original.registrationId]?.error_message}
              onResend={
                onResendEmail ? () => onResendEmail(row.original.registrationId) : undefined
              }
              resendDisabled={isResendDisabled?.(row.original.registrationId)}
            />
          )}
        </div>
      ),
      meta: {
        exportValue: row => {
          const entry = row as EntryManagementEntry;
          const emailStatus = emailStatusMap?.[entry.registrationId]?.status;
          return [entry.entryStatus, entry.paymentStatus, emailStatus && `Email: ${emailStatus}`]
            .filter(Boolean)
            .join(' / ');
        },
      } satisfies DataTableColumnMeta,
    },
    {
      accessorKey: 'submittedAt',
      header: 'Date',
      accessorFn: entry => (entry.submittedAt ? entry.submittedAt.toISOString() : ''),
      sortingFn: 'datetime',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.submittedAt
            ? new Date(row.original.submittedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            : '\u2014'}
        </span>
      ),
      meta: {
        exportValue: row => (row as EntryManagementEntry).submittedAt?.toISOString() ?? '',
      } satisfies DataTableColumnMeta,
    },
  ];

  if (actionHandlers) {
    columns.push({
      id: '_actions',
      header: '',
      cell: ({ row }) => (
        <span onClick={e => e.stopPropagation()} role="presentation">
          <EntryRowActionMenu entry={row.original} {...actionHandlers} />
        </span>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { exportDisabled: true } satisfies DataTableColumnMeta,
    });
  }

  return columns;
}

export const EntriesTableView: React.FC<EntriesTableViewProps> = ({
  entries,
  onEntryClick,
  emailStatusMap,
  onResendEmail,
  isResendDisabled,
  onStatusChange,
  onCheckInEntry,
  onOpenArmbandDialog,
  onOpenCompDialog,
  onUncompEntry,
  onRemoveEntry,
  selection,
  emptyState,
}) => {
  const columns = useMemo(() => {
    const hasAnyAction =
      onStatusChange ||
      onCheckInEntry ||
      onOpenArmbandDialog ||
      onOpenCompDialog ||
      onUncompEntry ||
      onRemoveEntry ||
      onResendEmail;
    const actionHandlers = hasAnyAction
      ? {
          ...(onStatusChange ? { onStatusChange } : {}),
          ...(onCheckInEntry ? { onCheckInEntry } : {}),
          ...(onOpenArmbandDialog ? { onOpenArmbandDialog } : {}),
          ...(onOpenCompDialog ? { onOpenCompDialog } : {}),
          ...(onUncompEntry ? { onUncompEntry } : {}),
          ...(onRemoveEntry ? { onRemoveEntry } : {}),
          ...(onResendEmail ? { onResendEmail } : {}),
          ...(isResendDisabled ? { isResendDisabled } : {}),
        }
      : undefined;
    const dataColumns = buildColumns(
      emailStatusMap,
      onResendEmail,
      isResendDisabled,
      actionHandlers
    );
    return selection ? [buildSelectColumn(selection), ...dataColumns] : dataColumns;
  }, [
    emailStatusMap,
    onResendEmail,
    isResendDisabled,
    onStatusChange,
    onCheckInEntry,
    onOpenArmbandDialog,
    onOpenCompDialog,
    onUncompEntry,
    onRemoveEntry,
    selection,
  ]);

  return (
    <DataTable<EntryManagementEntry>
      tableId="entriesManagement"
      data={entries}
      columns={columns}
      getRowId={entry => entry.id}
      showSearch={false}
      emptyState={emptyState}
      noResultsMessage={emptyState}
      {...(onEntryClick !== undefined ? { onRowClick: onEntryClick } : {})}
    />
  );
};

export default EntriesTableView;
