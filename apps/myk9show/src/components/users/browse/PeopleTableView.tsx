import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { type ColumnDef } from '@tanstack/react-table';
import type { User } from '@/types/user-types';
import { DataTable } from '@/components/ui/data-table';

interface PeopleTableViewProps {
  people: User[];
}

function getFullName(user: User): string {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
}

function getLocation(user: User): string {
  const parts = [user.city, user.state].filter(Boolean);
  return parts.join(', ');
}

function getRoleBadges(roles: string[] | undefined) {
  if (!roles || roles.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.slice(0, 3).map(role => (
        <Badge key={role} variant="secondary" className="text-xs">
          {role.charAt(0).toUpperCase() + role.slice(1)}
        </Badge>
      ))}
      {roles.length > 3 && (
        <Badge variant="secondary" className="text-xs">
          +{roles.length - 3}
        </Badge>
      )}
    </div>
  );
}

const columns: ColumnDef<User>[] = [
  {
    id: 'name',
    accessorFn: user => getFullName(user),
    header: 'Name',
    cell: ({ row }) => {
      const person = row.original;
      return (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {(person.firstName || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{getFullName(person)}</div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">{row.original.email || '—'}</span>
    ),
  },
  {
    id: 'roles',
    accessorFn: user => (user.roles || []).join(','),
    header: 'Roles',
    cell: ({ row }) => getRoleBadges(row.original.roles),
  },
  {
    id: 'location',
    accessorFn: user => getLocation(user),
    header: 'Location',
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">{getLocation(row.original) || '—'}</span>
    ),
  },
];

export const PeopleTableView: React.FC<PeopleTableViewProps> = ({ people }) => {
  const navigate = useNavigate();

  return (
    <DataTable
      tableId="peopleBrowse"
      columns={columns}
      data={people}
      onRowClick={person => navigate(`/people/${person.id}`)}
      getRowId={person => person.id}
    />
  );
};

export default PeopleTableView;
