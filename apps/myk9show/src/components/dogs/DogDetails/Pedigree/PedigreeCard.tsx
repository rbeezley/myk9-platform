import React from 'react';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import {
  formatRegistrationNumbers,
  type PedigreeAncestor,
  type PedigreePosition,
} from '@/types/pedigree-types';

interface PedigreeCardProps {
  ancestor: PedigreeAncestor | undefined;
  position: PedigreePosition;
  displayRole: string;
  onAdd: () => void;
  onView?: (() => void) | undefined;
  onEdit?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}

const PedigreeCard: React.FC<PedigreeCardProps> = ({
  ancestor,
  displayRole,
  onAdd,
  onView,
  onEdit,
  onDelete,
}) => {
  // Empty slot — show "Add" affordance
  if (!ancestor) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="bg-muted/50 border border-dashed rounded-xl p-4 min-w-[180px] max-w-[220px] mx-auto
                   flex flex-col items-center justify-center cursor-pointer
                   hover:border-primary/50 hover:bg-muted/80 transition-all duration-200"
        style={{ minHeight: 110 }}
      >
        <div className="w-8 h-8 rounded-full bg-accent/50 flex items-center justify-center mb-2">
          <Plus className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium text-muted-foreground">Add {displayRole}</div>
      </button>
    );
  }

  // Filled slot
  const name = ancestor.call_name || ancestor.registered_name;
  const regDisplay = formatRegistrationNumbers(ancestor.registration_numbers);

  return (
    <div
      className="bg-muted border rounded-xl shadow-sm p-4 min-w-[180px] max-w-[220px] mx-auto
                 flex flex-col items-center relative"
      style={{ minHeight: 110 }}
    >
      <div className="absolute top-2 right-2 z-10">
        <ThreeDotMenu
          items={[
            {
              label: 'View',
              icon: <Eye className="w-4 h-4 mr-2" />,
              onClick: onView ?? (() => {}),
            },
            {
              label: 'Edit',
              icon: <Pencil className="w-4 h-4 mr-2" />,
              onClick: onEdit ?? (() => {}),
            },
            {
              label: 'Delete',
              icon: <Trash2 className="w-4 h-4 mr-2 text-destructive" />,
              onClick: onDelete ?? (() => {}),
              className: 'text-destructive',
            },
          ]}
        />
      </div>
      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center mb-2">
        <span className="text-accent-foreground font-bold text-lg">{name.charAt(0)}</span>
      </div>
      <div className="font-semibold text-base text-center mb-1 text-foreground">{name}</div>
      {ancestor.titles && (
        <div className="text-xs text-muted-foreground text-center mb-1">{ancestor.titles}</div>
      )}
      <div className="text-xs text-muted-foreground text-center mb-1">
        {displayRole}
        {regDisplay && <> | {regDisplay}</>}
      </div>
      {ancestor.date_of_birth && (
        <div className="text-xs text-muted-foreground text-center">
          DOB: {formatDateMMDDYYYY(ancestor.date_of_birth)}
        </div>
      )}
    </div>
  );
};

export default PedigreeCard;
