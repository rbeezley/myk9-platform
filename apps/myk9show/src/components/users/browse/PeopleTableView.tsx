import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { User } from '@/types/user-types';

type SortColumn = 'name' | 'email' | 'roles' | 'location';
type SortDirection = 'asc' | 'desc';

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

const COLUMNS: { key: SortColumn; label: string; className: string }[] = [
  { key: 'name', label: 'Name', className: 'w-[220px]' },
  { key: 'email', label: 'Email', className: 'w-[220px]' },
  { key: 'roles', label: 'Roles', className: 'w-[200px]' },
  { key: 'location', label: 'Location', className: 'w-[180px]' },
];

export const PeopleTableView: React.FC<PeopleTableViewProps> = ({ people }) => {
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

  const sortedPeople = useMemo(() => {
    const getValue = (user: User): string => {
      switch (sortColumn) {
        case 'name':
          return getFullName(user).toLowerCase();
        case 'email':
          return (user.email || '').toLowerCase();
        case 'roles':
          return (user.roles || []).join(',').toLowerCase();
        case 'location':
          return getLocation(user).toLowerCase();
      }
    };
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...people].sort((a, b) => getValue(a).localeCompare(getValue(b)) * dir);
  }, [people, sortColumn, sortDirection]);

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
            {sortedPeople.map(person => (
              <tr
                key={person.id}
                className="border-b border-border/30 hover:bg-muted/20 cursor-pointer transition-colors"
                onClick={() => navigate(`/people/${person.id}`)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {(person.firstName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{getFullName(person)}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground truncate">{person.email || '—'}</td>
                <td className="px-4 py-3">{getRoleBadges(person.roles)}</td>
                <td className="px-4 py-3 text-muted-foreground truncate">
                  {getLocation(person) || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PeopleTableView;
