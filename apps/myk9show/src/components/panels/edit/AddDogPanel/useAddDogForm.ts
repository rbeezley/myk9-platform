import { useState, useCallback } from 'react';
import type { Registration } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import type { DogFormData, TabValue } from './types';
import { INITIAL_FORM_DATA } from './types';

interface UseAddDogFormOptions {
  open: boolean;
  userRole: UserRole;
  currentUserPersonId?: string | undefined;
}

function buildInitialFormData(userRole: UserRole, currentUserPersonId?: string): DogFormData {
  return {
    ...INITIAL_FORM_DATA,
    ownerId: userRole === UserRole.EXHIBITOR ? (currentUserPersonId || '') : '',
  };
}

export function useAddDogForm({ open, userRole, currentUserPersonId }: UseAddDogFormOptions) {
  const [formData, setFormData] = useState<DogFormData>(() => buildInitialFormData(userRole, currentUserPersonId));
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<TabValue>('basic');
  const [isCreating, setIsCreating] = useState(false);

  // Photo dialog state
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);

  // Registration dialog state
  const [isAddEditRegDialogOpen, setIsAddEditRegDialogOpen] = useState(false);
  const [currentRegToEdit, setCurrentRegToEdit] = useState<Registration | undefined>(undefined);

  // Reset form when panel opens (React-recommended "adjust state during render" pattern)
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setFormData(buildInitialFormData(userRole, currentUserPersonId));
      setActiveTab('basic');
      setValidationErrors({});
      setIsCreating(false);
    }
  }

  // Sync ownerId when currentUserPersonId resolves asynchronously (e.g., after
  // the people store finishes loading). Uses the "adjust state during render"
  // pattern to avoid setState inside useEffect.
  const [prevPersonId, setPrevPersonId] = useState(currentUserPersonId);
  if (currentUserPersonId !== prevPersonId) {
    setPrevPersonId(currentUserPersonId);
    if (currentUserPersonId && userRole === UserRole.EXHIBITOR && !formData.ownerId) {
      setFormData(prev => ({ ...prev, ownerId: currentUserPersonId }));
    }
  }

  // Handle form field changes
  const handleFieldChange = useCallback((field: keyof DogFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [validationErrors]);

  // Handle adding/editing a registration
  const handleSaveRegistration = useCallback((newReg: Registration) => {
    setFormData(prev => {
      const existingIndex = prev.registrations.findIndex(r => r.id === newReg.id);
      if (existingIndex > -1) {
        // Edit existing
        const updatedRegistrations = [...prev.registrations];
        updatedRegistrations[existingIndex] = newReg;
        return { ...prev, registrations: updatedRegistrations };
      } else {
        // Add new
        return { ...prev, registrations: [...prev.registrations, newReg] };
      }
    });
    setIsAddEditRegDialogOpen(false);
    setCurrentRegToEdit(undefined);
  }, []);

  // Handle removing a registration
  const handleRemoveRegistration = useCallback((id: string) => {
    setFormData(prev => ({
      ...prev,
      registrations: prev.registrations.filter(reg => reg.id !== id),
    }));
  }, []);

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
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoSave = (preview: string | null) => {
    if (preview) {
      setFormData(prev => ({ ...prev, imageUrl: preview }));
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
    // Form state
    formData,
    setFormData,
    validationErrors,
    setValidationErrors,
    activeTab,
    setActiveTab,
    isCreating,
    setIsCreating,

    // Photo state
    isPhotoDialogOpen,
    photoPreview,
    isPhotoDragging,
    setIsPhotoDragging,

    // Registration dialog state
    isAddEditRegDialogOpen,
    setIsAddEditRegDialogOpen,
    currentRegToEdit,

    // Form handlers
    handleFieldChange,
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
