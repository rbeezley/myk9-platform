import React, { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, AlertTriangle, CalendarIcon, Plus, X, GraduationCap, Award } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useUserStore, PersonInput } from '@/store/userStore';
import { BasePanelProps } from '../types';
import type { JudgeCertification, JudgeQualificationDetailed } from '@/types/dog-types';
import type { JudgeInfo } from '@/types/user-types';

interface JudgeFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  judgeNumber: string;
  qualifications: JudgeQualificationDetailed[];
  certifications: JudgeCertification[];
  availability: {
    startDate: Date | null;
    endDate: Date | null;
    blackoutDates: Date[];
    maxShowsPerMonth: number;
    travelRadius: number;
  };
}

// Using the type from dog-types.ts - no need to redefine

const JUDGE_ORGANIZATIONS = [
  { value: 'AKC', label: 'American Kennel Club (AKC)' },
  { value: 'UKC', label: 'United Kennel Club (UKC)' },
  { value: 'FCI', label: 'Fédération Cynologique Internationale (FCI)' },
  { value: 'Other', label: 'Other' },
];

const JUDGE_LEVELS = {
  AKC: ['Provisional', 'Regular', 'All-Breed'],
  UKC: ['Apprentice', 'Licensed', 'Senior'],
  FCI: ['National', 'International'],
  Other: ['Entry Level', 'Experienced', 'Senior'],
};

