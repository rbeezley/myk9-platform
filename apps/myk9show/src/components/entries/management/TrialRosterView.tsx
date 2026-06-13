import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { CheckInStatusBadge } from '@/components/common/CheckInStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { CheckInStatus } from '@myk9/core';

export interface RosterEntry {
  id: string;
  armband: string | null;
  dogName: string;
  breed: string | null;
  handlerName: string;
  className: string;
  classId: string;
  isScored: boolean;
  checkInStatus: string | null;
}

export interface TrialRosterViewProps {
  entries: RosterEntry[];
  onClassClick: (classId: string) => void;
  isLoading?: boolean;
}

interface ClassGroup {
  classId: string;
  className: string;
  entries: RosterEntry[];
  scoredCount: number;
}

const columns: ColumnDef<RosterEntry, unknown>[] = [
  {
    accessorKey: 'armband',
    header: 'Armband',
    cell: ({ row }) => <ArmbandBadge armband={row.original.armband} />,
  },
  {
    accessorKey: 'dogName',
    header: 'Dog',
    cell: ({ row }) => (
      <div>
        <span className="font-bold">{row.original.dogName}</span>
        {row.original.breed && (
          <span className="block text-sm text-muted-foreground">{row.original.breed}</span>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'handlerName',
    header: 'Handler',
  },
  {
    accessorKey: 'checkInStatus',
    header: 'Check-In',
    cell: ({ row }) => {
      const status = row.original.checkInStatus;
      if (!status) return <span className="text-muted-foreground">--</span>;
      return <CheckInStatusBadge status={status as CheckInStatus} />;
    },
  },
  {
    accessorKey: 'isScored',
    header: 'Scoring',
    cell: ({ row }) =>
      row.original.isScored ? (
        <Badge className="bg-green-700 text-white hover:bg-green-700">Scored</Badge>
      ) : (
        <Badge variant="secondary">Pending</Badge>
      ),
  },
];

export function TrialRosterView({ entries, onClassClick, isLoading }: TrialRosterViewProps) {
  const groups = useMemo<ClassGroup[]>(() => {
    const map = new Map<string, ClassGroup>();
    for (const entry of entries) {
      let group = map.get(entry.classId);
      if (!group) {
        group = {
          classId: entry.classId,
          className: entry.className,
          entries: [],
          scoredCount: 0,
        };
        map.set(entry.classId, group);
      }
      group.entries.push(entry);
      if (entry.isScored) group.scoredCount++;
    }
    return Array.from(map.values());
  }, [entries]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        No entries for this trial.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.classId}>
          <div className="flex items-center gap-3 mb-2">
            <button
              type="button"
              className="text-primary hover:underline cursor-pointer font-semibold text-lg"
              onClick={() => onClassClick(group.classId)}
            >
              {group.className}
            </button>
            <Badge variant="secondary">
              {group.scoredCount}/{group.entries.length} scored
            </Badge>
          </div>
          <DataTable
            columns={columns}
            data={group.entries}
            getRowId={(row) => row.id}
            pageSize={50}
          />
        </section>
      ))}
    </div>
  );
}
