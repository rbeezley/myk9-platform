import React from 'react';
import ThreeDotMenu from '@/components/common/ThreeDotMenu';

interface DogBasicInfoMenuProps {
  onEdit?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  onEditPhoto?: (() => void) | undefined;
}

const DogBasicInfoMenu: React.FC<DogBasicInfoMenuProps> = ({ onEdit, onDelete, onEditPhoto }) => {
  return (
    <ThreeDotMenu
      onEdit={onEdit}
      onDelete={onDelete}
      onEditPhoto={onEditPhoto}
    />
  );
};

export default DogBasicInfoMenu;