const DISCIPLINES = [
  'Conformation',
  'Obedience',
  'Rally',
  'Agility',
  'Tracking',
  'Herding',
  'Field Trials',
  'Hunt Tests',
  'Lure Coursing',
  'Earthdog',
  'Fast CAT',
  'Scent Work',
  'Dock Diving',
  'Barn Hunt',
];

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

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
  const [expandedSections, setExpandedSections] = useState({
    qualifications: true,
    certifications: true,
    availability: false,
  });

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

  const addQualification = () => {
    const newQualification: JudgeQualificationDetailed = {
      organization: 'AKC',
      level: JUDGE_LEVELS.AKC[0],
      disciplines: [],
      dateObtained: null,
      expirationDate: null,
    };
    handleInputChange('qualifications', [...formData.qualifications, newQualification]);
  };

  const updateQualification = (index: number, updates: Partial<JudgeQualificationDetailed>) => {
    const newQualifications = [...formData.qualifications];
    newQualifications[index] = { ...newQualifications[index], ...updates };
    handleInputChange('qualifications', newQualifications);
  };

  const removeQualification = (index: number) => {
    handleInputChange('qualifications', formData.qualifications.filter((_, i) => i !== index));
  };

  const addCertification = () => {
    const newCertification: JudgeCertification = {
      name: '',
      issuingBody: '',
      dateObtained: null,
      expirationDate: null,
      certificationNumber: '',
    };
    handleInputChange('certifications', [...formData.certifications, newCertification]);
  };

  const updateCertification = (index: number, updates: Partial<JudgeCertification>) => {
    const newCertifications = [...formData.certifications];
    newCertifications[index] = { ...newCertifications[index], ...updates };
    handleInputChange('certifications', newCertifications);
  };

  const removeCertification = (index: number) => {
    handleInputChange('certifications', formData.certifications.filter((_, i) => i !== index));
  };

  const handleSubmit = async (action: 'save_close' | 'save_continue') => {
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

      console.log('✅ Judge created successfully:', newJudge);

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
      console.error('❌ Failed to create judge:', error);
      setErrors({ submit: 'Failed to create judge. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    onResult({
      success: false,
      action: 'cancel',
    });
  };

  const isFormValid = validateForm() && !isSubmitting;

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

      {/* Basic Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              {errors.firstName && (
                <p className="text-sm text-destructive">{errors.firstName}</p>
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
              {errors.lastName && (
                <p className="text-sm text-destructive">{errors.lastName}</p>
              )}
            </div>
          </div>

          {/* Judge Number */}
          <div className="space-y-2">
            <Label htmlFor="judgeNumber">Judge Number *</Label>
            <Input
              id="judgeNumber"
              value={formData.judgeNumber}
              onChange={(e) => handleInputChange('judgeNumber', e.target.value)}
              placeholder="Enter official judge number"
              className={errors.judgeNumber ? 'border-destructive' : ''}
            />
            {errors.judgeNumber && (
              <p className="text-sm text-destructive">{errors.judgeNumber}</p>
            )}
          </div>

          {/* Contact Fields */}
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
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
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
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone}</p>
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
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              placeholder="Enter street address"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => handleInputChange('city', e.target.value)}
                placeholder="Enter city"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Select 
                value={formData.state} 
                onValueChange={(value) => handleInputChange('state', value)}
              >
                <SelectTrigger>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                value={formData.zipCode}
                onChange={(e) => handleInputChange('zipCode', e.target.value)}
                placeholder="12345"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Qualifications Card */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setExpandedSections(prev => ({ ...prev, qualifications: !prev.qualifications }))}>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              Qualifications *
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {formData.qualifications.length} qualification{formData.qualifications.length !== 1 ? 's' : ''}
            </span>
          </CardTitle>
        </CardHeader>
        {expandedSections.qualifications && (
          <CardContent className="space-y-4">
            {errors.qualifications && (
              <p className="text-sm text-destructive">{errors.qualifications}</p>
            )}
            
            {formData.qualifications.map((qual, index) => (
              <div key={index} className="p-4 border rounded-lg space-y-4">
                <div className="flex items-start justify-between">
                  <h4 className="font-medium">Qualification {index + 1}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeQualification(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Organization</Label>
                    <Select
                      value={qual.organization}
                      onValueChange={(value) => updateQualification(index, { 
                        organization: value as JudgeQualificationDetailed['organization'],
                        level: JUDGE_LEVELS[value as keyof typeof JUDGE_LEVELS][0]
                      })}
                    >
                      <SelectTrigger>
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

                  <div className="space-y-2">
                    <Label>Level</Label>
                    <Select
                      value={qual.level}
                      onValueChange={(value) => updateQualification(index, { level: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {JUDGE_LEVELS[qual.organization]?.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Disciplines</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {DISCIPLINES.map((discipline) => (
                      <div key={discipline} className="flex items-center space-x-2">
                        <Checkbox
                          id={`qual-${index}-${discipline}`}
                          checked={qual.disciplines.includes(discipline)}
                          onCheckedChange={(checked) => {
                            const newDisciplines = checked
                              ? [...qual.disciplines, discipline]
                              : qual.disciplines.filter(d => d !== discipline);
                            updateQualification(index, { disciplines: newDisciplines });
                          }}
                        />
                        <Label
                          htmlFor={`qual-${index}-${discipline}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {discipline}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date Obtained</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !qual.dateObtained && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {qual.dateObtained ? format(qual.dateObtained, "PPP") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={qual.dateObtained || undefined}
                          onSelect={(date) => updateQualification(index, { dateObtained: date || null })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Expiration Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !qual.expirationDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {qual.expirationDate ? format(qual.expirationDate, "PPP") : "No expiration"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={qual.expirationDate || undefined}
                          onSelect={(date) => updateQualification(index, { expirationDate: date || null })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={addQualification}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Qualification
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Certifications Card */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setExpandedSections(prev => ({ ...prev, certifications: !prev.certifications }))}>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Certifications</span>
            <span className="text-sm font-normal text-muted-foreground">
              {formData.certifications.length} certification{formData.certifications.length !== 1 ? 's' : ''}
            </span>
          </CardTitle>
        </CardHeader>
        {expandedSections.certifications && (
          <CardContent className="space-y-4">
            {errors.certifications && (
              <p className="text-sm text-destructive">{errors.certifications}</p>
            )}
            
            {formData.certifications.map((cert, index) => (
              <div key={index} className="p-4 border rounded-lg space-y-4">
                <div className="flex items-start justify-between">
                  <h4 className="font-medium">Certification {index + 1}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCertification(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Certification Name</Label>
                    <Input
                      value={cert.name}
                      onChange={(e) => updateCertification(index, { name: e.target.value })}
                      placeholder="e.g., Canine Good Citizen Evaluator"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Issuing Body</Label>
                    <Input
                      value={cert.issuingBody}
                      onChange={(e) => updateCertification(index, { issuingBody: e.target.value })}
                      placeholder="e.g., American Kennel Club"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Certification Number</Label>
                  <Input
                    value={cert.certificationNumber}
                    onChange={(e) => updateCertification(index, { certificationNumber: e.target.value })}
                    placeholder="Enter certification number"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date Obtained</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !cert.dateObtained && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {cert.dateObtained ? format(cert.dateObtained, "PPP") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={cert.dateObtained || undefined}
                          onSelect={(date) => updateCertification(index, { dateObtained: date || null })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Expiration Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !cert.expirationDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {cert.expirationDate ? format(cert.expirationDate, "PPP") : "No expiration"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={cert.expirationDate || undefined}
                          onSelect={(date) => updateCertification(index, { expirationDate: date || null })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={addCertification}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Certification
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Availability Card (Optional) */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setExpandedSections(prev => ({ ...prev, availability: !prev.availability }))}>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Availability Settings</span>
            <span className="text-sm font-normal text-muted-foreground">
              Optional
            </span>
          </CardTitle>
        </CardHeader>
        {expandedSections.availability && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Shows Per Month</Label>
                <Input
                  type="number"
                  min="1"
                  max="30"
                  value={formData.availability.maxShowsPerMonth}
                  onChange={(e) => handleAvailabilityChange('maxShowsPerMonth', parseInt(e.target.value) || 4)}
                />
              </div>

              <div className="space-y-2">
                <Label>Travel Radius (miles)</Label>
                <Input
                  type="number"
                  min="0"
                  max="1000"
                  value={formData.availability.travelRadius}
                  onChange={(e) => handleAvailabilityChange('travelRadius', parseInt(e.target.value) || 100)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Available From</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.availability.startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.availability.startDate 
                        ? format(formData.availability.startDate, "PPP") 
                        : "Always available"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.availability.startDate || undefined}
                      onSelect={(date) => handleAvailabilityChange('startDate', date || null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Available Until</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.availability.endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.availability.endDate 
                        ? format(formData.availability.endDate, "PPP") 
                        : "No end date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.availability.endDate || undefined}
                      onSelect={(date) => handleAvailabilityChange('endDate', date || null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Duplicate Warning */}
      {duplicateWarning && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-amber-800 dark:text-amber-200 text-sm">
                Possible Duplicate
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                {duplicateWarning}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                You can still proceed if this is a different judge.
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
          disabled={!isFormValid}
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