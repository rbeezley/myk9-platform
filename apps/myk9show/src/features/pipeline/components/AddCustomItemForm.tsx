import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

interface AddCustomItemFormProps {
  onAdd: (label: string) => void;
  disabled?: boolean | undefined;
}

export const AddCustomItemForm: React.FC<AddCustomItemFormProps> = ({
  onAdd,
  disabled,
}) => {
  const [label, setLabel] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setLabel('');
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground text-xs gap-1.5"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
      >
        <Plus className="h-3 w-3" />
        Add custom item
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-1">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g., Order ribbons"
        className="h-8 text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsOpen(false);
            setLabel('');
          }
        }}
      />
      <Button type="submit" size="sm" className="h-8" disabled={!label.trim()}>
        Add
      </Button>
    </form>
  );
};
