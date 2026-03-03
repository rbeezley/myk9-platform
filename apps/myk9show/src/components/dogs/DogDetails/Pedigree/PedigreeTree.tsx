import React from 'react';
import type { PedigreeAncestor, PedigreePosition } from '@/types/pedigree-types';
import { POSITION_SHORT_NAMES } from '@/types/pedigree-types';
import PedigreeCard from './PedigreeCard';

interface PedigreeTreeProps {
  ancestors: PedigreeAncestor[];
  onAdd: (position: PedigreePosition) => void;
  onView: (ancestor: PedigreeAncestor) => void;
  onEdit: (ancestor: PedigreeAncestor) => void;
  onDelete: (ancestor: PedigreeAncestor) => void;
}

const PedigreeTree: React.FC<PedigreeTreeProps> = ({
  ancestors,
  onAdd,
  onView,
  onEdit,
  onDelete,
}) => {
  const byPosition = new Map(ancestors.map(a => [a.position, a]));

  const renderCard = (position: PedigreePosition) => {
    const ancestor = byPosition.get(position);
    return (
      <PedigreeCard
        ancestor={ancestor}
        position={position}
        displayRole={POSITION_SHORT_NAMES[position]}
        onAdd={() => onAdd(position)}
        onView={ancestor ? () => onView(ancestor) : undefined}
        onEdit={ancestor ? () => onEdit(ancestor) : undefined}
        onDelete={ancestor ? () => onDelete(ancestor) : undefined}
      />
    );
  };

  return (
    <div className="w-full flex flex-col items-center gap-8 mt-4 relative">
      {/* Row 1: Sire / Dam */}
      <div className="flex justify-center gap-8 w-full">
        <div className="flex flex-col items-center">{renderCard('sire')}</div>
        <div className="flex flex-col items-center">{renderCard('dam')}</div>
      </div>

      {/* Row 2: Grandparents */}
      <div className="flex justify-center gap-8 w-full">
        {/* Sire's parents */}
        <div className="flex gap-4">
          {renderCard('sire_grandsire')}
          {renderCard('sire_granddam')}
        </div>
        {/* Dam's parents */}
        <div className="flex gap-4">
          {renderCard('dam_grandsire')}
          {renderCard('dam_granddam')}
        </div>
      </div>
    </div>
  );
};

export default PedigreeTree;
