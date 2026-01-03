import React, { useState, useEffect } from 'react';
import { AppleDialog, AppleFormField, AppleFormGrid } from '@/components/ui/AppleDialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
// import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Plus, X, Award } from 'lucide-react';
import { useEnhancedAuth } from '@/hooks/useEnhancedAuth';
import { useRBAC } from '@/hooks/useRBAC';
import type { JudgeQualification } from '@/types/judge-types';

// Import Apple dialog styles
import '@/styles/apple-dialogs-global.css';

interface PersonEditDialogProps {
  open: boolean;
  formData: Record<string, unknown>;
  setFormData?: (data: Record<string, unknown>) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSubmit?: (e: React.FormEvent) => void;
  onSave?: () => void;
  onCancel: () => void;
  isEdit?: boolean;
  showNameField?: boolean;
  userId?: string; // ID of the user being edited
}

const JUDGE_ORGANIZATIONS = [
  { value: 'AKC', label: 'American Kennel Club (AKC)' },
  { value: 'UKC', label: 'United Kennel Club (UKC)' },
  { value: 'NACSW', label: 'North American Canine Scent Work (NACSW)' },
  { value: 'CPE', label: 'Canine Performance Events (CPE)' },
  { value: 'OTHER', label: 'Other' },
];

const SHOW_TYPE_GROUPS = {
  'Performance Events': ['Agility', 'Rally', 'Scent Work', 'Obedience'],
  'Conformation & Breeding': ['Conformation'],
  'Field & Hunting': ['Field Trials', 'Hunt Tests', 'Lure Coursing'],
  'Specialty Events': ['Earthdog', 'Fast CAT', 'Dock Diving', 'Barn Hunt', 'Herding']
};

// const SHOW_TYPES = Object.values(SHOW_TYPE_GROUPS).flat();

