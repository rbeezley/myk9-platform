import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  EditPanelWrapper,
  type EditPanelDeleteOption,
  type EditPanelSaveContext,
} from './EditPanelWrapper';
import { addedMessage, savedMessage } from './panelSaveErrors';
import { useEditPanel } from './useEditPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { WithdrawalPolicyCard } from '@/components/shows/WithdrawalPolicyCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building, Camera } from 'lucide-react';
import ClubPhotoDialog from '@/components/clubs/ClubPhotoDialog';
import { ClubNumberFields } from '@/components/clubs/ClubNumberFields';
import { AccentColorPicker } from '@/components/ui/accent-color-picker';
import type { Club } from '@/types/club-types';
import { CLUB_TYPES } from '@/types/club-types';
import { logger } from '@/services/LoggingService';
import {
  CLUB_REGISTRY_ORGS,
  hasClubRegistryNumber,
  type ClubRegistryNumbers,
} from '@/utils/clubRegistryNumbers';
import { PremiumTemplatesTab } from './ClubEditPanel/PremiumTemplatesTab';
import { ClubTabsList } from './ClubEditPanel/ClubTabsList';
import {
  CLUB_TAB_LABEL,
  CLUB_TAB_ORDER,
  locateInvalidField,
  type ClubTabValue,
} from './ClubEditPanel/validationTab';
import { ClubContactCard } from './ClubEditPanel/ClubContactCard';
import {
  clubEditSchemaFor,
  clubNumberField,
  clubToFormData,
  formDataToClub,
  type ClubEditFormData,
} from './ClubEditPanel/formData';
import { usePanelValidationNavigation } from './usePanelValidationNavigation';

interface ClubEditPanelProps {
  open: boolean;
  onClose: () => void;
  clubId: string;
  clubName: string;
  initialClubData: Partial<Club>;
  onSave?: (clubData: Partial<Club>, context: EditPanelSaveContext) => Promise<void>;
  enableAutoSave?: boolean;
  showAdvancedFields?: boolean;
  /** Set to 'create' when adding a new club. Defaults to 'edit'. */
  mode?: 'create' | 'edit';
  /** "Delete club" in the footer. Edit mode only; omit for a viewer who cannot delete. */
  onDelete?: EditPanelDeleteOption | undefined;
}

