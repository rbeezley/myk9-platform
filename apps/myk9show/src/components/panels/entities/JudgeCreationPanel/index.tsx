import React, { useRef, useState, useCallback } from 'react';
import { usePanelSaveHandler } from '@/hooks/usePanelSaveHandler';
import { Button } from '@/components/ui/button';
import { Loader2, GraduationCap } from 'lucide-react';
import { useUserStore, PersonInput } from '@/store/userStore';
import { BasePanelProps } from '../../types';
import { UserRole } from '@/types/auth-types';
import type { JudgeInfo } from '@/types/user-types';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import type { JudgeFormData, ExpandedSections } from './types';
import { PersonalInfoSection } from './PersonalInfoSection';
import { AddressSection } from './AddressSection';
import { QualificationsSection } from './QualificationsSection';
import { CertificationsSection } from './CertificationsSection';
import { AvailabilitySection } from './AvailabilitySection';
import { DuplicateWarning, SubmitError } from './FormAlerts';

interface JudgeCreationPanelProps extends BasePanelProps {
  requiredCertifications?: string[];
  onStateChange?: (state: {
    isLoading: boolean;
    error: string | null;
    isDirty: boolean;
    isValid: boolean;
  }) => void;
}

export const JudgeCreationPanel: React.FC<JudgeCreationPanelProps> = ({
  panelId,
  context,
  onResult,
}) => {
  const { addUser, people } = useUserStore();

  const [formData, setFormData] = useState<JudgeFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    judgeNumber: '',
    qualifications: [],
    certifications: [],
    availability: {
      startDate: null,
      endDate: null,
      blackoutDates: [],
      maxShowsPerMonth: 4,
      travelRadius: 100,
    },
  });

  // Ref to avoid formData in useCallback deps (prevents handler re-registration on every keystroke)
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  // Track if form has been submitted - only show errors after first submit attempt
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [expandedSections, setExpandedSections] = useState<ExpandedSections>({
    qualifications: true,
    certifications: true,
    availability: false,
  });

  // Helper to get visible error (only show after first submit attempt)
  const getVisibleError = (field: string): string | undefined => {
    return hasSubmitted ? errors[field] : undefined;
  };

  // Validation — only name is required. Judge number, qualifications,
  // and certifications are optional (not stored in DB yet).
  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (formData.email.trim() && !/^\S+@\S+\.\S+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Check for duplicate judges
  const checkForDuplicates = useCallback(() => {
    const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.toLowerCase();
    const emailLower = formData.email.trim().toLowerCase();
    const judgeNumberLower = formData.judgeNumber.trim().toLowerCase();

    const existingJudge = people.find(person => {
      if (!person.roles?.includes(UserRole.JUDGE)) return false;

      const existingName = `${person.firstName} ${person.lastName}`.toLowerCase();
      const existingEmail = person.email?.toLowerCase();

      return (
        existingName === fullName ||
        existingEmail === emailLower ||
        (person.judgeInfo?.judgeNumber?.toLowerCase() === judgeNumberLower && judgeNumberLower)
      );
    });

    if (existingJudge) {
      let matchType = 'name';
      if (existingJudge.email?.toLowerCase() === emailLower) matchType = 'email';
      else if (existingJudge.judgeInfo?.judgeNumber?.toLowerCase() === judgeNumberLower)
        matchType = 'judge number';

      setDuplicateWarning(
        `A judge with this ${matchType} already exists: ${existingJudge.firstName} ${existingJudge.lastName}`
      );
      return true;
    }

    setDuplicateWarning(null);
    return false;
  }, [formData.firstName, formData.lastName, formData.email, formData.judgeNumber, people]);

  // Form handlers
  const handleInputChange = (field: keyof JudgeFormData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Clear duplicate warning when relevant fields change
    if (['firstName', 'lastName', 'email', 'judgeNumber'].includes(field) && duplicateWarning) {
      setDuplicateWarning(null);
    }
  };

  const handleAvailabilityChange = (field: keyof JudgeFormData['availability'], value: unknown) => {
    setFormData(prev => ({
      ...prev,
      availability: { ...prev.availability, [field]: value },
    }));
  };

  const handleSubmit = useCallback(
    async (action: 'save_close' | 'save_continue') => {
      // Mark that we've attempted to submit - this enables error display
      setHasSubmitted(true);

      if (!validateForm()) return;

      // Check for duplicates (but allow user to proceed)
      checkForDuplicates();

      setIsSubmitting(true);
      const fd = formDataRef.current;

      try {
        const judgeData: PersonInput & { roles?: string[]; judgeInfo?: JudgeInfo } = {
          firstName: fd.firstName.trim(),
          lastName: fd.lastName.trim(),
          email: fd.email.trim(),
          phone: fd.phone.trim(),
          address: {
            street: fd.address.trim(),
            city: fd.city.trim(),
            state: fd.state.trim(),
            zipCode: fd.zipCode.trim(),
            country: 'United States',
          },
          roles: ['judge'],
          judgeInfo: {
            judgeNumber: fd.judgeNumber.trim(),
            qualifications: fd.qualifications.map(qual => ({
              ...qual,
              judgeNumber: fd.judgeNumber.trim(),
              showTypes: [], // Default empty array
              certificationDate: qual.dateObtained
                ? new Date(qual.dateObtained).toISOString().split('T')[0]
                : '',
              status: 'Active' as const,
            })),
            certifications: fd.certifications,
            availability: fd.availability,
          },
        };

        const newJudge = await addUser(judgeData);

        logger.debug('Judge created successfully:', 'panels', { data: newJudge });

        notifications.success(`Judge ${fd.firstName} ${fd.lastName} created successfully`);

        // Call the selection callback if provided (may be async to refresh store)
        if (context.selectionCallback) {
          await context.selectionCallback(newJudge as unknown as Record<string, unknown>);
        }

        // Return result based on action
        onResult({
          success: true,
          entity: newJudge as unknown as Record<string, unknown>,
          action: action === 'save_close' ? 'save_and_close' : 'save_and_continue',
        });
      } catch (error) {
        logger.error('Failed to create judge:', 'components', {}, error as Error);
        notifications.error('Failed to create judge. Please try again.');
        setErrors({ submit: 'Failed to create judge. Please try again.' });
      } finally {
        setIsSubmitting(false);
      }
    },
    [validateForm, checkForDuplicates, addUser, context.selectionCallback, onResult]
  );

  // Register save handler for EntityCreationPanel footer buttons
  usePanelSaveHandler(panelId, handleSubmit);

  const handleCancel = () => {
    setHasSubmitted(false);
    onResult({
      success: false,
      action: 'cancel',
    });
  };

  const toggleSection = (section: keyof ExpandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Create New Judge</h3>
        </div>
        <p className="text-sm text-muted-foreground">Add a new qualified judge to the system</p>
      </div>

      <PersonalInfoSection
        formData={formData}
        errors={errors}
        getVisibleError={getVisibleError}
        onInputChange={handleInputChange}
      />

      <AddressSection formData={formData} onInputChange={handleInputChange} />

      <QualificationsSection
        formData={formData}
        isExpanded={expandedSections.qualifications}
        getVisibleError={getVisibleError}
        onToggleExpanded={() => toggleSection('qualifications')}
        onInputChange={handleInputChange}
      />

      <CertificationsSection
        formData={formData}
        isExpanded={expandedSections.certifications}
        getVisibleError={getVisibleError}
        onToggleExpanded={() => toggleSection('certifications')}
        onInputChange={handleInputChange}
      />

      <AvailabilitySection
        formData={formData}
        isExpanded={expandedSections.availability}
        onToggleExpanded={() => toggleSection('availability')}
        onAvailabilityChange={handleAvailabilityChange}
      />

      <DuplicateWarning message={duplicateWarning} />
      <SubmitError message={errors.submit} />

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={handleCancel} disabled={isSubmitting} className="flex-1">
          Cancel
        </Button>
        <Button
          onClick={() => handleSubmit('save_close')}
          disabled={isSubmitting}
          className="flex-1"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Creating...
            </>
          ) : (
            'Create Judge'
          )}
        </Button>
      </div>
    </div>
  );
};
