import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { JudgeQualificationPanel } from './JudgeQualificationPanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { User, Phone, Award, CalendarDays } from 'lucide-react';
import ProfilePhotoDialog from '@/components/users/ProfilePhotoDialog';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useRBAC } from '@/hooks/useRBAC';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { JudgeQualification, JudgeInfo } from '@/types/user-types';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { useUserStore } from '@/store/userStore';
import AvailabilityFormFields from '@/components/judges/AvailabilityFormFields';

import type { UserEditPanelProps, UserFormData } from './UserEditPanel.types';
import { validateUserData, userToFormData, formDataToUser } from './UserEditPanel.helpers';
import { BasicInfoTab } from './BasicInfoTab';
import { ContactInfoTab } from './ContactInfoTab';
import { QualificationsTab } from './QualificationsTab';

// Re-export types for consumers that may need them
export type { UserEditPanelProps, UserFormData } from './UserEditPanel.types';

const TAB_TRIGGER_CLASS =
  'gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300';

// Form content component
const UserEditForm: React.FC<{ userId: string }> = ({ userId }) => {
  const { data, updateData, errors } = useEditPanel<UserFormData>();
  const { user: currentUser } = useAuthContext();
  const { hasPermission } = useRBAC();
  const queryClient = useQueryClient();
  const { loadUsers } = useUserStore();

  // Judge qualifications panel state
  const [isQualificationsPanelOpen, setIsQualificationsPanelOpen] = useState(false);

  // Load qualifications from DB (the people store doesn't include them)
  const [qualsLoaded, setQualsLoaded] = useState(false);
  useEffect(() => {
    if (qualsLoaded) return;
    let cancelled = false;
    (async () => {
      const { judgeQualificationQueries } =
        await import('@/services/database/queries/judgeQueries');
      const dbQuals = await judgeQualificationQueries.getByJudgeId(userId);
      if (cancelled || dbQuals.length === 0) {
        setQualsLoaded(true);
        return;
      }
      const mapped: JudgeQualification[] = dbQuals.map(
        (q: Record<string, unknown>) =>
          ({
            organization: q.organization as string,
            level: q.qualification_level as string,
            showTypes: (q.disciplines as string[]) || [],
            disciplines: (q.disciplines as string[]) || [],
            certificationDate: q.date_obtained as string,
            status: q.is_active ? 'Active' : 'Inactive',
          }) as JudgeQualification
      );
      updateData({ judgeQualifications: mapped });
      setQualsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, qualsLoaded, updateData]);

  // Profile photo dialog state
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Judge availability state
  const isJudge = data.roles.includes('judge');
  const [availability, setAvailability] = useState<JudgeInfo['availability']>({
    startDate: null,
    endDate: null,
    blackoutDates: [],
    maxShowsPerMonth: 4,
    travelRadius: 100,
  });
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);

  // Load availability from DB on mount for judges
  useEffect(() => {
    if (!isJudge || availabilityLoaded) return;
    let cancelled = false;

    const loadAvailability = async () => {
      try {
        const { judgeAvailabilityQueries } =
          await import('@/services/database/queries/judgeQueries');
        const { mapDbAvailabilityToUI } = await import('@/services/mappers/userMappers');
        const dbData = await judgeAvailabilityQueries.getByPersonId(userId);
        if (!cancelled && dbData) {
          setAvailability(mapDbAvailabilityToUI(dbData));
        }
      } catch {
        // No availability record -- use defaults
      } finally {
        if (!cancelled) setAvailabilityLoaded(true);
      }
    };

    loadAvailability();
    return () => {
      cancelled = true;
    };
  }, [isJudge, userId, availabilityLoaded]);

  const handleAvailabilityChange = useCallback(
    (field: keyof JudgeInfo['availability'], value: unknown) => {
      setAvailability(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleAvailabilitySave = useCallback(async () => {
    try {
      const { judgeAvailabilityQueries } = await import('@/services/database/queries/judgeQueries');
      const { mapUIAvailabilityToDb } = await import('@/services/mappers/userMappers');

      await judgeAvailabilityQueries.upsert(mapUIAvailabilityToDb(userId, availability));

      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      loadUsers();

      notifications.success('Availability saved');
    } catch (error) {
      logger.error('Failed to save availability', 'judges', { userId }, error as Error);
      notifications.error('Failed to save availability');
    }
  }, [availability, userId, queryClient, loadUsers]);

  // Check permissions
  const canEditQualifications = useMemo(() => {
    if (hasPermission('admin:manage')) return true;
    if (hasPermission('show:manage')) return true;
    if (currentUser?.id) {
      return hasPermission('judge:manage_qualifications') || hasPermission('user:update');
    }
    return false;
  }, [hasPermission, currentUser?.id]);

  const canEditAdvancedFields = useMemo(() => {
    return hasPermission('admin:manage') || hasPermission('user:manage_advanced');
  }, [hasPermission]);

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

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  // Handle qualifications save -- persist to DB then update form state
  const handleQualificationsSave = useCallback(
    async (qualifications: JudgeQualification[]) => {
      const { judgeQualificationQueries } =
        await import('@/services/database/queries/judgeQueries');

      // Delete existing qualifications for this person
      const existing = await judgeQualificationQueries.getByJudgeId(userId);
      await Promise.all(existing.map(q => judgeQualificationQueries.delete(q.id)));

      // Create new qualifications
      for (const qual of qualifications) {
        try {
          await judgeQualificationQueries.create({
            person_id: userId,
            organization: qual.organization,
            qualification_level: qual.level || 'Regular',
            disciplines: qual.disciplines || qual.showTypes || [],
            date_obtained:
              qual.certificationDate ||
              (qual.dateObtained
                ? new Date(qual.dateObtained as unknown as string).toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0]),
            ...(qual.expirationDate
              ? {
                  expiration_date: new Date(qual.expirationDate as unknown as string)
                    .toISOString()
                    .split('T')[0],
                }
              : {}),
            is_active: qual.status === 'Active',
          });
        } catch (err) {
          throw err;
        }
      }
      // Invalidate caches so the store and queries pick up the new data
      queryClient.invalidateQueries({ queryKey: ['judgeQualifications', userId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      loadUsers();

      updateData({ judgeQualifications: qualifications });
      setIsQualificationsPanelOpen(false);
    },
    [updateData, userId, queryClient, loadUsers]
  );

  return (
    <div className="space-y-6 p-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList
          className={`grid w-full ${isJudge ? 'grid-cols-4' : 'grid-cols-2'} bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out`}
        >
          <TabsTrigger value="basic" className={TAB_TRIGGER_CLASS}>
            <User className="h-4 w-4" />
            Basic Info
          </TabsTrigger>
          <TabsTrigger value="contact" className={TAB_TRIGGER_CLASS}>
            <Phone className="h-4 w-4" />
            Contact
          </TabsTrigger>
          {isJudge && (
            <TabsTrigger value="qualifications" className={TAB_TRIGGER_CLASS}>
              <Award className="h-4 w-4" />
              Qualifications
            </TabsTrigger>
          )}
          {isJudge && (
            <TabsTrigger value="availability" className={TAB_TRIGGER_CLASS}>
              <CalendarDays className="h-4 w-4" />
              Availability
            </TabsTrigger>
          )}
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent
          value="basic"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <BasicInfoTab
            data={data}
            personId={userId}
            errors={errors}
            updateData={updateData}
            hasAdminPermission={hasPermission('admin:manage')}
            canEditAdvancedFields={canEditAdvancedFields}
            onOpenPhotoModal={() => setIsPhotoModalOpen(true)}
          />

          {hasPermission('manage_users') && (
            <div className="space-y-2">
              <Label className="text-sm font-[590]">Account Status</Label>
              <Select
                value={data.status}
                onValueChange={value => {
                  if (value === 'suspended' && data.status !== 'suspended') {
                    const confirmed = window.confirm(
                      'This will immediately block this user from logging in. Continue?'
                    );
                    if (!confirmed) return;
                  }
                  updateData({ status: value as 'active' | 'suspended' });
                }}
                disabled={userId === currentUser?.id}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
              {userId === currentUser?.id && (
                <p className="text-xs text-muted-foreground">You cannot suspend your own account</p>
              )}
            </div>
          )}
        </TabsContent>

        {/* Contact Information Tab */}
        <TabsContent
          value="contact"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <ContactInfoTab
            data={data}
            errors={errors}
            updateData={updateData}
            canEditAdvancedFields={canEditAdvancedFields}
          />
        </TabsContent>

        {/* Qualifications Tab - Only for Judges */}
        {isJudge && (
          <TabsContent
            value="qualifications"
            className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
          >
            <QualificationsTab
              personId={userId}
              canEditQualifications={canEditQualifications}
              onManageQualifications={() => setIsQualificationsPanelOpen(true)}
            />
          </TabsContent>
        )}

        {/* Availability Tab - Only for Judges */}
        {isJudge && (
          <TabsContent
            value="availability"
            className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
          >
            <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Judge Availability
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <AvailabilityFormFields
                  availability={availability}
                  onFieldChange={handleAvailabilityChange}
                />

                <Separator />

                <div className="flex justify-end">
                  <Button onClick={handleAvailabilitySave} className="gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Save Availability
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Judge Qualifications Panel */}
      {canEditQualifications && (
        <JudgeQualificationPanel
          open={isQualificationsPanelOpen}
          onClose={() => setIsQualificationsPanelOpen(false)}
          userId={userId}
          userName={`${data.firstName} ${data.lastName}`}
          initialQualifications={data.judgeQualifications || []}
          onSave={handleQualificationsSave}
        />
      )}

      {/* Profile Photo Dialog */}
      <ProfilePhotoDialog
        open={isPhotoModalOpen}
        onOpenChange={setIsPhotoModalOpen}
        previewImage={previewImage}
        currentPhoto={data.profileImage || ''}
        isDragging={isDragging}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onFileInput={handleFileInput}
        onCancel={() => {
          setIsPhotoModalOpen(false);
          setPreviewImage(null);
        }}
        onSave={() => {
          if (previewImage) {
            updateData({ profileImage: previewImage });
          }
          setIsPhotoModalOpen(false);
          setPreviewImage(null);
        }}
      />
    </div>
  );
};

// Main component
export const UserEditPanel: React.FC<UserEditPanelProps> = ({
  open,
  onClose,
  userId,
  userName,
  initialUserData,
  onSave,
  enableAutoSave = false,
  // showAdvancedFields = false,
}) => {
  const queryClient = useQueryClient();
  // Convert user data to form data
  const initialFormData = useMemo(() => userToFormData(initialUserData), [initialUserData]);

  // Handle save — persist form data + role changes
  const handleSave = useCallback(
    async (formData: UserFormData) => {
      const userData = formDataToUser(formData);

      // Save roles to user_roles table (separate from people table)
      if (userId && formData.roles) {
        const { savePersonRoles } = await import('./BasicInfoTab');
        await savePersonRoles(userId, formData.roles);
        // Invalidate the role query cache so reopening shows fresh data
        queryClient.invalidateQueries({ queryKey: ['personRoles', userId] });
      }

      if (onSave) {
        await onSave(userData);
      }
    },
    [onSave, userId]
  );

  return (
    <EditPanelWrapper<UserFormData>
      open={open}
      onClose={onClose}
      title="Edit User"
      subtitle={`Editing profile for ${userName}`}
      size="xl"
      initialData={initialFormData}
      onSave={handleSave}
      validateData={validateUserData}
      enableAutoSave={enableAutoSave}
      saveLabel="Save Changes"
      cancelLabel="Cancel"
    >
      <UserEditForm userId={userId} />
    </EditPanelWrapper>
  );
};

export default UserEditPanel;
