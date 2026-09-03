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

  return (
    <dl className="border-t border-border pt-0.5">
      {registry.rows.map((row, i) => (
        <div
          key={`${row.org}-${row.number ?? i}`}
          className={`grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-baseline gap-x-2 gap-y-1 py-1.5 ${i > 0 ? 'border-t border-border' : ''}`}
        >
          <dt className="min-w-0 text-sm font-semibold uppercase text-muted-foreground [overflow-wrap:anywhere]">
            {row.org}
          </dt>
          {registry.breedVaries && (
            <dd className="col-start-2 row-start-2 m-0 min-w-0 text-sm text-foreground [overflow-wrap:anywhere]">
              {row.breed ?? '—'}
            </dd>
          )}
          <dd className="col-start-2 row-start-1 m-0 min-w-0 text-right font-mono text-sm text-foreground [overflow-wrap:anywhere]">
            {row.number ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
};

export default DogRegistryTable;
