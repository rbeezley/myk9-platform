import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { type ColumnDef } from '@tanstack/react-table';
import { getDogDisplayName, type Dog, type DogStatus } from '@/types/dog-types';
import { DataTable } from '@/components/ui/data-table';

interface DogsTableViewProps {
  dogs: Dog[];
}

function getStatusBadge(status: DogStatus | undefined) {
  switch (status) {
    case 'retired':
      return (
        <Badge variant="secondary" className="text-xs bg-warning/10 text-warning ">
          Retired
        </Badge>
      );
    case 'deceased':
      return (
        <Badge
          variant="secondary"
          className="text-xs bg-gray-100 text-gray-500 dark:bg-gray-800/30 dark:text-gray-400"
        >
          Deceased
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-xs bg-success/10 text-success ">
          Active
        </Badge>
      );
  }
}

function getSexBadge(sex: string | undefined) {
  if (!sex) return null;
  const label = sex.charAt(0).toUpperCase() + sex.slice(1);
  return (
    <Badge
      variant="secondary"
      className={`text-xs ${sex === 'male' ? 'bg-info/10 text-info ' : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'}`}
    >
      {label}
    </Badge>
  );
}

const columns: ColumnDef<Dog>[] = [
  {
    id: 'name',
    accessorFn: dog => getDogDisplayName(dog),
    header: 'Name',
    cell: ({ row }) => {
      const dog = row.original;
      return (
        <div className="flex items-center gap-2.5">
          {dog.imageUrl ? (
            <img
              src={dog.imageUrl}
              alt={dog.callName || dog.name}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {(getDogDisplayName(dog) || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium truncate">{getDogDisplayName(dog)}</div>
            {dog.callName && dog.name && dog.callName !== dog.name && (
              <div className="text-xs text-muted-foreground truncate">{dog.name}</div>
            )}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'breed',
    header: 'Breed',
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">{row.original.breed || '—'}</span>
    ),
  },
  {
    accessorKey: 'sex',
    header: 'Sex',
    cell: ({ row }) => getSexBadge(row.original.sex),
  },
  {
    id: 'owner',
    accessorFn: dog => dog.ownerName || '',
    header: 'Owner',
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">{row.original.ownerName || '—'}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => getStatusBadge(row.original.status),
  },
];

export const DogsTableView: React.FC<DogsTableViewProps> = ({ dogs }) => {
  const navigate = useNavigate();

  return (
    <DataTable
      tableId="dogsBrowse"
      columns={columns}
      data={dogs}
      onRowClick={dog => navigate(`/dogs/${dog.id}`)}
      getRowId={dog => dog.id}
    />
  );
};

export default DogsTableView;
