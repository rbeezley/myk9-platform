import React, { useState, useEffect, useCallback } from 'react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Award, Save } from 'lucide-react';
import { useEnhancedAuth } from '@/hooks/useEnhancedAuth';
import { useRBAC } from '@/hooks/useRBAC';
import type { JudgeQualification } from '@/types/user-types';
import { cn } from '@/lib/utils';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';

interface JudgeQualificationPanelProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  initialQualifications?: JudgeQualification[];
  onSave?: (qualifications: JudgeQualification[]) => Promise<void>;
}

const JUDGE_ORGANIZATIONS = [
  { value: 'AKC', label: 'American Kennel Club (AKC)' },
  { value: 'UKC', label: 'United Kennel Club (UKC)' },
  { value: 'NACSW', label: 'North American Canine Scent Work (NACSW)' },
  { value: 'CPE', label: 'Canine Performance Events (CPE)' },
  { value: 'OTHER', label: 'Other' },
] as const;

const SHOW_TYPE_GROUPS = {
  'Performance Events': ['Agility', 'Rally', 'Scent Work', 'Obedience'],
  'Conformation & Breeding': ['Conformation'],
  'Field & Hunting': ['Field Trials', 'Hunt Tests', 'Lure Coursing'],
  'Specialty Events': ['Earthdog', 'Fast CAT', 'Dock Diving', 'Barn Hunt', 'Herding']
};

// const SHOW_TYPES = Object.values(SHOW_TYPE_GROUPS).flat();

export const JudgeQualificationPanel: React.FC<JudgeQualificationPanelProps> = ({
  open,
  onClose,
  userId,
  userName,
  initialQualifications = [],
  onSave
}) => {
  const { user: currentUser } = useEnhancedAuth();
  const { hasPermission } = useRBAC();
  
  // Local state for qualifications
  const [qualifications, setQualifications] = useState<JudgeQualification[]>(initialQualifications);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Check if current user can edit judge qualifications
  const canEditQualifications = useCallback(() => {
    // Site admins can always edit
    if (hasPermission('admin:manage')) return true;
    
    // Show secretaries can edit judge qualifications
    if (hasPermission('show:manage')) return true;
    
    // Users can edit their own qualifications if they are judges
    if (userId && currentUser?.id === userId) {
      return hasPermission('judge:manage_qualifications') || hasPermission('user:update');
    }
    
    return false;
  }, [hasPermission, userId, currentUser?.id]);

  // Update qualifications when initialQualifications changes
  useEffect(() => {
    if (initialQualifications) {
      setQualifications(initialQualifications);
      setHasChanges(false);
    }
  }, [initialQualifications]);

  // Track changes
  useEffect(() => {
    const hasChangesNow = JSON.stringify(qualifications) !== JSON.stringify(initialQualifications);
    setHasChanges(hasChangesNow);
  }, [qualifications, initialQualifications]);

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
      updated[qualIndex] = { ...qual, showTypes: newShowTypes };
      return updated;
    });
  }, []);

  // Save qualifications
  const handleSave = async () => {
    if (!onSave) return;
    
    try {
      setIsLoading(true);
      await onSave(qualifications);
      setHasChanges(false);
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
      // TODO: Show confirmation dialog
      const shouldClose = window.confirm('You have unsaved changes. Are you sure you want to close?');
      if (!shouldClose) return;
    }
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
        <Button
          variant="outline"
          onClick={handleClose}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isLoading}
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
                    This user has no judge qualifications yet. Add their first qualification to get started.
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
  onToggleShowType
}) => {
  return (
    <div className="border-0 rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 backdrop-blur-sm">
      {/* Card Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <h4 className="font-medium text-foreground">
              Qualification {index + 1}
            </h4>
          </div>
          <Badge 
            variant={qualification.status === 'Active' ? 'default' : 
                     qualification.status === 'Suspended' ? 'destructive' : 'secondary'}
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
            <Label htmlFor={`judgeNumber-${index}`} style={{color: 'rgba(148, 163, 184, 0.8)', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
              Judge Number *
            </Label>
            <Input
              id={`judgeNumber-${index}`}
              value={qualification.judgeNumber}
              onChange={(e) => onUpdate(index, { judgeNumber: e.target.value })}
              placeholder="12345"
              className="h-9"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={`organization-${index}`} style={{color: 'rgba(148, 163, 184, 0.8)', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
              Organization *
            </Label>
            <Select
              value={qualification.organization}
              onValueChange={(value) => onUpdate(index, { 
                organization: value as JudgeQualification['organization'] 
              })}
            >
              <SelectTrigger className="h-9 border-0 bg-input rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JUDGE_ORGANIZATIONS.map((org) => (
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
            <Label htmlFor={`status-${index}`} style={{color: 'rgba(148, 163, 184, 0.8)', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
              Status *
            </Label>
            <Select
              value={qualification.status}
              onValueChange={(value) => onUpdate(index, { 
                status: value as JudgeQualification['status'] 
              })}
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
            <Label htmlFor={`certificationDate-${index}`} style={{color: 'rgba(148, 163, 184, 0.8)', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
              Certification Date
            </Label>
            <Input
              id={`certificationDate-${index}`}
              type="date"
              value={qualification.certificationDate}
              onChange={(e) => onUpdate(index, { certificationDate: e.target.value })}
              className="h-9"
            />
          </div>
        </div>

        {/* Show Types Selection */}
        <div className="space-y-3">
          <Label style={{color: 'rgba(148, 163, 184, 0.8)', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Qualified Show Types</Label>
          <div className="border-0 rounded-xl p-4 bg-input">
            {Object.entries(SHOW_TYPE_GROUPS).map(([groupName, types]) => (
              <div key={groupName} className="mb-4 last:mb-0">
                <h5 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  {groupName}
                </h5>
                <div className="flex flex-wrap gap-2">
                  {types.map((showType) => {
                    const isSelected = qualification.showTypes.includes(showType);
                    return (
                      <button
                        key={showType}
                        type="button"
                        onClick={() => onToggleShowType(index, showType)}
                        className={cn(
                          "px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 hover:scale-105",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-background hover:bg-muted border-border text-foreground hover:border-border-hover"
                        )}
                      >
                        {isSelected && <span className="mr-1">✓</span>}
                        {showType}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          
          {/* Selected count */}
          {qualification.showTypes.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {qualification.showTypes.length} show type{qualification.showTypes.length !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JudgeQualificationPanel;