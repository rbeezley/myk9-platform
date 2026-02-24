import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, User, AlertTriangle } from 'lucide-react';
import { useUserStore, PersonInput } from '@/store/userStore';
import { BasePanelProps } from '../types';
import type { UserRole } from '@/types/user-types';
import { logger } from '@/services/LoggingService';

interface PersonFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  role?: UserRole;
}

const PERSON_ROLES: { value: UserRole; label: string }[] = [
  { value: 'exhibitor', label: 'Exhibitor' },
  { value: 'handler', label: 'Handler' },
  { value: 'judge', label: 'Judge' },
  { value: 'chairman', label: 'Chairman' },
  { value: 'secretary', label: 'Secretary' },
  { value: 'steward', label: 'Steward' },
  { value: 'admin', label: 'Administrator' },
];

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

interface PersonCreationPanelProps extends BasePanelProps {
  role?: 'chairman' | 'secretary' | 'judge' | 'exhibitor';
  onStateChange?: (state: { isLoading: boolean; error: string | null; isDirty: boolean; isValid: boolean }) => void;
  showActions?: boolean; // Controls whether to show action buttons
}

export const UserCreationPanel: React.FC<PersonCreationPanelProps> = ({
  context,
  onResult,
  onStateChange,
  showActions = true // Default to showing actions for standalone use
}) => {
  const { addUser, updateUser, people } = useUserStore();

  const [formData, setFormData] = useState<PersonFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    role: context.preFilledData?.role as UserRole || 'exhibitor',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [existingPerson, setExistingPerson] = useState<typeof people[0] | null>(null);
  // Track if form has been submitted - only show errors after first submit attempt
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Helper to get visible error (only show after first submit attempt)
  const getVisibleError = (field: string): string | undefined => {
    return hasSubmitted ? errors[field] : undefined;
  };
  
  // Track previous state to prevent unnecessary updates
  const previousStateRef = useRef<{
    isLoading: boolean;
    error: string | null;
    isDirty: boolean;
    isValid: boolean;
  }>({
    isLoading: false,
    error: null,
    isDirty: false,
    isValid: false,
  });

  // Extract complex expression to a variable
  const errorCount = Object.keys(errors).length;
  
  // Memoize state calculation using individual primitive values instead of formData object
  const currentState = useMemo(() => {
    const isDirty = Boolean(
      formData.firstName || 
      formData.lastName || 
      formData.email || 
      formData.phone || 
      formData.address || 
      formData.city || 
      formData.state || 
      formData.zipCode
    );
    const isValid = Boolean(
      errorCount === 0 && 
      formData.firstName.trim() && 
      formData.lastName.trim() && 
      formData.email.trim()
    );
    
    return {
      isLoading: isSubmitting,
      error: errors.submit || null,
      isDirty,
      isValid
    };
  }, [
    isSubmitting,
    errors.submit,
    // Individual primitive values instead of formData object
    formData.firstName,
    formData.lastName,
    formData.email,
    formData.phone,
    formData.address,
    formData.city,
    formData.state,
    formData.zipCode,
    errorCount
  ]);

  // Stable callback to report state changes
  const reportStateChange = useCallback(() => {
    if (!onStateChange) return;
    
    const prev = previousStateRef.current;
    const current = currentState;
    
    // Only call onStateChange if state actually changed
    if (
      prev.isLoading !== current.isLoading ||
      prev.error !== current.error ||
      prev.isDirty !== current.isDirty ||
      prev.isValid !== current.isValid
    ) {
      previousStateRef.current = current;
      onStateChange(current);
    }
  }, [onStateChange, currentState]);

  // Report state changes when currentState changes
  useEffect(() => {
    reportStateChange();
  }, [reportStateChange]);

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
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }

    if (!formData.address.trim()) {
      newErrors.address = 'Address is required';
    }

    if (!formData.city.trim()) {
      newErrors.city = 'City is required';
    }

    if (!formData.state.trim()) {
      newErrors.state = 'State is required';
    }

    if (!formData.zipCode.trim()) {
      newErrors.zipCode = 'ZIP code is required';
    } else if (!/^\d{5}(-\d{4})?$/.test(formData.zipCode)) {
      newErrors.zipCode = 'Please enter a valid ZIP code (12345 or 12345-6789)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Check for duplicate people
  const checkForDuplicates = useCallback(() => {
    const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.toLowerCase();
    const emailLower = formData.email.trim().toLowerCase();

    const foundPerson = people.find(person => {
      const existingName = `${person.firstName} ${person.lastName}`.toLowerCase();
      const existingEmail = person.email?.toLowerCase();

      return existingName === fullName || existingEmail === emailLower;
    });

    if (foundPerson) {
      const matchType = `${foundPerson.firstName} ${foundPerson.lastName}`.toLowerCase() === fullName
        ? 'name' : 'email';
      setDuplicateWarning(
        `A person with this ${matchType} already exists: ${foundPerson.firstName} ${foundPerson.lastName}`
      );
      setExistingPerson(foundPerson);
      return true;
    }

    setDuplicateWarning(null);
    setExistingPerson(null);
    return false;
  }, [formData.firstName, formData.lastName, formData.email, people]);

  // Real-time duplicate check as user types name or email
  useEffect(() => {
    // Only check if we have at least first name + last name OR email with 3+ chars
    const hasName = formData.firstName.trim().length >= 2 && formData.lastName.trim().length >= 2;
    const hasEmail = formData.email.trim().length >= 5 && formData.email.includes('@');

    if (hasName || hasEmail) {
      checkForDuplicates();
    } else {
      // Clear warning if not enough info
      setDuplicateWarning(null);
      setExistingPerson(null);
    }
  }, [formData.firstName, formData.lastName, formData.email, checkForDuplicates]);

  // Form handlers
  const handleInputChange = (field: keyof PersonFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    // Note: Duplicate checking is now handled by the real-time useEffect
  };

  // Use existing person and add the new role
  const handleUseExistingPerson = async () => {
    if (!existingPerson || !formData.role) return;

    setIsSubmitting(true);

    try {
      // Get existing roles and add the new one if not present
      const currentRoles = existingPerson.roles || [];
      const newRole = formData.role;

      if (!currentRoles.includes(newRole)) {
        // Update the person with the new role added
        const updatedRoles = [...currentRoles, newRole];
        await updateUser(existingPerson.id, { roles: updatedRoles });
        logger.debug('✅ Added role to existing person:', 'panels', {
          person: `${existingPerson.firstName} ${existingPerson.lastName}`,
          newRole,
          updatedRoles
        });
      } else {
        logger.debug('ℹ️ Person already has role:', 'panels', {
          person: `${existingPerson.firstName} ${existingPerson.lastName}`,
          role: newRole
        });
      }

      // Call the selection callback with the existing person (may be async to refresh store)
      if (context.selectionCallback) {
        await context.selectionCallback((existingPerson as unknown) as Record<string, unknown>);
      }

      // Return success
      onResult({
        success: true,
        action: 'save_and_close',
        entity: (existingPerson as unknown) as Record<string, unknown>,
      });

    } catch (error) {
      logger.error('❌ Failed to update existing person:', 'components', {}, error as Error);
      setErrors({ submit: 'Failed to update person. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (action: 'save_close' | 'save_continue') => {
    // Mark that we've attempted to submit - this enables error display
    setHasSubmitted(true);

    if (!validateForm()) return;

    // Check for duplicates (but allow user to proceed)
    checkForDuplicates();

    setIsSubmitting(true);

    try {
      const personData: PersonInput & { roles?: string[] } = {
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
        roles: formData.role ? [formData.role] : ['exhibitor'],
      };

      const newPerson = await addUser(personData);

      logger.debug('✅ User created successfully:', 'panels', { data: newPerson });

      // Call the selection callback if provided (may be async to refresh store)
      if (context.selectionCallback) {
        await context.selectionCallback((newPerson as unknown) as Record<string, unknown>);
      }

      // Return result based on action
      onResult({
        success: true,
        action: action === 'save_close' ? 'save_and_close' : 'save_and_continue',
        entity: (newPerson as unknown) as Record<string, unknown>,
      });

    } catch (error) {
      logger.error('❌ Failed to create person:', 'components', {}, error as Error);
      setErrors({ submit: 'Failed to create person. Please try again.' });
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

  const roleLabel = (context.preFilledData?.roleLabel as string) || 'User';

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Create New {roleLabel}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Add a new {roleLabel.toLowerCase()} to the system
        </p>
      </div>

      {/* Basic Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Role Selection (if not pre-filled) */}
          {!context.preFilledData?.role && (
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select 
                value={formData.role || ''} 
                onValueChange={(value) => handleInputChange('role', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {PERSON_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Name Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                placeholder="Enter first name"
                className={errors.firstName ? 'border-destructive' : ''}
              />
              {getVisibleError('firstName') && (
                <p className="text-sm text-destructive">{getVisibleError('firstName')}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                placeholder="Enter last name"
                className={errors.lastName ? 'border-destructive' : ''}
              />
              {getVisibleError('lastName') && (
                <p className="text-sm text-destructive">{getVisibleError('lastName')}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="Enter email address"
                className={errors.email ? 'border-destructive' : ''}
              />
              {getVisibleError('email') && (
                <p className="text-sm text-destructive">{getVisibleError('email')}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="Enter phone number"
                className={errors.phone ? 'border-destructive' : ''}
              />
              {getVisibleError('phone') && (
                <p className="text-sm text-destructive">{getVisibleError('phone')}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Address Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Address *</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              placeholder="Enter street address"
              className={errors.address ? 'border-destructive' : ''}
            />
            {getVisibleError('address') && (
              <p className="text-sm text-destructive">{getVisibleError('address')}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => handleInputChange('city', e.target.value)}
                placeholder="Enter city"
                className={errors.city ? 'border-destructive' : ''}
              />
              {getVisibleError('city') && (
                <p className="text-sm text-destructive">{getVisibleError('city')}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Select 
                value={formData.state} 
                onValueChange={(value) => handleInputChange('state', value)}
              >
                <SelectTrigger className={errors.state ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getVisibleError('state') && (
                <p className="text-sm text-destructive">{getVisibleError('state')}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code *</Label>
              <Input
                id="zipCode"
                value={formData.zipCode}
                onChange={(e) => handleInputChange('zipCode', e.target.value)}
                placeholder="12345"
                className={errors.zipCode ? 'border-destructive' : ''}
              />
              {getVisibleError('zipCode') && (
                <p className="text-sm text-destructive">{getVisibleError('zipCode')}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Duplicate Warning with Use Existing Option */}
      {duplicateWarning && existingPerson && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-medium text-amber-800 dark:text-amber-200 text-sm">
                Person Already Exists
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                {duplicateWarning}
              </p>
              {existingPerson.roles && existingPerson.roles.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Current roles: {existingPerson.roles.join(', ')}
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleUseExistingPerson}
                  disabled={isSubmitting}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Updating...
                    </>
                  ) : (
                    <>Use {existingPerson.firstName} {existingPerson.lastName}</>
                  )}
                </Button>
                <p className="text-xs text-amber-600 dark:text-amber-400 self-center">
                  This will add the "{formData.role}" role to their profile
                </p>
              </div>
              <p className="text-xs text-amber-500 dark:text-amber-500 mt-2 italic">
                Or continue filling the form to create a new person anyway.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Submit Error */}
      {errors.submit && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-destructive">{errors.submit}</p>
          </div>
        </div>
      )}

      {/* Action Buttons - Only show when used standalone */}
      {showActions && (
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
              'Create User'
            )}
          </Button>
        </div>
      )}
    </div>
  );
};