// Form content component
const ClubEditForm: React.FC<{
  clubId: string;
  mode: 'create' | 'edit';
  onClose?: () => void;
  activeTab: ClubTabValue;
  onTabChange: (tab: ClubTabValue) => void;
  /** Edit mode, numbers not loaded yet: the number fields wait rather than show blank. */
  registryNumbersPending: boolean;
  /** The club's stored numbers once loaded; undefined until then. */
  loadedNumbers: ClubRegistryNumbers | undefined;
}> = ({ clubId, mode, onClose, activeTab, onTabChange, registryNumbersPending, loadedNumbers }) => {
  const { data, form, requestTab } = useEditPanel<ClubEditFormData>();

  // The wrapper will not reset a form that is already dirty, so numbers that load after
  // the user edited another field would leave the number inputs blank, and saving just
  // UKC would delete the stored AKC. Put each loaded number into its (disabled until now,
  // so untouched) field once, whatever the dirty state.
  useEffect(() => {
    if (mode !== 'edit' || !loadedNumbers || !form) return;
    for (const org of CLUB_REGISTRY_ORGS) {
      const field = clubNumberField(org);
      const loaded = loadedNumbers[org] ?? '';
      if (loaded && data[field] !== loaded) form.setValue(field, loaded);
    }
    // Hydrate once per load; later keystrokes must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedNumbers, mode]);

  // Photo dialog state
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Handle input changes
  const handleInputChange = useCallback(
    (field: keyof ClubEditFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        form?.setValue(field, e.target.value);
      },
    [form]
  );

  // Handle blur to touch field for validation
  const handleBlur = useCallback(
    (field: keyof ClubEditFormData) => () => {
      form?.touchField(field);
    },
    [form]
  );

  // Handle select changes
  const handleSelectChange = useCallback(
    (field: keyof ClubEditFormData) => (value: string) => {
      form?.setValue(field, value);
      form?.touchField(field);
    },
    [form]
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
    (savedImage: string | null) => {
      if (savedImage) {
        form?.setValue('logo', savedImage);
      }
      setIsPhotoModalOpen(false);
      setPreviewImage(null);
    },
    [form]
  );

  const fieldHandlers = { handleInputChange, handleBlur, handleSelectChange };

  return (
    <div className="space-y-6 p-6">
      <Tabs
        value={activeTab}
        onValueChange={value =>
          requestTab ? requestTab(value) : onTabChange(value as ClubTabValue)
        }
        className="w-full"
      >
        <ClubTabsList mode={mode} data={data} errors={form?.errors ?? {}} />

        {/* Basic Information Tab */}
        <TabsContent
          value="basic"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Club Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Club Logo Section */}
              <div className="flex items-center gap-4 pb-4 border-b border-border/30">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={data.logo} alt={data.name} />
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                    {data.name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                    Club Logo
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      id="club-logo-button"
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsPhotoModalOpen(true)}
                      className="gap-2"
                    >
                      <Camera className="h-4 w-4" />
                      Change Logo
                    </Button>
                    {data.logo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => form?.setValue('logo', '')}
                        className="gap-2 text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Club Name" fieldId="name" required error={form?.getError('name')}>
                  <Input
                    id="name"
                    value={data.name}
                    onChange={handleInputChange('name')}
                    onBlur={handleBlur('name')}
                    placeholder="Enter club name"
                    {...form?.getFieldProps('name')}
                  />
                </FormField>
              </div>

              {/* MYK9-1235: a new club has no server row to hang numbers on until its queued
                  INSERT uploads, so numbers are added from Edit Club afterwards. */}
              {mode === 'edit' ? (
                <ClubNumberFields
                  values={{
                    AKC: data.akcClubNumber ?? '',
                    UKC: data.ukcClubNumber ?? '',
                    ASCA: data.ascaClubNumber ?? '',
                  }}
                  idFor={org => `${org.toLowerCase()}ClubNumber`}
                  onChange={(org, value) => form?.setValue(clubNumberField(org), value)}
                  onBlur={org => form?.touchField(clubNumberField(org))}
                  error={form?.getError('akcClubNumber')}
                  disabled={registryNumbersPending}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  After the club is added, enter its AKC, UKC or ASCA club numbers from Edit Club.
                </p>
              )}

              <FormField label="Description" fieldId="description">
                <textarea
                  id="description"
                  value={data.description || ''}
                  onChange={handleInputChange('description')}
                  onBlur={handleBlur('description')}
                  placeholder="Enter club description"
                  className="min-h-[80px] w-full rounded-xl border-0 bg-input px-3.5 py-2.5 text-sm font-medium tracking-tight placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:bg-background focus-visible:shadow-sm transition-all duration-200"
                />
              </FormField>

              <div className="space-y-2">
                <AccentColorPicker
                  value={data.accentColor || null}
                  onChange={color => form?.setValue('accentColor', color ?? '')}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Club Type" fieldId="clubType">
                  <Select
                    value={data.clubType || ''}
                    onValueChange={handleSelectChange('clubType')}
                  >
                    <SelectTrigger id="clubType">
                      <SelectValue placeholder="Select club type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLUB_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label="Founded" fieldId="founded" error={form?.getError('founded')}>
                  <Input
                    id="founded"
                    type="date"
                    value={data.founded || ''}
                    onChange={handleInputChange('founded')}
                    onBlur={handleBlur('founded')}
                    {...form?.getFieldProps('founded')}
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>

          {/*
            Club-wide default withdrawal refund policy (shows can override).
            Edit only: the card reads and writes the club row directly, and a
            refund policy is not something to answer while creating a club —
            least of all mid-wizard, where the club exists only to hang a show
            on (MYK9-454).
          */}
          {mode === 'edit' && <WithdrawalPolicyCard scope="club" entityId={clubId} />}
        </TabsContent>

        {/* Contact Information Tab */}
        <TabsContent
          value="contact"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <ClubContactCard {...fieldHandlers} data={data} form={form} />
        </TabsContent>

        {/* Premium Templates Tab */}
        <TabsContent
          value="premium"
          className="animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          {mode === 'create' ? (
            // Templates hang off a club row, which does not exist yet.
            <p className="rounded-xl border border-border/30 bg-muted/30 p-4 text-sm text-muted-foreground">
              Premium templates are optional. You can set them up from the club's Premium tab once
              it has been created.
            </p>
          ) : (
            <PremiumTemplatesTab clubId={clubId} onClose={onClose} />
          )}
        </TabsContent>
      </Tabs>

      {/* Club Photo Dialog */}
      <ClubPhotoDialog
        open={isPhotoModalOpen}
        onOpenChange={setIsPhotoModalOpen}
        previewImage={previewImage}
        currentPhoto={data.logo || ''}
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
      />
    </div>
  );
};

