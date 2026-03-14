/**
 * UserTableHeader - Sortable column headers for UserTable
 */

import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

import type { SortField, SortDirection } from './types';

interface UserTableHeaderProps {
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: (selected: boolean) => void;
}

export const UserTableHeader: React.FC<UserTableHeaderProps> = ({
  sortField,
  sortDirection,
  onSort,
  allSelected,
  someSelected,
  onSelectAll,
}) => {
  const renderSortIcon = (field: SortField) => {
    const isActive = sortField === field;
    const iconClass = `h-4 w-4 transition-all duration-300 ${
      isActive ? 'text-primary opacity-100' : 'text-muted-foreground opacity-40'
    }`;

    if (!isActive) {
      return <ChevronDown className={iconClass} />;
    }

    return sortDirection === 'asc' ? (
      <ChevronUp className={`${iconClass} transform rotate-0`} />
    ) : (
      <ChevronDown className={`${iconClass} transform rotate-0`} />
    );
  };

  const sortButtonClass =
    'group h-auto p-0 font-[650] text-sm text-muted-foreground transition-all duration-300 uppercase tracking-[0.04em] flex items-center gap-2';

  return (
    <TableHeader className="myk9-table-header">
      <TableRow className="myk9-table-header-row">
        {/* Select All Checkbox */}
        <TableHead className="myk9-table-header-cell w-16">
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={e => onSelectAll(e.target.checked)}
            className="h-4 w-4 rounded border-gray-400 accent-blue-500 cursor-pointer"
          />
        </TableHead>

        {/* User Column */}
        <TableHead className="myk9-table-header-cell">
          <Button variant="ghost" className={sortButtonClass} onClick={() => onSort('name')}>
            User
            {renderSortIcon('name')}
          </Button>
        </TableHead>

        {/* Contact Column */}
        <TableHead className="myk9-table-header-cell">
          <Button variant="ghost" className={sortButtonClass} onClick={() => onSort('email')}>
            Contact
            {renderSortIcon('email')}
          </Button>
        </TableHead>

        {/* Roles Column */}
        <TableHead className="myk9-table-header-cell">
          <Button variant="ghost" className={sortButtonClass} onClick={() => onSort('role')}>
            Roles
            {renderSortIcon('role')}
          </Button>
        </TableHead>

        {/* Last Login Column */}
        <TableHead className="myk9-table-header-cell">
          <Button variant="ghost" className={sortButtonClass} onClick={() => onSort('lastLogin')}>
            Last Login
            {renderSortIcon('lastLogin')}
          </Button>
        </TableHead>

        {/* Status Column */}
        <TableHead className="myk9-table-header-cell">
          <span className="font-[650] text-sm text-muted-foreground uppercase tracking-[0.04em]">
            Status
          </span>
        </TableHead>

        {/* Actions Column */}
        <TableHead className="myk9-table-header-cell w-16 text-center">
          <span className="font-[650] text-sm text-muted-foreground uppercase tracking-[0.04em]">
            Actions
          </span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
};
