import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getClassStatusBadgeClasses } from '@myk9/core';
import { SortableTable, type ColumnDef } from '@/components/common/SortableTable';
import type { TrialClass } from '@/components/trials/types/trial.types';
import { shouldShowSection } from './ClassDetailsMain.helpers';

interface ClassesTableViewProps {
  classes: TrialClass[];
}

const COLUMNS: ColumnDef<TrialClass>[] = [
  {
    key: 'element',
    label: 'Class',
    className: 'w-[200px]',
    getValue: cls => (cls.element || '').toLowerCase(),
  },
  {
    key: 'level',
    label: 'Level',
    className: 'w-[140px]',
    getValue: cls => (cls.level || '').toLowerCase(),
  },
  {
    key: 'judgeName',
    label: 'Judge',
    className: 'w-[160px]',
    getValue: cls => (cls.judgeName || 'TBD').toLowerCase(),
  },
  {
    key: 'entries',
    label: 'Entries',
    className: 'w-[100px]',
    getValue: cls => String(cls.entries).padStart(5, '0'),
  },
  {
    key: 'status',
    label: 'Status',
    className: 'w-[120px]',
    getValue: cls => (cls.status || '').toLowerCase(),
  },
];

function renderCell(cls: TrialClass, column: ColumnDef<TrialClass>) {
  switch (column.key) {
    case 'element':
      return (
        <td className="px-4 py-3">
          <div className="min-w-0">
            <div className="font-medium truncate">{cls.element}</div>
            {shouldShowSection(cls) && (
              <div className="text-xs text-muted-foreground truncate">Section {cls.section}</div>
            )}
          </div>
        </td>
      );
    case 'level':
      return <td className="px-4 py-3 text-muted-foreground truncate">{cls.level || '\u2014'}</td>;
    case 'judgeName':
      return <td className="px-4 py-3 text-muted-foreground truncate">{cls.judgeName || 'TBD'}</td>;
    case 'entries':
      return (
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <span>{cls.completedEntries ?? 0}</span>
            <span className="text-muted-foreground">/</span>
            <span>{cls.entries}</span>
          </div>
        </td>
      );
    case 'status':
      return (
        <td className="px-4 py-3">
          <span
            className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${getClassStatusBadgeClasses(cls.status)}`}
          >
            {cls.status}
          </span>
        </td>
      );
    default:
      return <td className="px-4 py-3" />;
  }
}

export const ClassesTableView: React.FC<ClassesTableViewProps> = ({ classes }) => {
  const navigate = useNavigate();

  return (
    <SortableTable<TrialClass>
      items={classes}
      columns={COLUMNS}
      defaultSortColumn="element"
      getRowKey={cls => cls.id}
      onRowClick={cls => navigate(`/classes/${cls.id}`)}
      renderCell={renderCell}
    />
  );
};

export default ClassesTableView;