// Main component. The session is keyed on a counter bumped only on the
// closed -> open edge, so every open starts on Basic Info with no pending focus
// (callers keep this mounted while closed, and the tab state is lifted out of
// the tab content, MYK9-891) while closing does NOT remount, which would cut
// the panel's exit transition.
export const ClubEditPanel: React.FC<ClubEditPanelProps> = props => {
  const [prevOpen, setPrevOpen] = useState(props.open);
  const [session, setSession] = useState(0);
  if (props.open !== prevOpen) {
    setPrevOpen(props.open);
    if (props.open) setSession(current => current + 1);
  }
  return <ClubEditPanelSession key={session} {...props} />;
};

const ClubEditPanelSession: React.FC<ClubEditPanelProps> = ({
  open,
  onClose,
  clubId,
  clubName,
  initialClubData,
  onSave,
  enableAutoSave = false,
  mode = 'edit',
  onDelete,
}) => {
  // A failed save moves to the tab holding the first invalid field (MYK9-891).
  const { activeTab, setActiveTab, handleValidationFail } =
    usePanelValidationNavigation<ClubTabValue>('basic', locateInvalidField);

  // Convert club data to form data
  const initialFormData = useMemo(() => clubToFormData(initialClubData), [initialClubData]);

  // MYK9-1235: a club that has a number keeps at least one (see clubEditSchemaFor).
  // Memoized on the boolean so the schema is stable between renders.
  const requireClubNumber =
    mode === 'edit' && hasClubRegistryNumber(initialClubData.registryNumbers);
  const schema = useMemo(() => clubEditSchemaFor(requireClubNumber), [requireClubNumber]);

  // Handle save
  const handleSave = useCallback(
    async (formData: ClubEditFormData, context: EditPanelSaveContext) => {
      logger.debug('ClubEditPanel handleSave - Raw form data:', 'panels', { data: formData });
      const clubData = formDataToClub(formData);
      // Numbers that never loaded (or a create form, which has no number fields) must not be
      // saved as "none": that would delete what the club has.
      if (mode === 'create' || initialClubData.registryNumbers === undefined) {
        delete clubData.registryNumbers;
      }
      logger.debug('ClubEditPanel handleSave - Converted club data:', 'panels', { data: clubData });
      if (onSave) {
        await onSave(clubData, context);
      }
    },
    [onSave, mode, initialClubData.registryNumbers]
  );

  return (
    <EditPanelWrapper<ClubEditFormData>
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Add Club' : 'Edit Club'}
      subtitle={
        mode === 'create'
          ? 'Fill in the details for your new club'
          : `Editing profile for ${clubName}`
      }
      size="xl"
      initialData={initialFormData}
      onSave={handleSave}
      schema={schema}
      enableAutoSave={enableAutoSave}
      saveLabel={mode === 'create' ? 'Add Club' : 'Save Changes'}
      cancelLabel="Cancel"
      onDelete={mode === 'edit' ? onDelete : undefined}
      successMessage={data => {
        const name = data.name || clubName;
        return mode === 'create' ? addedMessage(name, 'Club') : savedMessage(name, 'Club');
      }}
      onValidationFail={handleValidationFail}
      steps={{
        mode,
        tabs: CLUB_TAB_ORDER.map(value => ({ value, label: CLUB_TAB_LABEL[value] })),
        activeTab,
        onTabChange: tab => setActiveTab(tab as ClubTabValue),
        locate: locateInvalidField,
      }}
    >
      <ClubEditForm
        clubId={clubId}
        mode={mode}
        onClose={onClose}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        registryNumbersPending={mode === 'edit' && initialClubData.registryNumbers === undefined}
        loadedNumbers={initialClubData.registryNumbers}
      />
    </EditPanelWrapper>
  );
};

export default ClubEditPanel;
