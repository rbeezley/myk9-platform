import { useState, useCallback } from 'react';
import type { Registration } from '@/types/dog-types';
import type { FormValidation } from '@/hooks/useFormValidation';
import type { DogFormData, TabValue } from './types';

interface UseAddDogFormOptions {
  open: boolean;
  form: FormValidation<DogFormData>;
}

export function useAddDogForm({ open, form }: UseAddDogFormOptions) {
  const [activeTab, setActiveTab] = useState<TabValue>('basic');

  // Photo dialog state
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);

  // Registration dialog state
  const [isAddEditRegDialogOpen, setIsAddEditRegDialogOpen] = useState(false);
  const [currentRegToEdit, setCurrentRegToEdit] = useState<Registration | undefined>(undefined);

  // Reset UI state when panel opens (React-recommended "adjust state during render" pattern)
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setActiveTab('basic');
    }
  }

  // Handle adding/editing a registration — updates form context
  const handleSaveRegistration = useCallback(
    (newReg: Registration) => {
      const current = form.data.registrations;
      const existingIndex = current.findIndex(r => r.id === newReg.id);
      if (existingIndex > -1) {
        const updated = [...current];
        updated[existingIndex] = newReg;
        form.setValue('registrations', updated);
      } else {
        form.setValue('registrations', [...current, newReg]);
      }
      setIsAddEditRegDialogOpen(false);
      setCurrentRegToEdit(undefined);
    },
    [form]
  );

  // Handle removing a registration
  const handleRemoveRegistration = useCallback(
    (id: string) => {
      form.setValue(
        'registrations',
        form.data.registrations.filter(reg => reg.id !== id)
      );
    },
    [form]
  );

  // Photo handling
  const handlePhotoDialogOpen = (isOpen: boolean) => {
    setIsPhotoDialogOpen(isOpen);
    if (!isOpen) setPhotoPreview(null);
  };

  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPhotoDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = ev => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoSave = (preview: string | null) => {
    if (preview) {
      form.setValue('imageUrl', preview);
    }
    setIsPhotoDialogOpen(false);
    setPhotoPreview(null);
  };

  const openAddRegistration = useCallback(() => {
    setCurrentRegToEdit(undefined);
    setIsAddEditRegDialogOpen(true);
  }, []);

  const openEditRegistration = useCallback((reg: Registration) => {
    setCurrentRegToEdit(reg);
    setIsAddEditRegDialogOpen(true);
  }, []);

  return {
    // Tab / UI state
    activeTab,
    setActiveTab,

    // Photo state
    isPhotoDialogOpen,
    photoPreview,
    isPhotoDragging,
    setIsPhotoDragging,

    // Registration dialog state
    isAddEditRegDialogOpen,
    setIsAddEditRegDialogOpen,
    currentRegToEdit,

    // Registration handlers
    handleSaveRegistration,
    handleRemoveRegistration,

    // Photo handlers
    handlePhotoDialogOpen,
    handlePhotoDrop,
    handlePhotoFileInput,
    handlePhotoSave,

    // Registration dialog handlers
    openAddRegistration,
    openEditRegistration,
  };
}
