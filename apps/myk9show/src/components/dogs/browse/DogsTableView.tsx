import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { getDogDisplayName, type Dog } from '@/types/dog-types';

type SortColumn = 'name' | 'breed' | 'sex' | 'owner' | 'status';
type SortDirection = 'asc' | 'desc';

interface DogsTableViewProps {
  dogs: Dog[];
}

function getStatusBadge(status: string | undefined) {
  switch (status) {
    case 'retired':
      return (
        <Badge
          variant="secondary"
          className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        >
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
        <Badge
          variant="secondary"
          className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
        >
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
      className={`text-xs ${sex === 'male' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'}`}
    >
      {label}
    </Badge>
  );
}

const COLUMNS: { key: SortColumn; label: string; className: string }[] = [
  { key: 'name', label: 'Name', className: 'w-[200px]' },
  { key: 'breed', label: 'Breed', className: 'w-[180px]' },
  { key: 'sex', label: 'Sex', className: 'w-[100px]' },
  { key: 'owner', label: 'Owner', className: 'w-[180px]' },
  { key: 'status', label: 'Status', className: 'w-[100px]' },
];

export const DogsTableView: React.FC<DogsTableViewProps> = ({ dogs }) => {
  const navigate = useNavigate();
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedDogs = useMemo(() => {
    return [...dogs].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      const getValue = (dog: Dog): string => {
        switch (sortColumn) {
          case 'name':
            return getDogDisplayName(dog).toLowerCase();
          case 'breed':
            return (dog.breed || '').toLowerCase();
          case 'sex':
            return (dog.sex || '').toLowerCase();
          case 'owner':
            return (dog.ownerName || '').toLowerCase();
          case 'status':
            return (dog.status || 'active').toLowerCase();
        }
      };
      return getValue(a).localeCompare(getValue(b)) * dir;
    });
  }, [dogs, sortColumn, sortDirection]);

  return (
    <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-medium text-muted-foreground ${col.className}`}
                >
                  <button
                    type="button"
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortColumn === col.key ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedDogs.map(dog => (
              <tr
                key={dog.id}
                className="border-b border-border/30 hover:bg-muted/20 cursor-pointer transition-colors"
                onClick={() => navigate(`/dogs/${dog.id}`)}
              >
                <td className="px-4 py-3">
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
                </td>
                <td className="px-4 py-3 text-muted-foreground truncate">{dog.breed || '—'}</td>
                <td className="px-4 py-3">{getSexBadge(dog.sex)}</td>
                <td className="px-4 py-3 text-muted-foreground truncate">{dog.ownerName || '—'}</td>
                <td className="px-4 py-3">{getStatusBadge(dog.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DogsTableView;
