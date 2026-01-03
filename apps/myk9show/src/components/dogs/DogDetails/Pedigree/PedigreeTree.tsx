import React from 'react';
import type { ExtendedAncestor } from './PedigreeAncestorAddDialog';
import PedigreeCard from './PedigreeCard';

interface PedigreeTreeProps {
  ancestors: ExtendedAncestor[];
  onView: (ancestor: ExtendedAncestor | undefined) => void;
  onEdit: (ancestor: ExtendedAncestor | undefined) => void;
  onDelete: (ancestor: ExtendedAncestor | undefined) => void;
}

const PedigreeTree: React.FC<PedigreeTreeProps> = ({ ancestors, onView, onEdit, onDelete }) => {
  // Utility to find ancestor by role and index (for grandparents)
  const getAncestor = (role: string, idx?: number) => {
    if (idx !== undefined) {
      return ancestors.filter(a => a.role === role)[idx];
    }
    return ancestors.find(a => a.role === role);
  };

  return (
    <div className="w-full flex flex-col items-center gap-8 mt-4 relative">
      {/* Row 1: Dog */}
      <div className="flex justify-center relative z-10" style={{ minHeight: 120 }}>
        <PedigreeCard
          ancestor={getAncestor('Dog')}
          role="Dog"
          highlight
          onView={() => onView(getAncestor('Dog'))}
          onEdit={() => onEdit(getAncestor('Dog'))}
          onDelete={() => onDelete(getAncestor('Dog'))}
        />
      </div>
      {/* Row 2 & 3: Sire/Dam and Grandparents, aligned as tree */}
      <div className="flex justify-center gap-8 w-full">
        {/* Sire side */}
        <div className="flex flex-col items-center">
          <PedigreeCard
            ancestor={getAncestor('Sire')}
            role="Sire"
            onView={() => onView(getAncestor('Sire'))}
            onEdit={() => onEdit(getAncestor('Sire'))}
            onDelete={() => onDelete(getAncestor('Sire'))}
          />
          <div className="flex gap-4 mt-4">
            <PedigreeCard
              ancestor={getAncestor('Grandsire', 0)}
              role="Grandsire"
              onView={() => onView(getAncestor('Grandsire', 0))}
              onEdit={() => onEdit(getAncestor('Grandsire', 0))}
              onDelete={() => onDelete(getAncestor('Grandsire', 0))}
            />
            <PedigreeCard
              ancestor={getAncestor('Granddam', 0)}
              role="Granddam"
              onView={() => onView(getAncestor('Granddam', 0))}
              onEdit={() => onEdit(getAncestor('Granddam', 0))}
              onDelete={() => onDelete(getAncestor('Granddam', 0))}
            />
          </div>
        </div>
        {/* Dam side */}
        <div className="flex flex-col items-center">
          <PedigreeCard
            ancestor={getAncestor('Dam')}
            role="Dam"
            onView={() => onView(getAncestor('Dam'))}
            onEdit={() => onEdit(getAncestor('Dam'))}
            onDelete={() => onDelete(getAncestor('Dam'))}
          />
          <div className="flex gap-4 mt-4">
            <PedigreeCard
              ancestor={getAncestor('Grandsire', 1)}
              role="Grandsire"
              onView={() => onView(getAncestor('Grandsire', 1))}
              onEdit={() => onEdit(getAncestor('Grandsire', 1))}
              onDelete={() => onDelete(getAncestor('Grandsire', 1))}
            />
            <PedigreeCard
              ancestor={getAncestor('Granddam', 1)}
              role="Granddam"
              onView={() => onView(getAncestor('Granddam', 1))}
              onEdit={() => onEdit(getAncestor('Granddam', 1))}
              onDelete={() => onDelete(getAncestor('Granddam', 1))}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PedigreeTree;
