import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { getClubInitials } from '@/components/clubs/ClubDetails/utils';
import { getClubLocation, getClubTypeLabel } from './clubsExport';
import type { Club } from '@/types/club-types';

interface ClubsListViewProps {
  clubs: Club[];
  clubShowCounts: Map<string, number>;
}

interface ClubTableRow extends Club {
  upcomingShowCount: number;
  memberCount: number;
  typeLabel: string | null;
  location: string;
}

export const ClubsListView: React.FC<ClubsListViewProps> = ({ clubs, clubShowCounts }) => {
  const navigate = useNavigate();

  const rows = React.useMemo<ClubTableRow[]>(
    () =>
      clubs.map(club => ({
        ...club,
        upcomingShowCount: clubShowCounts.get(club.id) || 0,
        memberCount: club.memberIds?.length || 0,
        typeLabel: getClubTypeLabel(club.clubType),
        location: getClubLocation(club),
      })),
    [clubs, clubShowCounts]
  );

  const columns = React.useMemo<ColumnDef<ClubTableRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: club => club.name,
        header: 'Club',
        cell: ({ row }) => {
          const club = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              {club.logo ? (
                <img
                  src={club.logo}
                  alt={club.name}
                  className="h-8 w-8 flex-shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                  {getClubInitials(club.name)}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-medium">{club.name}</div>
                {club.description && (
                  <div className="truncate text-xs text-muted-foreground">{club.description}</div>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: 'typeLabel',
        accessorFn: club => club.typeLabel || '',
        header: 'Type',
        meta: {
          responsiveHide: 'md',
        },
        cell: ({ row }) =>
          row.original.typeLabel ? (
            <Badge variant="secondary" className="text-xs">
              {row.original.typeLabel}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: 'location',
        header: 'Location',
        meta: {},
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.location || '—'}</span>
        ),
      },
      {
        accessorKey: 'memberCount',
        header: 'Members',
        meta: {
          responsiveHide: 'lg',
        },
        cell: ({ row }) => <span>{row.original.memberCount}</span>,
      },
      {
        accessorKey: 'upcomingShowCount',
        header: 'Upcoming Shows',
        meta: {},
        cell: ({ row }) => <span>{row.original.upcomingShowCount}</span>,
      },
    ],
    []
  );

  return (
    <div data-testid="clubs-list">
      <DataTable
        tableId="clubsBrowse"
        columns={columns}
        data={rows}
        onRowClick={club => navigate(`/clubs/${club.id}`)}
        getRowId={club => club.id}
      />
    </div>
  );
};

export default ClubsListView;
