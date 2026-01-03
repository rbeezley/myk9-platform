import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface AddDogButtonProps {
  onClick: () => void;
}

const AddDogButton: React.FC<AddDogButtonProps> = ({ onClick }) => (
  <Button
    onClick={onClick}
    className="flex items-center gap-2 h-10 px-4 py-2 rounded-md font-semibold shadow-sm bg-primary text-white hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary transition-colors duration-150 dark:bg-primary dark:text-white"
    aria-label="Add Dog"
  >
    <Plus size={20} className="inline-block align-middle" />
    Add Dog
  </Button>
);

export default AddDogButton;
