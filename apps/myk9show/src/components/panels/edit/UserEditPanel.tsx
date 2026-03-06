import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { JudgeQualificationPanel } from './JudgeQualificationPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, MapPin, Phone, Award, Settings, Camera, CalendarDays } from 'lucide-react';
import ProfilePhotoDialog from '@/components/users/ProfilePhotoDialog';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useRBAC } from '@/hooks/useRBAC';
import type { User as UserType, UserRole, JudgeQualification, JudgeInfo } from '@/types/user-types';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { useUserStore } from '@/store/userStore';
import AvailabilityFormFields from '@/components/judges/AvailabilityFormFields';

interface UserEditPanelProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  initialUserData: Partial<UserType>;
  onSave?: (userData: Partial<UserType>) => Promise<void>;
  enableAutoSave?: boolean;
  showAdvancedFields?: boolean;
}

// Form data interface matching PersonEditDialog expectations
interface UserFormData extends Record<string, unknown> {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  profileImage?: string;
  judgeQualifications: JudgeQualification[];
  roles: string[];
  // Optional advanced fields
  bio?: string;
  website?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}

// Form validation
const validateUserData = (data: UserFormData): string[] | null => {
  const errors: string[] = [];

  logger.debug('🔍 UserEditPanel validation debug:', 'panels', {
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      address: data.address,
      city: data.city,
      state: data.state,
      zipCode: data.zipCode,
      roles: data.roles,
      formDataKeys: Object.keys(data),
    },
  });

  if (!data.firstName?.trim()) {
    errors.push('First name is required');
  }

  if (!data.lastName?.trim()) {
    errors.push('Last name is required');
  }

  if (!data.email?.trim()) {
    errors.push('Email is required');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Please enter a valid email address');
  }

  // Phone and address are optional for basic user profiles
  // Only validate they are properly formatted if provided
  if (data.phone && !/^[\d\s\-().+]+$/.test(data.phone.trim())) {
    errors.push('Please enter a valid phone number');
  }

  // Address fields are optional but should be validated if any are provided
  const hasAddressInfo =
    data.address?.trim() || data.city?.trim() || data.state?.trim() || data.zipCode?.trim();

  if (hasAddressInfo) {
    // If user starts filling address info, require the basic fields
    if (!data.city?.trim()) {
      errors.push('City is required when providing address information');
    }
    if (!data.state?.trim()) {
      errors.push('State is required when providing address information');
    }
  }

  // Validate judge qualifications if present
  data.judgeQualifications?.forEach((qual, index) => {
    if (!qual.judgeNumber?.trim()) {
      errors.push(`Judge qualification ${index + 1}: Judge number is required`);
    }
    if (!qual.organization) {
      errors.push(`Judge qualification ${index + 1}: Organization is required`);
    }
    if (!qual.certificationDate) {
      errors.push(`Judge qualification ${index + 1}: Certification date is required`);
    }
  });

  if (errors.length > 0) {
    logger.debug('❌ UserEditPanel validation errors:', 'panels', { data: errors });
  } else {
    logger.debug('✅ UserEditPanel validation passed', 'components', {});
  }

  return errors.length > 0 ? errors : null;
};

// Convert UserType to form data
const userToFormData = (user: Partial<UserType>): UserFormData => {
  // Handle both camelCase and snake_case field names for compatibility
  const userRecord = user as Record<string, unknown>;

  const result = {
    firstName: user.firstName || (userRecord.first_name as string) || '',
    lastName: user.lastName || (userRecord.last_name as string) || '',
    email: user.email || '',
    phone: user.phone || '',
    address: user.address || (userRecord.street_address as string) || '',
    city: user.city || '',
    state: user.state || '',
    zipCode: user.zipCode || (userRecord.zip_code as string) || '',
    profileImage: user.profileImage || (userRecord.profile_image_url as string) || '',
    judgeQualifications: (user.judgeQualifications as JudgeQualification[]) || [],
    roles: (user.roles || []) as unknown as string[], // Handle UserRole[] type
    bio: (userRecord.bio as string) || '', // Extended field
    website: (userRecord.website as string) || '', // Extended field
    emergencyContact: (userRecord.emergencyContact as string) || '', // Extended field
    emergencyPhone: (userRecord.emergencyPhone as string) || '', // Extended field
  };

  logger.debug('🔍 UserEditPanel userToFormData debug:', 'panels', {
    data: {
      originalUser: user,
      userRecord: userRecord,
      resultingFormData: result,
      addressSources: {
        'user.address': user.address,
        'userRecord.street_address': userRecord.street_address,
      },
    },
  });

  return result;
};

