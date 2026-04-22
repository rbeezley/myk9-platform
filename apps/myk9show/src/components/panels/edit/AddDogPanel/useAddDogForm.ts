import { useState, useCallback, useEffect, useRef } from 'react';
import type { Registration } from '@/types/dog-types';
import type { FormValidation } from '@/hooks/useFormValidation';
import { MAX_FILE_SIZE, ALLOWED_IMAGE_TYPES } from '@/services/imageUploadService';
import type { DogFormData, TabValue } from './types';

interface UseAddDogFormOptions {
  open: boolean;
  form?: FormValidation<DogFormData> | undefined;
}

const ALLOWED_PHOTO_MIME = new Set<string>(ALLOWED_IMAGE_TYPES);

export function useAddDogForm({ open, form }: UseAddDogFormOptions) {
  const [activeTab, setActiveTab] = useState<TabValue>('basic');

  // Photo dialog state
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Registration dialog state
  const [isAddEditRegDialogOpen, setIsAddEditRegDialogOpen] = useState(false);
  const [currentRegToEdit, setCurrentRegToEdit] = useState<Registration | undefined>(undefined);

  // Track active FileReader so we can abort on unmount / re-open
  const activeReaderRef = useRef<FileReader | null>(null);

  // Reset UI state when panel opens (React-recommended "adjust state during render" pattern).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setActiveTab('basic');
      setIsPhotoDialogOpen(false);
      setPhotoPreview(null);
      setIsPhotoDragging(false);
      setPhotoError(null);
      setIsAddEditRegDialogOpen(false);
      setCurrentRegToEdit(undefined);
    }
  }

  // Abort any in-flight FileReader whenever the panel's open state changes —
  // covers close (prevents setState on a hidden panel) and open (defensive).
  useEffect(() => {
    if (activeReaderRef.current) {
      activeReaderRef.current.abort();
      activeReaderRef.current = null;
    }
  }, [open]);

  // Abort in-flight FileReader on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (activeReaderRef.current) {
        activeReaderRef.current.abort();
        activeReaderRef.current = null;
      }
    };
  }, []);

  const readPhotoFile = useCallback((file: File) => {
    setPhotoError(null);
    if (!ALLOWED_PHOTO_MIME.has(file.type)) {
      setPhotoError('Unsupported file type. Use JPEG, PNG, WebP, or GIF.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setPhotoError('Photo is too large (max 5 MB).');
      return;
    }
    if (activeReaderRef.current) {
      activeReaderRef.current.abort();
    }
    const reader = new FileReader();
    activeReaderRef.current = reader;
    reader.onload = ev => {
      if (activeReaderRef.current !== reader) return;
      const result = ev.target?.result;
      if (typeof result === 'string' && result.startsWith('data:image/')) {
        setPhotoPreview(result);
      }
      activeReaderRef.current = null;
    };
    reader.onerror = () => {
      if (activeReaderRef.current !== reader) return;
      setPhotoError('Failed to read the selected photo.');
      activeReaderRef.current = null;
    };
    reader.readAsDataURL(file);
  }, []);

  // Handle adding/editing a registration — updates form context
  const handleSaveRegistration = useCallback(
    (newReg: Registration) => {
      if (!form) return;
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
      if (!form) return;
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
    if (!isOpen) {
      setPhotoPreview(null);
      setPhotoError(null);
      if (activeReaderRef.current) {
        activeReaderRef.current.abort();
        activeReaderRef.current = null;
      }
    }
  };

  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPhotoDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readPhotoFile(file);
  };

  const handlePhotoFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readPhotoFile(file);
    // Reset input so selecting the same file twice re-triggers onChange
    e.target.value = '';
  };

  const handlePhotoSave = (preview: string | null) => {
    if (preview && form) {
      form.setValue('imageUrl', preview);
    }
    setIsPhotoDialogOpen(false);
    setPhotoPreview(null);
    setPhotoError(null);
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
    photoError,

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
