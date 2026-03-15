import React, { useState, useCallback, useMemo, createContext } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dog, FileText, Heart } from 'lucide-react';
import PhotoDialog from '@/components/common/PhotoDialog';
import type { DogEditContextType, DogEditPanelProps, DogFormData } from './DogEditPanel.types';
import { dogToFormData, formDataToDog, validateDogData, isAdminRole } from './DogEditPanel.helpers';
import { BasicInfoTab, RegistrationsTab, HealthRecordsTab } from './DogEditPanel.sections';

// eslint-disable-next-line react-refresh/only-export-components
export const DogEditContext = createContext<DogEditContextType>({ isAdmin: false, people: [] });

// Form content component
const DogEditForm: React.FC = () => {
  const { data, updateData } = useEditPanel<DogFormData>();

  // Photo dialog state
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Handle input changes
  const handleInputChange = useCallback(
    (field: keyof DogFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        updateData({ [field]: e.target.value });
      },
    [updateData]
  );

  // Handle select changes
  const handleSelectChange = useCallback(
    (field: keyof DogFormData) => (value: string) => {
      updateData({ [field]: value });
    },
    [updateData]
  );

  // Handle file upload (shared logic for drag & drop and file input)
  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      setPreviewImage(result);
    };
    reader.readAsDataURL(file);
  }, []);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  // File input handler
  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  const handlePhotoSave = useCallback(
    (preview: string | null) => {
      if (preview) {
        updateData({ imageUrl: preview });
      }
      setIsPhotoModalOpen(false);
      setPreviewImage(null);
    },
    [updateData]
  );

  return (
    <div className="space-y-6 p-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out">
          <TabsTrigger
            value="basic"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Dog className="h-4 w-4" />
            Basic Info
          </TabsTrigger>
          <TabsTrigger
            value="registrations"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <FileText className="h-4 w-4" />
            Registrations
          </TabsTrigger>
          <TabsTrigger
            value="health"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Heart className="h-4 w-4" />
            Health
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent
          value="basic"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <BasicInfoTab
            handleInputChange={handleInputChange}
            handleSelectChange={handleSelectChange}
            onOpenPhotoModal={() => setIsPhotoModalOpen(true)}
          />
        </TabsContent>

        {/* Registrations Tab */}
        <TabsContent
          value="registrations"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <RegistrationsTab />
        </TabsContent>

        {/* Health Records Tab */}
        <TabsContent
          value="health"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <HealthRecordsTab />
        </TabsContent>
      </Tabs>

      {/* Photo Dialog */}
      <PhotoDialog
        open={isPhotoModalOpen}
        onOpenChange={setIsPhotoModalOpen}
        previewImage={previewImage}
        currentPhoto={data.imageUrl || ''}
        isDragging={isDragging}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onFileInput={handleFileInput}
        onCancel={() => {
          setIsPhotoModalOpen(false);
          setPreviewImage(null);
        }}
        onSave={handlePhotoSave}
        title="Change Dog Photo"
        previewAlt={data.callName || 'Dog Photo'}
      />
    </div>
  );
};

// Main component
export const DogEditPanel: React.FC<DogEditPanelProps> = ({
  open,
  onClose,
  dogName,
  initialDogData,
  onSave,
  enableAutoSave = false,
  userRole,
  people = [],
}) => {
  // Convert dog data to form data
  const initialFormData = useMemo(() => dogToFormData(initialDogData), [initialDogData]);

  // Determine if user can edit owner
  const isAdmin = isAdminRole(userRole);

  // Context value for passing to form components
  const contextValue = useMemo(
    () => ({
      isAdmin,
      people,
    }),
    [isAdmin, people]
  );

  // Handle save
  const handleSave = useCallback(
    async (formData: DogFormData) => {
      const dogData = formDataToDog(formData);
      if (onSave) {
        await onSave(dogData);
      }
    },
    [onSave]
  );

  return (
    <DogEditContext.Provider value={contextValue}>
      <EditPanelWrapper<DogFormData>
        open={open}
        onClose={onClose}
        title="Edit Dog"
        subtitle={`Editing profile for ${dogName}`}
        size="xl"
        initialData={initialFormData}
        onSave={handleSave}
        validateData={validateDogData}
        enableAutoSave={enableAutoSave}
        saveLabel="Save Changes"
        cancelLabel="Cancel"
      >
        <DogEditForm />
      </EditPanelWrapper>
    </DogEditContext.Provider>
  );
};

export default DogEditPanel;
