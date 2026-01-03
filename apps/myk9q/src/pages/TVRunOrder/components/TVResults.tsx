// src/pages/TVRunOrder/components/TVResults.tsx
import { PodiumCard } from '../../../components/podium';
import type { TVCompletedClass } from '../hooks/useTVResultsData';
import './TVResults.css';

interface TVResultsProps {
  classes: TVCompletedClass[];
}

export function TVResults({ classes }: TVResultsProps) {
  // Parent component handles pagination - classes is already sliced to max 6
  return (
    <div className="tv-results">
      <div className="tv-results__grid" data-variant="compact">
        {classes.map((cls) => (
          <div key={cls.id} className="tv-results__card-wrapper">
            <PodiumCard
              className={cls.className}
              element={cls.element}
              level={cls.level}
              section={cls.section}
              placements={cls.placements}
              variant="compact"
              animate={true}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
