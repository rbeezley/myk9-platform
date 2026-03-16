import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Award, Save, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog/alert-dialog';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useRBAC } from '@/hooks/useRBAC';
import { useJudgeQualifications, judgeQueryKeys } from '@/hooks/queries/useJudgeDatabase';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { JudgeQualification as DbJudgeQualification } from '@/types/judge-management';
import type { JudgeQualification } from '@/types/user-types';
import { cn } from '@/lib/utils';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage, toYYYYMMDD } from '@myk9/core';
import { judgeQualificationQueries } from '@/services/database/queries/judgeQueries';
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
    dateObtained: q.date_obtained ? new Date(q.date_obtained) : null,
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

const JUDGE_ORGANIZATIONS = [
  { value: 'AKC', label: 'American Kennel Club (AKC)' },
  { value: 'UKC', label: 'United Kennel Club (UKC)' },
  { value: 'NACSW', label: 'North American Canine Scent Work (NACSW)' },
  { value: 'CPE', label: 'Canine Performance Events (CPE)' },
  { value: 'OTHER', label: 'Other' },
] as const;

// Organization-specific disciplines sourced from official org websites:
// AKC: akc.org/sports/ and akc.org/sports/titles-and-abbreviations/titles-by-sport/
// UKC: ukcdogs.com/all-breed-sports
// NACSW: nacsw.net/understanding-nw1-nw2-nw3-levels-competition
// CPE: cpe.dog (2026 Agility Rulebook)
const SHOW_TYPE_GROUPS_BY_ORG: Record<string, Record<string, string[]>> = {
  AKC: {
    'Companion Events': ['Agility', 'Obedience', 'Rally', 'Tracking'],
    'Scent Sports': ['Scent Work', 'Barn Hunt'],
    Conformation: ['Conformation'],
    'Field Events': ['Field Trials', 'Hunt Tests', 'Herding', 'Earthdog', 'Lure Coursing'],
    'Other AKC Events': ['Fast CAT', 'Dock Diving', 'Flyball'],
  },
  UKC: {
    'Companion Events': ['Agility', 'Obedience', 'Rally Obedience'],
    'Nose & Scent': ['Nosework'],
    Conformation: ['Conformation'],
    'Hunting & Field': [
      'Coonhound Events',
      'Cur/Feist Events',
      'Pointing Dog',
      'Hunting Retriever',
    ],
    'Other UKC Events': [
      'Dock Jumping',
      'Lure Coursing',
      'Precision Coursing',
      'Weight Pull',
      'Drag Racing',
    ],
  },
  NACSW: {
    'Trial Levels': ['NW1', 'NW2', 'NW3'],
    Advanced: ['Elite Division', 'Summit League', 'Element Specialty'],
  },
  CPE: {
    'Agility Games': [
      'Standard',
      'Jumpers',
      'Colors',
      'Wildcard',
      'Snooker',
      'Jackpot',
      'Full House',
    ],
    'Other CPE Sports': ['Canine Scent Sport', 'SpeedWay'],
  },
  OTHER: {
    General: ['Agility', 'Obedience', 'Rally', 'Conformation', 'Scent Work', 'Other'],
  },
};

