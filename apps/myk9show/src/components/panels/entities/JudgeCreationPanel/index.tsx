import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, GraduationCap } from 'lucide-react';
import { useUserStore, PersonInput } from '@/store/userStore';
import { BasePanelProps } from '../../types';
import type { JudgeInfo } from '@/types/user-types';
import { logger } from '@/services/LoggingService';
import type { JudgeFormData, ExpandedSections } from './types';
import { PersonalInfoSection } from './PersonalInfoSection';
import { AddressSection } from './AddressSection';
import { QualificationsSection } from './QualificationsSection';
import { CertificationsSection } from './CertificationsSection';
import { AvailabilitySection } from './AvailabilitySection';
import { DuplicateWarning, SubmitError } from './FormAlerts';

interface JudgeCreationPanelProps extends BasePanelProps {
  requiredCertifications?: string[];
  onStateChange?: (state: { isLoading: boolean; error: string | null; isDirty: boolean; isValid: boolean }) => void;
}

export const JudgeCreationPanel: React.FC<JudgeCreationPanelProps> = ({
  context,
  onResult,
  requiredCertifications = []
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

  // Validation
  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^\S+@\S+\.\S+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }

    if (!formData.judgeNumber.trim()) {
      newErrors.judgeNumber = 'Judge number is required';
    }

    if (formData.qualifications.length === 0) {
      newErrors.qualifications = 'At least one qualification is required';
    }

    // Check for required certifications
    requiredCertifications.forEach(reqCert => {
      const hasCert = formData.certifications.some(cert =>
        cert.name.toLowerCase().includes(reqCert.toLowerCase())
      );
      if (!hasCert) {
        newErrors.certifications = `${reqCert} certification is required`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, requiredCertifications]);

  // Check for duplicate judges
  const checkForDuplicates = useCallback(() => {
    const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.toLowerCase();
    const emailLower = formData.email.trim().toLowerCase();
    const judgeNumberLower = formData.judgeNumber.trim().toLowerCase();

    const existingJudge = people.find(person => {
      if (!person.roles?.includes('judge')) return false;

      const existingName = `${person.firstName} ${person.lastName}`.toLowerCase();
      const existingEmail = person.email?.toLowerCase();

      return existingName === fullName ||
             existingEmail === emailLower ||
             (person.judgeInfo?.judgeNumber?.toLowerCase() === judgeNumberLower && judgeNumberLower);
    });

    if (existingJudge) {
      let matchType = 'name';
      if (existingJudge.email?.toLowerCase() === emailLower) matchType = 'email';
      else if (existingJudge.judgeInfo?.judgeNumber?.toLowerCase() === judgeNumberLower) matchType = 'judge number';

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
      availability: { ...prev.availability, [field]: value }
    }));
  };

  const handleSubmit = async (action: 'save_close' | 'save_continue') => {
    // Mark that we've attempted to submit - this enables error display
    setHasSubmitted(true);

    if (!validateForm()) return;

    // Check for duplicates (but allow user to proceed)
    checkForDuplicates();

    setIsSubmitting(true);

    try {
      const judgeData: PersonInput & { roles?: string[]; judgeInfo?: JudgeInfo } = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        address: {
          street: formData.address.trim(),
          city: formData.city.trim(),
          state: formData.state.trim(),
          zipCode: formData.zipCode.trim(),
          country: 'United States',
        },
        roles: ['judge'],
        judgeInfo: {
          judgeNumber: formData.judgeNumber.trim(),
          qualifications: formData.qualifications.map(qual => ({
            ...qual,
            judgeNumber: formData.judgeNumber.trim(),
            showTypes: [], // Default empty array
            certificationDate: qual.dateObtained ? new Date(qual.dateObtained).toISOString().split('T')[0] : '',
            status: 'Active' as const
          })),
          certifications: formData.certifications,
          availability: formData.availability,
        },
      };

      const newJudge = await addUser(judgeData);

      logger.debug('Judge created successfully:', 'panels', { data: newJudge });

      // Call the selection callback if provided
      if (context.selectionCallback) {
        context.selectionCallback((newJudge as unknown) as Record<string, unknown>);
      }

      // Return result based on action
      onResult({
        success: true,
        entity: (newJudge as unknown) as Record<string, unknown>,
        action: action === 'save_close' ? 'save_and_close' : 'save_and_continue',
      });

    } catch (error) {
      logger.error('Failed to create judge:', 'components', {}, error as Error);
      setErrors({ submit: 'Failed to create judge. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <p className="text-sm text-muted-foreground">
          Add a new qualified judge to the system
        </p>
      </div>

      <PersonalInfoSection
        formData={formData}
        errors={errors}
        getVisibleError={getVisibleError}
        onInputChange={handleInputChange}
      />

      <AddressSection
        formData={formData}
        onInputChange={handleInputChange}
      />

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
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={isSubmitting}
          className="flex-1"
        >
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