const PersonEditDialog: React.FC<PersonEditDialogProps> = ({
  open,
  
  formData,
  setFormData,
  onChange,
  onSubmit,
  onSave,
  onCancel,
  isEdit = false,
  showNameField = false,
  userId,
}) => {
  const { user: currentUser } = useEnhancedAuth();
  const { hasPermission } = useRBAC();
  
  // State for judge qualifications
  const [showQualifications, setShowQualifications] = useState(false);
  const [qualifications, setQualifications] = useState<JudgeQualification[]>(
    (formData.judgeQualifications as JudgeQualification[]) || []
  );
  
  // Check if current user can edit judge qualifications
  const canEditQualifications = () => {
    // Site admins can always edit
    if (hasPermission('admin:all')) return true;
    
    // Show secretaries can edit judge qualifications
    if (hasPermission('show:manage')) return true;
    
    // Judges can edit their own qualifications
    if (userId && currentUser?.id === userId) {
      const userRoles = formData.roles as string[] || [];
      return userRoles.includes('judge');
    }
    
    return false;
  };
  
  // Update qualifications when formData changes
  useEffect(() => {
    if (formData.judgeQualifications) {
      setQualifications(formData.judgeQualifications as JudgeQualification[]);
    }
  }, [formData.judgeQualifications]);
  
  // Add a new qualification
  const addQualification = () => {
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
    const updated = [...qualifications, newQualification];
    setQualifications(updated);
    if (setFormData) {
      setFormData({ ...formData, judgeQualifications: updated });
    }
  };
  
  // Update a qualification
  const updateQualification = (index: number, updates: Partial<JudgeQualification>) => {
    const updated = [...qualifications];
    updated[index] = { ...updated[index], ...updates };
    setQualifications(updated);
    if (setFormData) {
      setFormData({ ...formData, judgeQualifications: updated });
    }
  };
  
  // Remove a qualification
  const removeQualification = (index: number) => {
    const updated = qualifications.filter((_, i) => i !== index);
    setQualifications(updated);
    if (setFormData) {
      setFormData({ ...formData, judgeQualifications: updated });
    }
  };
  
  // Toggle show type for a qualification
  const toggleShowType = (qualIndex: number, showType: string) => {
    const qual = qualifications[qualIndex];
    const currentTypes = qual.showTypes || [];
    const updated = currentTypes.includes(showType)
      ? currentTypes.filter(t => t !== showType)
      : [...currentTypes, showType];
    updateQualification(qualIndex, { showTypes: updated });
  };
  // Handler fallback: prefer setFormData, fallback to onChange
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (onChange) return onChange(e);
    if (setFormData) {
      const { name, value } = e.target;
      setFormData({ ...formData, [name]: value });
    }
  };

  // Support both form and dialog save; always provide a function
  const handleSave = onSave
    || (onSubmit
      ? () => {
          const form = document.getElementById('person-edit-form');
          if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      : () => {});

  return (
    <AppleDialog
      open={open}
      onOpenChange={(open) => !open && onCancel()}
      onSave={handleSave}
      onCancel={onCancel}
      title={isEdit ? 'Edit User' : 'Edit Profile'}
      saveLabel={isEdit ? 'Save Changes' : 'Save'}
      cancelLabel="Cancel"
      maxWidth="lg"
    >
      <form id={onSubmit ? 'person-edit-form' : undefined} onSubmit={onSubmit} className="space-y-6">
        {showNameField ? (
          <AppleFormField label="Full Name" required>
            <Input 
              id="name" 
              name="name" 
              value={formData.name as string || ""} 
              onChange={handleInputChange} 
              required 
              className="form-input"
            />
          </AppleFormField>
        ) : (
          <AppleFormGrid columns={2}>
            <AppleFormField label="First Name" required>
              <Input 
                id="firstName" 
                name="firstName" 
                value={formData.firstName as string || ""} 
                onChange={handleInputChange} 
                required 
                className="form-input"
              />
            </AppleFormField>
            <AppleFormField label="Last Name" required>
              <Input 
                id="lastName" 
                name="lastName" 
                value={formData.lastName as string || ""} 
                onChange={handleInputChange} 
                required 
                className="form-input"
              />
            </AppleFormField>
          </AppleFormGrid>
        )}
        <AppleFormGrid columns={2}>
          <AppleFormField label="Email" required>
            <Input 
              id="email" 
              name="email" 
              type="email"
              value={formData.email as string || ""} 
              onChange={handleInputChange} 
              required 
              className="form-input"
            />
          </AppleFormField>
          <AppleFormField label="Phone" required>
            <Input 
              id="phone" 
              name="phone" 
              type="tel"
              value={formData.phone as string || ""} 
              onChange={handleInputChange} 
              required 
              className="form-input"
            />
          </AppleFormField>
        </AppleFormGrid>
        <AppleFormGrid columns={2}>
          <AppleFormField label="Address" required>
            <Input 
              id="address" 
              name="address" 
              value={formData.address as string || ""} 
              onChange={handleInputChange} 
              required 
              className="form-input"
            />
          </AppleFormField>
          <AppleFormField label="City" required>
            <Input 
              id="city" 
              name="city" 
              value={formData.city as string || ""} 
              onChange={handleInputChange} 
              required 
              className="form-input"
            />
          </AppleFormField>
        </AppleFormGrid>
        <AppleFormGrid columns={2}>
          <AppleFormField label="State" required>
            <Input 
              id="state" 
              name="state" 
              value={formData.state as string || ""} 
              onChange={handleInputChange} 
              required 
              className="form-input"
            />
          </AppleFormField>
          <AppleFormField label="Zip Code" required>
            <Input 
              id="zipCode" 
              name="zipCode" 
              value={formData.zipCode as string || ""} 
              onChange={handleInputChange} 
              required 
              className="form-input"
            />
          </AppleFormField>
        </AppleFormGrid>
        
        {/* Judge Qualifications Section - Only show if user has permission */}
        {canEditQualifications() && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" />
                <Label className="text-base font-semibold">Judge Qualifications</Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowQualifications(!showQualifications)}
              >
                {showQualifications ? 'Hide' : 'Show'}
              </Button>
            </div>
            
            {showQualifications && (
              <div className="border-t pt-4 space-y-4">
                {/* Scrollable qualifications container */}
                <div className="judge-qualifications-container space-y-3">
                  {qualifications.map((qual, index) => (
                    <div key={index} className="p-3 border rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm text-foreground">Qualification {index + 1}</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeQualification(index)}
                          className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      {/* Compact form layout */}
                      <div className="space-y-3">
                        <AppleFormGrid columns={2}>
                          <AppleFormField label="Judge Number" required>
                            <Input
                              value={qual.judgeNumber}
                              onChange={(e) => updateQualification(index, { judgeNumber: e.target.value })}
                              placeholder="12345"
                              className="form-input h-9 text-sm"
                            />
                          </AppleFormField>
                          
                          <AppleFormField label="Organization" required>
                            <Select
                              value={qual.organization}
                              onValueChange={(value) => updateQualification(index, { 
                                organization: value as JudgeQualification['organization'] 
                              })}
                            >
                              <SelectTrigger className="form-select h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {JUDGE_ORGANIZATIONS.map((org) => (
                                  <SelectItem key={org.value} value={org.value} className="text-sm">
                                    {org.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </AppleFormField>
                        </AppleFormGrid>
                        
                        <AppleFormGrid columns={2}>
                          <AppleFormField label="Status" required>
                            <Select
                              value={qual.status}
                              onValueChange={(value) => updateQualification(index, { 
                                status: value as JudgeQualification['status'] 
                              })}
                            >
                              <SelectTrigger className="form-select h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Active" className="text-sm">Active</SelectItem>
                                <SelectItem value="Suspended" className="text-sm">Suspended</SelectItem>
                                <SelectItem value="Expired" className="text-sm">Expired</SelectItem>
                              </SelectContent>
                            </Select>
                          </AppleFormField>
                          
                          <AppleFormField label="Certification Date">
                            <Input
                              type="date"
                              value={qual.certificationDate}
                              onChange={(e) => updateQualification(index, { certificationDate: e.target.value })}
                              className="form-input h-9 text-sm"
                            />
                          </AppleFormField>
                        </AppleFormGrid>
                        
                        {/* Tag-based show types selection */}
                        <div className="space-y-3">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Qualified Show Types</Label>
                          <div className="show-types-container border border-border/50 rounded-md p-4 bg-background/50">
                            {Object.entries(SHOW_TYPE_GROUPS).map(([groupName, types]) => (
                              <div key={groupName} className="mb-4 last:mb-0">
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                                  {groupName}
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {types.map((showType) => {
                                    const isSelected = qual.showTypes.includes(showType);
                                    return (
                                      <button
                                        key={showType}
                                        type="button"
                                        onClick={() => toggleShowType(index, showType)}
                                        className={`
                                          px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 hover:scale-105
                                          ${
                                            isSelected
                                              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                              : 'bg-background hover:bg-muted border-border text-foreground hover:border-border-hover'
                                          }
                                        `}
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
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {qualifications.length === 0 && (
                    <div className="text-center py-6">
                      <Award className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No judge qualifications added yet.
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Add qualification button - always visible */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={addQualification}
                  className="w-full bg-gradient-to-r from-primary/5 to-secondary/5 border-primary/20 hover:from-primary/10 hover:to-secondary/10 hover:border-primary/30 transition-all duration-300"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Judge Qualification
                </Button>
              </div>
            )}
          </div>
        )}
      </form>
    </AppleDialog>
  );
};

export default PersonEditDialog;