function getShowTypeGroups(org: string): Record<string, string[]> {
  return SHOW_TYPE_GROUPS_BY_ORG[org] || SHOW_TYPE_GROUPS_BY_ORG.OTHER;
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
  const queryClient = useQueryClient();

  // Fetch qualifications from DB using shared hook
  const { data: dbQualifications = [] } = useJudgeQualifications(userId);

  // Map DB-shaped data to UI-shaped data for form editing
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
    if (hasPermission('admin:manage')) return true;
    if (hasPermission('show:manage')) return true;
    if (userId && currentUser?.id === userId) {
      return hasPermission('judge:manage_qualifications') || hasPermission('user:update');
    }
    return false;
  }, [hasPermission, userId, currentUser?.id]);

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
    try {
      setIsLoading(true);

      // Replace all qualifications in a single bulk delete + parallel create
      await judgeQualificationQueries.deleteByPersonId(userId);
      await Promise.all(
        qualifications.map(qual =>
          judgeQualificationQueries.create(mapUiToDbQualification(qual, userId))
        )
      );

      // Invalidate caches so the store and queries pick up the new data
      queryClient.invalidateQueries({ queryKey: judgeQueryKeys.qualificationsByJudge(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });

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
        <Button onClick={handleSave} disabled={!hasChanges || isLoading} className="gap-2">
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
            <div className="space-y-4">
              {qualifications.length > 0 ? (
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
            {qualifications.length > 0 && (
              <Button
                variant="outline"
                onClick={addQualification}
                className="w-full bg-gradient-to-r from-primary/5 to-secondary/5 border-primary/20 hover:from-primary/10 hover:to-secondary/10 hover:border-primary/30 transition-all duration-300"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Another Qualification
              </Button>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Unsaved Changes
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to judge qualifications. Are you sure you want to close? Your
              changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDiscardDialog(false)}>
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SlideOverPanel>
  );
};

// Individual qualification card component
interface QualificationCardProps {
  qualification: JudgeQualification;
  index: number;
  onUpdate: (index: number, updates: Partial<JudgeQualification>) => void;
  onRemove: (index: number) => void;
  onToggleShowType: (qualIndex: number, showType: string) => void;
}

const QualificationCard: React.FC<QualificationCardProps> = ({
  qualification,
  index,
  onUpdate,
  onRemove,
  onToggleShowType,
}) => {
  return (
    <div className="border-0 rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 backdrop-blur-sm">
      {/* Card Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <h4 className="font-medium text-foreground">Qualification {index + 1}</h4>
          </div>
          <Badge
            variant={
              qualification.status === 'Active'
                ? 'default'
                : qualification.status === 'Suspended'
                  ? 'destructive'
                  : 'secondary'
            }
            className="text-xs"
          >
            {qualification.status}
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Card Content */}
      <div className="p-4 space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label
              htmlFor={`judgeNumber-${index}`}
              style={{
                color: 'rgba(148, 163, 184, 0.8)',
                fontSize: '12px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Judge Number *
            </Label>
            <Input
              id={`judgeNumber-${index}`}
              value={qualification.judgeNumber}
              onChange={e => onUpdate(index, { judgeNumber: e.target.value })}
              placeholder="12345"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor={`organization-${index}`}
              style={{
                color: 'rgba(148, 163, 184, 0.8)',
                fontSize: '12px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Organization *
            </Label>
            <Select
              value={qualification.organization}
              onValueChange={value =>
                onUpdate(index, {
                  organization: value as JudgeQualification['organization'],
                  showTypes: [],
                  disciplines: [],
                })
              }
            >
              <SelectTrigger className="h-9 border-0 bg-input rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JUDGE_ORGANIZATIONS.map(org => (
                  <SelectItem key={org.value} value={org.value}>
                    {org.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label
              htmlFor={`status-${index}`}
              style={{
                color: 'rgba(148, 163, 184, 0.8)',
                fontSize: '12px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Status *
            </Label>
            <Select
              value={qualification.status}
              onValueChange={value =>
                onUpdate(index, {
                  status: value as JudgeQualification['status'],
                })
              }
            >
              <SelectTrigger className="h-9 border-0 bg-input rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Suspended">Suspended</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor={`certificationDate-${index}`}
              style={{
                color: 'rgba(148, 163, 184, 0.8)',
                fontSize: '12px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Certification Date
            </Label>
            <Input
              id={`certificationDate-${index}`}
              type="date"
              value={qualification.certificationDate}
              onChange={e => onUpdate(index, { certificationDate: e.target.value })}
              className="h-9"
            />
          </div>
        </div>

        {/* Show Types Selection */}
        <div className="space-y-3">
          <Label
            style={{
              color: 'rgba(148, 163, 184, 0.8)',
              fontSize: '12px',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Qualified Show Types
          </Label>
          <div className="border-0 rounded-xl p-4 bg-input">
            {Object.entries(getShowTypeGroups(qualification.organization)).map(
              ([groupName, types]) => (
                <div key={groupName} className="mb-4 last:mb-0">
                  <h5 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                    {groupName}
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {types.map(showType => {
                      const isSelected = qualification.showTypes.includes(showType);
                      return (
                        <button
                          key={showType}
                          type="button"
                          onClick={() => onToggleShowType(index, showType)}
                          className={cn(
                            'px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 hover:scale-105',
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                              : 'bg-background hover:bg-muted border-border text-foreground hover:border-border-hover'
                          )}
                        >
                          {isSelected && <span className="mr-1">✓</span>}
                          {showType}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>

          {/* Selected count */}
          {qualification.showTypes.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {qualification.showTypes.length} show type
              {qualification.showTypes.length !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JudgeQualificationPanel;
