import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { Plus, Award, Save } from 'lucide-react';
import { DiscardChangesDialog } from './DiscardChangesDialog';
import { QualificationCard } from './JudgeQualificationFormCard';
import { canEditJudgeQualificationsList } from '@/features/judges/judgeQualificationsListState';
import {
  JudgeQualificationsLoadError,
  JudgeQualificationsLoading,
} from '@/features/judges/JudgeQualificationsListStatus';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useRBAC } from '@/hooks/useRBAC';
import { useJudgeQualifications, judgeQueryKeys } from '@/hooks/queries/useJudgeDatabase';
import { useCanWriteJudgeQualifications } from '@/features/judges/canWriteJudgeQualifications';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { JudgeQualification as DbJudgeQualification } from '@/types/judge-management';
import type { JudgeQualification } from '@/types/user-types';
import { toLocalDate } from '@/utils/date-format';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage, toYYYYMMDD } from '@myk9/core';
import { replaceJudgeQualifications } from '@/services/database/judges';
import type { CreateJudgeQualificationData } from '@/types/judge-management';

interface JudgeQualificationPanelProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  onSaved?: () => void;
}

function mapDbToUiQualification(q: DbJudgeQualification): JudgeQualification {
  return {
    judgeNumber: q.judge_number || '',
    organization: q.organization,
    level: q.qualification_level || '',
    showTypes: q.disciplines || [],
    disciplines: q.disciplines || [],
    certificationDate: q.date_obtained || '',
    dateObtained: q.date_obtained ? toLocalDate(q.date_obtained) : null,
    expirationDate: q.expiration_date ? new Date(q.expiration_date) : null,
    status: q.is_active ? 'Active' : q.suspension_date ? 'Suspended' : 'Expired',
  } as JudgeQualification;
}

function mapUiToDbQualification(
  qual: JudgeQualification,
  personId: string
): CreateJudgeQualificationData {
  return {
    person_id: personId,
    organization: qual.organization,
    qualification_level: qual.level || '',
    disciplines: qual.showTypes || qual.disciplines || [],
    ...(qual.judgeNumber ? { judge_number: qual.judgeNumber } : {}),
    date_obtained:
      qual.certificationDate ||
      (qual.dateObtained ? toYYYYMMDD(qual.dateObtained) : toYYYYMMDD(new Date())),
    ...(qual.expirationDate ? { expiration_date: toYYYYMMDD(qual.expirationDate) } : {}),
    is_active: qual.status === 'Active',
  };
}