// Convert form data back to UserType
const formDataToUser = (formData: UserFormData): Partial<UserType> => ({
  firstName: formData.firstName,
  lastName: formData.lastName,
  email: formData.email,
  phone: formData.phone,
  address: formData.address,
  city: formData.city,
  state: formData.state,
  zipCode: formData.zipCode,
  profileImage: formData.profileImage,
  judgeQualifications: formData.judgeQualifications,
  roles: formData.roles as UserRole[],
  ...(formData.bio && ({ bio: formData.bio } as Record<string, unknown>)),
  ...(formData.website && ({ website: formData.website } as Record<string, unknown>)),
  ...(formData.emergencyContact &&
    ({ emergencyContact: formData.emergencyContact } as Record<string, unknown>)),
  ...(formData.emergencyPhone &&
    ({ emergencyPhone: formData.emergencyPhone } as Record<string, unknown>)),
});

// Form content component
const UserEditForm: React.FC<{ userId: string }> = ({ userId }) => {
  const { data, updateData, errors } = useEditPanel<UserFormData>();
  const { user: currentUser } = useAuthContext();
  const { hasPermission } = useRBAC();
  const queryClient = useQueryClient();
  const { loadUsers } = useUserStore();

  // Judge qualifications panel state
  const [isQualificationsPanelOpen, setIsQualificationsPanelOpen] = useState(false);

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
        // No availability record — use defaults
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
    // Note: Ideally we'd compare with actual userId, not firstName
    // For now, we'll just check if user has the permission
    if (currentUser?.id) {
      return hasPermission('judge:manage_qualifications') || hasPermission('user:update');
    }
    return false;
  }, [hasPermission, currentUser?.id]);

  const canEditAdvancedFields = useMemo(() => {
    return hasPermission('admin:manage') || hasPermission('user:manage_advanced');
  }, [hasPermission]);

  // Handle input changes
  const handleInputChange = useCallback(
    (field: keyof UserFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        updateData({ [field]: e.target.value });
      },
    [updateData]
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

  // Handle qualifications save — persist to DB then update form state
  const handleQualificationsSave = useCallback(
    async (qualifications: JudgeQualification[]) => {
      const { judgeQualificationQueries } =
        await import('@/services/database/queries/judgeQueries');

      // Delete existing qualifications for this person
      const existing = await judgeQualificationQueries.getByJudgeId(userId);
      await Promise.all(existing.map(q => judgeQualificationQueries.delete(q.id)));

      // Create new qualifications
      await Promise.all(
        qualifications.map(qual =>
          judgeQualificationQueries.create({
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
          })
        )
      );

      // Invalidate caches so the store and queries pick up the new data
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
          <TabsTrigger
            value="basic"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <User className="h-4 w-4" />
            Basic Info
          </TabsTrigger>
          <TabsTrigger
            value="contact"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Phone className="h-4 w-4" />
            Contact
          </TabsTrigger>
          {isJudge && (
            <TabsTrigger
              value="qualifications"
              className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
            >
              <Award className="h-4 w-4" />
              Qualifications
            </TabsTrigger>
          )}
          {isJudge && (
            <TabsTrigger
              value="availability"
              className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
            >
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
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Profile Image Section */}
              <div className="flex items-center gap-4 pb-4 border-b border-border/30">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={data.profileImage} alt={`${data.firstName} ${data.lastName}`} />
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                    {data.firstName?.[0]}
                    {data.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                    Profile Picture
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsPhotoModalOpen(true)}
                      className="gap-2"
                    >
                      <Camera className="h-4 w-4" />
                      Change Photo
                    </Button>
                    {data.profileImage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateData({ profileImage: '' })}
                        className="gap-2 text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="firstName"
                    className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                  >
                    First Name *
                  </Label>
                  <Input
                    id="firstName"
                    value={data.firstName}
                    onChange={handleInputChange('firstName')}
                    placeholder="Enter first name"
                    className={cn(
                      errors.some(e => e.includes('First name')) && 'border-destructive'
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="lastName"
                    className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                  >
                    Last Name *
                  </Label>
                  <Input
                    id="lastName"
                    value={data.lastName}
                    onChange={handleInputChange('lastName')}
                    placeholder="Enter last name"
                    className={cn(
                      errors.some(e => e.includes('Last name')) && 'border-destructive'
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="user-edit-email"
                  className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                >
                  Email Address *
                </Label>
                <Input
                  id="user-edit-email"
                  type="email"
                  autoComplete="email"
                  value={data.email}
                  onChange={handleInputChange('email')}
                  placeholder="Enter email address"
                  name="email"
                  className={cn(
                    errors.some(e => e.includes('email') || e.includes('Email')) &&
                      'border-destructive'
                  )}
                />
              </div>

              {/* Role Management - Admin Only */}
              {hasPermission('admin:manage') && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Role Management
                    </h4>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                        User Roles
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            'exhibitor',
                            'handler',
                            'judge',
                            'secretary',
                            'chairman',
                            'steward',
                            'admin',
                          ] as const
                        ).map(role => {
                          const isSelected = data.roles.includes(role);
                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => {
                                const newRoles = isSelected
                                  ? data.roles.filter(r => r !== role)
                                  : [...data.roles, role];
                                updateData({ roles: newRoles });
                              }}
                              className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200',
                                isSelected
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-input border-0 text-muted-foreground hover:text-foreground hover:bg-muted'
                              )}
                            >
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </button>
                          );
                        })}
                      </div>
                      {data.roles.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No roles assigned. Users with no roles are considered Members.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {canEditAdvancedFields && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Additional Information
                    </h4>

                    <div className="space-y-2">
                      <Label
                        htmlFor="bio"
                        className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                      >
                        Bio
                      </Label>
                      <textarea
                        id="bio"
                        value={data.bio || ''}
                        onChange={handleInputChange('bio')}
                        placeholder="Enter bio or description"
                        className="min-h-[80px] w-full rounded-xl border-0 bg-input px-3.5 py-2.5 text-sm font-medium tracking-tight placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background focus-visible:shadow-sm transition-all duration-200"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="website"
                        className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                      >
                        Website
                      </Label>
                      <Input
                        id="website"
                        type="url"
                        value={data.website || ''}
                        onChange={handleInputChange('website')}
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact Information Tab */}
        <TabsContent
          value="contact"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="phone"
                  className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                >
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={data.phone}
                  onChange={handleInputChange('phone')}
                  placeholder="Enter phone number"
                  className={cn(errors.some(e => e.includes('Phone')) && 'border-destructive')}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <MapPin className="h-3 w-3" />
                  Address Information
                </h4>

                <div className="space-y-2">
                  <Label
                    htmlFor="address"
                    className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                  >
                    Street Address
                  </Label>
                  <Input
                    id="address"
                    value={data.address}
                    onChange={handleInputChange('address')}
                    placeholder="Enter street address"
                    className={cn(
                      errors.some(e => e.includes('address') || e.includes('Address')) &&
                        'border-destructive'
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="city"
                      className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                    >
                      City
                    </Label>
                    <Input
                      id="city"
                      value={data.city}
                      onChange={handleInputChange('city')}
                      placeholder="Enter city"
                      className={cn(errors.some(e => e.includes('City')) && 'border-destructive')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="state"
                      className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                    >
                      State
                    </Label>
                    <Input
                      id="state"
                      value={data.state}
                      onChange={handleInputChange('state')}
                      placeholder="Enter state"
                      className={cn(errors.some(e => e.includes('State')) && 'border-destructive')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="zipCode"
                      className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                    >
                      ZIP Code
                    </Label>
                    <Input
                      id="zipCode"
                      value={data.zipCode}
                      onChange={handleInputChange('zipCode')}
                      placeholder="Enter ZIP code"
                      className={cn(errors.some(e => e.includes('ZIP')) && 'border-destructive')}
                    />
                  </div>
                </div>
              </div>

              {canEditAdvancedFields && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Emergency Contact
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label
                          htmlFor="emergencyContact"
                          className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                        >
                          Emergency Contact Name
                        </Label>
                        <Input
                          id="emergencyContact"
                          value={data.emergencyContact || ''}
                          onChange={handleInputChange('emergencyContact')}
                          placeholder="Enter emergency contact name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="emergencyPhone"
                          className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                        >
                          Emergency Phone
                        </Label>
                        <Input
                          id="emergencyPhone"
                          type="tel"
                          value={data.emergencyPhone || ''}
                          onChange={handleInputChange('emergencyPhone')}
                          placeholder="Enter emergency phone number"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Qualifications Tab - Only for Judges */}
        {isJudge && (
          <TabsContent
            value="qualifications"
            className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
          >
            <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Judge Qualifications
                  </div>
                  {canEditQualifications && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsQualificationsPanelOpen(true)}
                      className="gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      Manage Qualifications
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.judgeQualifications?.length > 0 ? (
                  <div className="space-y-4">
                    {data.judgeQualifications.map((qual, index) => (
                      <div key={index} className="border-l-4 border-primary pl-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant={qual.status === 'Active' ? 'default' : 'secondary'}>
                              {qual.organization}
                            </Badge>
                            <span className="font-medium">Judge #{qual.judgeNumber}</span>
                          </div>
                          <Badge
                            variant={
                              qual.status === 'Active'
                                ? 'default'
                                : qual.status === 'Suspended'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {qual.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <p>Certified: {new Date(qual.certificationDate).toLocaleDateString()}</p>
                          {qual.showTypes && qual.showTypes.length > 0 && (
                            <div className="mt-2">
                              <span className="font-medium">Qualified for: </span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {qual.showTypes.map(type => (
                                  <Badge key={type} variant="outline" className="text-xs">
                                    {type}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      No Judge Qualifications
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      This user has no judge qualifications on record.
                    </p>
                    {canEditQualifications && (
                      <Button
                        variant="outline"
                        onClick={() => setIsQualificationsPanelOpen(true)}
                        className="gap-2"
                      >
                        <Award className="h-4 w-4" />
                        Add Qualifications
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
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
  // Convert user data to form data
  const initialFormData = useMemo(() => userToFormData(initialUserData), [initialUserData]);

  // Handle save
  const handleSave = useCallback(
    async (formData: UserFormData) => {
      const userData = formDataToUser(formData);
      if (onSave) {
        await onSave(userData);
      }
    },
    [onSave]
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
