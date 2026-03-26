import React, { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { getEntryStatusBadge, getPaymentStatusBadge } from '@/utils/entryManagementUtils';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EmailStatusIcon } from '@/components/entries/EmailStatusIcon';
import type { EmailLogEntry } from '@/hooks/useEmailStatus';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';

interface EntriesTableViewProps {
  entries: EntryManagementEntry[];
  onEntryClick?: (entry: EntryManagementEntry) => void;
  emailStatusMap?: Record<string, EmailLogEntry> | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
}

function buildColumns(
  emailStatusMap?: Record<string, EmailLogEntry>,
  onResendEmail?: (registrationId: string) => void,
  isResendDisabled?: (registrationId: string) => boolean
): ColumnDef<EntryManagementEntry, unknown>[] {
  return [
    {
      accessorKey: 'dogName',
      header: 'Dog Name',
      accessorFn: entry => (entry.dogName ?? '').toLowerCase(),
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium truncate">{row.original.dogName}</div>
          <div className="text-xs text-muted-foreground truncate">{row.original.entryNumber}</div>
        </div>
      ),
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
    },
    {
      accessorKey: 'armbandNumber',
      header: 'Armband #',
      accessorFn: entry => (entry.armbandNumber ?? '').toLowerCase(),
      cell: ({ row }) => <ArmbandBadge armband={row.original.armbandNumber} />,
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
    },
  ];
}

export const EntriesTableView: React.FC<EntriesTableViewProps> = ({
  entries,
  onEntryClick,
  emailStatusMap,
  onResendEmail,
  isResendDisabled,
}) => {
  const columns = useMemo(
    () => buildColumns(emailStatusMap, onResendEmail, isResendDisabled),
    [emailStatusMap, onResendEmail, isResendDisabled]
  );

  return (
    <DataTable<EntryManagementEntry>
      tableId="entriesManagement"
      data={entries}
      columns={columns}
      getRowId={entry => entry.id}
      {...(onEntryClick !== undefined ? { onRowClick: onEntryClick } : {})}
    />
  );
};

export default EntriesTableView;