export const JudgeQualificationPanel: React.FC<JudgeQualificationPanelProps> = ({
  open,
  onClose,
  userId,
  userName,
  onSaved,
}) => {
  const { user: currentUser } = useAuthContext();
  const { hasPermission } = useRBAC();
  const isQualificationWriter = useCanWriteJudgeQualifications();
  const queryClient = useQueryClient();

  // Fetch qualifications from DB using shared hook (returns a stable [] when
  // the query is idle so the useMemo dep stays stable).
  // MYK9-2382: a save replaces the whole list, so the form waits until the latest read succeeded.
  const { data: dbQualifications, listState, refetch } = useJudgeQualifications(userId);
  const listLoaded = canEditJudgeQualificationsList(listState);

  // Map DB-shaped data to UI-shaped data for form editing.
  const fetchedQualifications = useMemo(
    () => dbQualifications.map(mapDbToUiQualification),
    [dbQualifications]
  );

  // Local state for qualifications (editable copy)
  const [qualifications, setQualifications] = useState<JudgeQualification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // Derive change tracking from comparing local edits to fetched data
  const hasChanges =
    qualifications.length !== fetchedQualifications.length ||
    JSON.stringify(qualifications) !== JSON.stringify(fetchedQualifications);

  // Check if current user can edit judge qualifications
  const canEditQualifications = useCallback(() => {
    if (isQualificationWriter || hasPermission('admin:manage')) return true;
    if (hasPermission('show:manage')) return true;
    if (userId && currentUser?.id === userId) {
      return hasPermission('judge:manage_qualifications') || hasPermission('user:update');
    }
    return false;
  }, [isQualificationWriter, hasPermission, userId, currentUser?.id]);

  // Sync fetched qualifications into local state when query data changes
  useEffect(() => {
    setQualifications(fetchedQualifications);
  }, [fetchedQualifications]);

  // Add a new qualification
  const addQualification = useCallback(() => {
    const newQualification: JudgeQualification = {
      judgeNumber: '',
      organization: 'AKC',
      level: '',
      disciplines: [],
      dateObtained: null,
      expirationDate: null,
      showTypes: [],
      certificationDate: new Date().toISOString().split('T')[0],
      status: 'Active',
    };
    setQualifications(prev => [...prev, newQualification]);
  }, []);

  // Update a qualification
  const updateQualification = useCallback((index: number, updates: Partial<JudgeQualification>) => {
    setQualifications(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  }, []);

  // Remove a qualification
  const removeQualification = useCallback((index: number) => {
    setQualifications(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Toggle show type for a qualification
  const toggleShowType = useCallback((qualIndex: number, showType: string) => {
    setQualifications(prev => {
      const updated = [...prev];
      const qual = updated[qualIndex];
      const currentTypes = qual.showTypes || [];
      const newShowTypes = currentTypes.includes(showType)
        ? currentTypes.filter(t => t !== showType)
        : [...currentTypes, showType];
      updated[qualIndex] = { ...qual, showTypes: newShowTypes, disciplines: newShowTypes };
      return updated;
    });
  }, []);

  // Save qualifications — panel owns persistence since it always has the full list
  const handleSave = async () => {
    if (!listLoaded) return;
    try {
      setIsLoading(true);

      await replaceJudgeQualifications(
        userId,
        qualifications.map(qual => mapUiToDbQualification(qual, userId))
      );

      // Invalidate caches so the store and queries pick up the new data
      queryClient.invalidateQueries({ queryKey: judgeQueryKeys.qualificationsByJudge(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      // Edit show > Judges and Assign judge list judges from this query (MYK9-2382).
      queryClient.invalidateQueries({ queryKey: ['judges', 'withQualifications'] });

      onSaved?.();
      onClose();
    } catch (error) {
      logger.error('Failed to save qualifications:', 'components', {}, error as Error);
      notifications.error('Failed to save qualifications', {
        description: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle close with unsaved changes
  const handleClose = () => {
    if (hasChanges) {
      setShowDiscardDialog(true);
      return;
    }
    onClose();
  };

  const handleConfirmDiscard = () => {
    setShowDiscardDialog(false);
    setQualifications(fetchedQualifications);
    onClose();
  };

  // Early return if no permission
  if (!canEditQualifications()) {
    return (
      <SlideOverPanel
        open={open}
        onClose={onClose}
        title="Judge Qualifications"
        subtitle={`${userName} - View Only`}
        size="lg"
      >
        <div className="p-6">
          <div className="text-center py-8">
            <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Access Restricted</h3>
            <p className="text-sm text-muted-foreground">
              You don't have permission to edit judge qualifications for this user.
            </p>
          </div>
        </div>
      </SlideOverPanel>
    );
  }

  const footer = (
    <div className="flex items-center justify-between w-full">
      <div className="text-sm text-muted-foreground">
        {hasChanges && (
          <span className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            Unsaved changes
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isLoading || !listLoaded}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </div>
  );

  return (
    <SlideOverPanel
      open={open}
      onClose={handleClose}
      title="Judge Qualifications"
      subtitle={`Managing qualifications for ${userName}`}
      size="xl"
      loading={isLoading}
      footer={footer}
    >
      <div className="flex flex-col h-full">
        {/* Header Info */}
        <div className="flex-shrink-0 bg-muted/5 border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <Award className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-medium text-foreground">Judge Certification Management</h3>
              <p className="text-sm text-muted-foreground">
                Add, edit, or remove judge qualifications and certifications
              </p>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            {/* Qualifications List */}
            {/* MYK9-2394: no form until the latest read succeeded; a draft must not outlive it. */}
            <div className="space-y-4">
              {listState.kind === 'loading' ? (
                <JudgeQualificationsLoading offline={listState.offline} />
              ) : !listLoaded ? (
                <JudgeQualificationsLoadError
                  refresh={listState.kind === 'loaded'}
                  onRetry={() => void refetch()}
                />
              ) : qualifications.length > 0 ? (
                qualifications.map((qual, index) => (
                  <QualificationCard
                    key={index}
                    qualification={qual}
                    index={index}
                    onUpdate={updateQualification}
                    onRemove={removeQualification}
                    onToggleShowType={toggleShowType}
                  />
                ))
              ) : (
                <div className="text-center py-12">
                  <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Qualifications</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    This user has no judge qualifications yet. Add their first qualification to get
                    started.
                  </p>
                  <Button onClick={addQualification} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add First Qualification
                  </Button>
                </div>
              )}
            </div>

            {/* Add Button (if qualifications exist) */}
            {listLoaded && qualifications.length > 0 && (
              <Button
                variant="outline"
                onClick={addQualification}
                className="w-full bg-transparent bg-gradient-to-r from-primary/5 to-secondary/5 border-primary/20 hover:from-primary/10 hover:to-secondary/10 hover:border-primary/30 transition-all duration-300"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Another Qualification
              </Button>
            )}
          </div>
        </div>
      </div>

      <DiscardChangesDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
        onDiscard={handleConfirmDiscard}
      />
    </SlideOverPanel>
  );
};

export default JudgeQualificationPanel;
