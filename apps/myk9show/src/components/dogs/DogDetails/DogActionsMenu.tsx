import React from 'react';
import ThreeDotMenu from '@/components/common/ThreeDotMenu';
import { Dog } from '@/types/dog-types';

interface DogActionsMenuProps {
  dog: Dog;
  onEdit: (dog: Dog) => void;
  onDelete: (id: string) => void;
  onEditPhoto: (dog: Dog) => void;
}

const DogActionsMenu: React.FC<DogActionsMenuProps> = ({ dog, onEdit, onDelete, onEditPhoto }) => {
  return (
    <ThreeDotMenu
      onEdit={() => onEdit(dog)}
      onDelete={() => onDelete(dog.id)}
      onEditPhoto={() => onEditPhoto(dog)}
    />
  );
};

export default DogActionsMenu;
