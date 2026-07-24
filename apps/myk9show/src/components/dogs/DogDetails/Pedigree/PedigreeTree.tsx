import React from 'react';
import type { PedigreeAncestor, PedigreePosition } from '@/types/pedigree-types';
import { POSITION_SHORT_NAMES } from '@/types/pedigree-types';
import { useElementWidth } from '@/hooks/useElementWidth';
import PedigreeCard from './PedigreeCard';
import { getOrderedPedigreeRelationshipSlots } from './pedigreeRelationshipGroups';

interface PedigreeTreeProps {
  ancestors: PedigreeAncestor[];
  onAdd: (position: PedigreePosition) => void;
  onView: (ancestor: PedigreeAncestor) => void;
  onEdit: (ancestor: PedigreeAncestor) => void;
  onDelete: (ancestor: PedigreeAncestor) => void;
}

// Below this measured content-container width the visual tree's grandparent
// row no longer fits at readable sizes: four ~180px-minimum cards plus two
// 16px intra-pair gaps and one 32px inter-pair gap need ~784px, so anything
// narrower switches to stacked relationship groups instead of shrinking
// cards/typography (elderly persona) or overflowing the two-column Dog
// Details container.
const TREE_MIN_WIDTH = 800;

/**
 * Container-aware Pedigree layout (design.md Decision 5 / "Premium records
 * fit their content container"). Renders one node reshaped by measured
 * container width via useElementWidth — never two CSS-hidden copies, and
 * never a viewport-only media query, since the Dog Details main column can
 * be narrow even at desktop viewport widths when a sidebar is open.
 */
const PedigreeTree: React.FC<PedigreeTreeProps> = ({
  ancestors,
  onAdd,
  onView,
  onEdit,
  onDelete,
}) => {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  // Unmeasured on first render — default to the grouped layout so nothing
  // ever renders clipped before the observer reports a width.
  const isNarrow = width === null || width < TREE_MIN_WIDTH;

  const byPosition = new Map(ancestors.map(a => [a.position, a]));

  const renderCard = (position: PedigreePosition) => {
    const ancestor = byPosition.get(position);
    return (
      <PedigreeCard
        key={position}
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

  if (isNarrow) {
    const slots = getOrderedPedigreeRelationshipSlots();
    const groups = [
      { name: 'Parents' as const, slots: slots.filter(s => s.group === 'Parents') },
      { name: 'Grandparents' as const, slots: slots.filter(s => s.group === 'Grandparents') },
    ];

    return (
      <div ref={ref} className="w-full mt-4 space-y-6" data-testid="pedigree-grouped-layout">
        {groups.map(group => (
          <div key={group.name}>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {group.name}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {group.slots.map(slot => (
                <div key={slot.position} className="flex flex-col items-center gap-1">
                  <span className="text-xs font-medium text-muted-foreground">{slot.label}</span>
                  {renderCard(slot.position)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="w-full flex flex-col items-center gap-8 mt-4 relative"
      data-testid="pedigree-tree-layout"
    >
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
