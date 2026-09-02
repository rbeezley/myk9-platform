/**
 * DogRegistryTable — one row per registry: org, breed (only when registries
 * disagree), registration number. Shared by the My Dogs rail card and the
 * /dogs grid card so both surfaces read the same way.
 */

import React from 'react';
import type { DogCardRegistryModel } from './dogRegistryModel';

interface DogRegistryTableProps {
  registry: DogCardRegistryModel;
}

export const DogRegistryTable: React.FC<DogRegistryTableProps> = ({ registry }) => {
  if (registry.rows.length === 0) return null;
  const columns = registry.breedVaries
    ? 'grid-cols-[44px_minmax(0,1fr)_auto]'
    : 'grid-cols-[44px_minmax(0,1fr)]';

  return (
    <dl className="border-t border-border pt-0.5">
      {registry.rows.map((row, i) => (
        <div
          key={`${row.org}-${row.number ?? i}`}
          className={`grid items-baseline gap-2 py-1.5 ${columns} ${i > 0 ? 'border-t border-border' : ''}`}
        >
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {row.org}
          </dt>
          {registry.breedVaries && (
            <dd className="m-0 truncate text-xs text-foreground">{row.breed ?? '—'}</dd>
          )}
          <dd className="m-0 text-right font-mono text-[11px] text-foreground">
            {row.number ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
};

export default DogRegistryTable;
