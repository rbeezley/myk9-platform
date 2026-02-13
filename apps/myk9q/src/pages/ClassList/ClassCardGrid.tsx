import React from 'react';
import { ClassCard } from './ClassCard';
import { getStatusColor, getFormattedStatus } from './utils/statusFormatting';
import type { ClassEntry } from './hooks/useClassListData';
import type { UserPermissions } from '../../utils/auth';

interface ClassCardGridProps {
  filteredClasses: ClassEntry[];
  isLoaded: boolean;
  hasPermission: (permission: keyof UserPermissions) => boolean;
  toggleFavorite: (classId: number) => void;
  handleViewEntries: (classEntry: ClassEntry) => void;
  setActivePopup: (id: number | null) => void;
  setSelectedClassForStatus: (classEntry: ClassEntry) => void;
  setStatusDialogOpen: (open: boolean) => void;
  activePopup: number | null;
  handleClassPrefetch: (classId: number) => void;
  justToggledClassId: number | null;
}

export const ClassCardGrid: React.FC<ClassCardGridProps> = ({
  filteredClasses,
  isLoaded,
  hasPermission,
  toggleFavorite,
  handleViewEntries,
  setActivePopup,
  setSelectedClassForStatus,
  setStatusDialogOpen,
  activePopup,
  handleClassPrefetch,
  justToggledClassId,
}) => {
  return (
    <div className="class-list-scrollable">
      <div className={`grid-responsive ${isLoaded ? 'stagger-children' : ''}`}>
        {filteredClasses.map((classEntry) => (
          <ClassCard
            key={classEntry.id}
            classEntry={classEntry}
            hasPermission={hasPermission}
            toggleFavorite={toggleFavorite}
            handleViewEntries={handleViewEntries}
            setActivePopup={setActivePopup}
            setSelectedClassForStatus={setSelectedClassForStatus}
            setStatusDialogOpen={setStatusDialogOpen}
            activePopup={activePopup}
            getStatusColor={getStatusColor}
            getFormattedStatus={getFormattedStatus}
            onMenuClick={(classId) => {
              setActivePopup(classId);
            }}
            onPrefetch={() => handleClassPrefetch(classEntry.id)}
            justToggledClassId={justToggledClassId}
          />
        ))}
      </div>
    </div>
  );
};
