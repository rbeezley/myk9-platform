import React from 'react';
import type { Ancestor } from '@/types/pedigree-types';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import { Pencil, Trash2, Eye } from 'lucide-react';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';

interface PedigreeCardProps {
  ancestor?: Ancestor;
  role: string;
  highlight?: boolean;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const PedigreeCard: React.FC<PedigreeCardProps> = ({ ancestor, role, highlight = false, onView, onEdit, onDelete }) => {
  const name = ancestor?.name || role;
  const title = ancestor?.title || '';
  const registration = ancestor?.registration || '';
  const dateOfBirth = ancestor?.dateOfBirth || '';

  return (
    <div
      className={`bg-muted border rounded-xl shadow-sm p-4 min-w-[180px] max-w-[220px] mx-auto flex flex-col items-center relative ${highlight ? 'ring-2 ring-primary' : ''}`}
      style={{ minHeight: 110 }}
    >
      <div className="absolute top-2 right-2 z-10">
        <ThreeDotMenu
          items={[
            { label: 'View', icon: <Eye className="w-4 h-4 mr-2" />, onClick: onView ?? (() => {}) },
            { label: 'Edit', icon: <Pencil className="w-4 h-4 mr-2" />, onClick: onEdit ?? (() => {}) },
            { label: 'Delete', icon: <Trash2 className="w-4 h-4 mr-2 text-destructive" />, onClick: onDelete ?? (() => {}), className: 'text-destructive' },
          ]}
        />
      </div>
      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center mb-2">
        <span className="text-accent-foreground font-bold text-lg">{name.charAt(0)}</span>
      </div>
      <div className="font-semibold text-base text-center mb-1 text-foreground">{name}</div>
      <div className="text-xs text-muted-foreground text-center mb-1">{title}</div>
      <div className="text-xs text-muted-foreground text-center mb-1">{role}{registration && <> | Reg: {registration}</>}</div>
      <div className="text-xs text-muted-foreground text-center">{dateOfBirth ? `DOB: ${formatDateMMDDYYYY(dateOfBirth)}` : ''}</div>
    </div>
  );
};

export default PedigreeCard;
