import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getClassStatusBadgeClasses } from '@myk9/core';
import { SortableTable, type ColumnDef } from '@/components/common/SortableTable';
import type { Trial } from '@/components/trials/types/trial.types';

interface TrialsTableViewProps {
  trials: Trial[];
}

const COLUMNS: ColumnDef<Trial>[] = [
  {
    key: 'trialNumber',
    label: 'Trial #',
    className: 'w-[100px]',
    getValue: trial => String(trial.trialNumber || 0).padStart(5, '0'),
  },
  {
    key: 'trialDate',
    label: 'Date',
    className: 'w-[160px]',
    getValue: trial => trial.trialDate || '',
  },
  {
    key: 'type',
    label: 'Type',
    className: 'w-[180px]',
    getValue: trial => (trial.type || '').toLowerCase(),
  },
  {
    key: 'status',
    label: 'Status',
    className: 'w-[120px]',
    getValue: trial => (trial.status || '').toLowerCase(),
  },
];

function renderCell(trial: Trial, column: ColumnDef<Trial>) {
  switch (column.key) {
    case 'trialNumber':
      return (
        <td className="px-4 py-3">
          <span className="font-medium">#{trial.trialNumber || '\u2014'}</span>
        </td>
      );
    case 'trialDate':
      return (
        <td className="px-4 py-3 text-muted-foreground">
          {trial.trialDate
            ? new Date(trial.trialDate).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })
            : '\u2014'}
        </td>
      );
    case 'type':
      return <td className="px-4 py-3 text-muted-foreground truncate">{trial.type || '\u2014'}</td>;
    case 'status':
      return (
        <td className="px-4 py-3">
          <span
            className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${getClassStatusBadgeClasses(trial.status)}`}
          >
            {trial.status}
          </span>
        </td>
      );
    default:
      return <td className="px-4 py-3" />;
  }
}

export const TrialsTableView: React.FC<TrialsTableViewProps> = ({ trials }) => {
  const navigate = useNavigate();

  return (
    <SortableTable<Trial>
      items={trials}
      columns={COLUMNS}
      defaultSortColumn="trialDate"
      getRowKey={trial => trial.id}
      onRowClick={trial =>
        navigate(trial.showId ? `/shows/${trial.showId}/trials/${trial.id}` : `/trials/${trial.id}`)
      }
      renderCell={renderCell}
    />
  );
};

export default TrialsTableView;
