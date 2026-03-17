/**
 * CreateUserDialog Component - Dialog for creating new users
 *
 * Features:
 * - Complete user creation form
 * - Role assignment during creation (fetched dynamically from DB)
 * - Form validation
 * - Password generation options
 * - Email invitation sending
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logger } from '@/services/LoggingService';
import {
  User as UserIcon,
  Mail,
  MapPin,
  Building2,
  Shield,
  Save,
  X,
  AlertCircle,
  Eye,
  EyeOff,
  Key,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle } from '@myk9/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/services/database/supabaseClient';
import { rbacService } from '@/services/rbac/RBACService';

import { User } from '@/types/user-types';
import { useCreateUserMutation } from '@/hooks/queries/useUsersQuery';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserCreated: (user: User) => void;
}

// Form data interface
interface CreateUserFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  membershipId: string;
  clubAffiliations: string[];
  roles: string[];
  sendInviteEmail: boolean;
  generatePassword: boolean;
  customPassword: string;
}

export const CreateUserDialog: React.FC<CreateUserDialogProps> = ({
  open,
  onOpenChange,
  onUserCreated,
}) => {
  const [formData, setFormData] = useState<CreateUserFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    membershipId: '',
    clubAffiliations: [],
    roles: ['exhibitor'], // Default role
    sendInviteEmail: true,
    generatePassword: true,
    customPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [newClub, setNewClub] = useState('');

  const createUserMutation = useCreateUserMutation();

  const { data: availableRoles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, name, description')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Reset form when dialog opens/closes
  React.useEffect(() => {
    if (!open) {
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        zipCode: '',
        country: '',
        membershipId: '',
        clubAffiliations: [],
        roles: ['exhibitor'],
        sendInviteEmail: true,
        generatePassword: true,
        customPassword: '',
      });
      setErrors({});
      setNewClub('');
    }
  }, [open]);

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Required fields
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'Please enter a first name';
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Please enter a last name';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Please enter an email address';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Role validation
    if (formData.roles.length === 0) {
      newErrors.roles = 'Please select at least one role';
    }

    // Password validation (if custom password is used)
    if (!formData.generatePassword) {
      if (!formData.customPassword.trim()) {
        newErrors.customPassword = 'Please enter a password';
      } else if (formData.customPassword.length < 8) {
        newErrors.customPassword = 'Password must be at least 8 characters long';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleCreate = async () => {
    if (!validateForm()) return;

    try {
      // Create the person (without roles -- roles go to user_roles table)
      const newUser = await createUserMutation.mutateAsync({
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone || null,
        city: formData.city || null,
        state: formData.state || null,
        zip_code: formData.zipCode || null,
      });

      // Assign selected roles via RBAC service (handles dedup + reactivation)
      if (newUser?.id && formData.roles.length > 0) {
        for (const roleName of formData.roles) {
          try {
            await rbacService.ensureUserHasRole(newUser.id, roleName);
          } catch (err) {
            logger.error('Failed to assign role:', 'admin', { roleName }, err as Error);
          }
        }
      }

      onUserCreated(newUser);
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to create user:', 'admin', {}, error as Error);
      setErrors({ general: 'Failed to create user. Please try again.' });
    }
  };

  // Handle role changes
  const handleRoleChange = (role: string, checked: boolean) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        roles: [...prev.roles, role],
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        roles: prev.roles.filter(r => r !== role),
      }));
    }
  };

  // Handle club affiliations
  const addClub = () => {
    if (newClub.trim() && !formData.clubAffiliations.includes(newClub.trim())) {
      setFormData(prev => ({
        ...prev,
        clubAffiliations: [...prev.clubAffiliations, newClub.trim()],
      }));
      setNewClub('');
    }
  };

  const removeClub = (club: string) => {
    setFormData(prev => ({
      ...prev,
      clubAffiliations: prev.clubAffiliations.filter(c => c !== club),
    }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <UserIcon className="h-6 w-6" />
            Create New User
          </SheetTitle>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-6">
            {/* Error Alert */}
            {errors.general && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errors.general}</AlertDescription>
              </Alert>
            )}

            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserIcon className="h-5 w-5" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="First Name" fieldId="firstName" required error={errors.firstName}>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={e => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      aria-invalid={!!errors.firstName}
                      aria-describedby={errors.firstName ? 'firstName-error' : undefined}
                      placeholder="Enter first name"
                    />
                  </FormField>
                  <FormField label="Last Name" fieldId="lastName" required error={errors.lastName}>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={e => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      aria-invalid={!!errors.lastName}
                      aria-describedby={errors.lastName ? 'lastName-error' : undefined}
                      placeholder="Enter last name"
                    />
                  </FormField>
                </div>

                <FormField label="Membership ID" fieldId="membershipId">
                  <Input
                    id="membershipId"
                    value={formData.membershipId}
                    onChange={e => setFormData(prev => ({ ...prev, membershipId: e.target.value }))}
                    placeholder="Optional membership identifier"
                  />
                </FormField>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Email Address" fieldId="email" required error={errors.email}>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    placeholder="Enter email address"
                  />
                </FormField>

                <FormField label="Phone Number" fieldId="phone">
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Optional phone number"
                  />
                </FormField>
              </CardContent>
            </Card>

            {/* Address Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Address Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Street Address" fieldId="address">
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Street address"
                  />
                </FormField>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField label="City" fieldId="city">
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={e => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="City"
                    />
                  </FormField>
                  <FormField label="State/Province" fieldId="state">
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={e => setFormData(prev => ({ ...prev, state: e.target.value }))}
                      placeholder="State or province"
                    />
                  </FormField>
                  <FormField label="ZIP/Postal Code" fieldId="zipCode">
                    <Input
                      id="zipCode"
                      value={formData.zipCode}
                      onChange={e => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                      placeholder="ZIP or postal code"
                    />
                  </FormField>
                </div>

                <FormField label="Country" fieldId="country">
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={e => setFormData(prev => ({ ...prev, country: e.target.value }))}
                    placeholder="Country"
                  />
                </FormField>
              </CardContent>
            </Card>

            {/* Club Affiliations */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Club Affiliations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {formData.clubAffiliations.map(club => (
                    <div
                      key={club}
                      className="flex items-center justify-between p-2 border rounded"
                    >
                      <span>{club}</span>
                      <Button variant="ghost" size="sm" onClick={() => removeClub(club)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <Input
                      placeholder="Add club affiliation"
                      value={newClub}
                      onChange={e => setNewClub(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && addClub()}
                    />
                    <Button onClick={addClub} disabled={!newClub.trim()}>
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Role Assignment */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Role Assignment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {errors.roles && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.roles}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-3">
                  {availableRoles.map(role => (
                    <div key={role.name} className="flex items-start space-x-3 p-3 border rounded">
                      <Checkbox
                        id={role.name}
                        checked={formData.roles.includes(role.name)}
                        onCheckedChange={checked => handleRoleChange(role.name, !!checked)}
                      />
                      <div className="flex-1 min-w-0">
                        <Label htmlFor={role.name} className="font-medium capitalize">
                          {role.name}
                        </Label>
                        {role.description && (
                          <p className="text-sm text-muted-foreground">{role.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Selected Roles Display */}
                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Selected Roles:</h4>
                  <div className="flex flex-wrap gap-2">
                    {formData.roles.map(role => (
                      <Badge key={role} variant="default" className="capitalize">
                        {role}
                      </Badge>
                    ))}
                    {formData.roles.length === 0 && (
                      <span className="text-muted-foreground italic">No roles selected</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Setup */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Account Setup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <Label className="font-medium">Auto-generate Password</Label>
                    <p className="text-sm text-muted-foreground">
                      Generate secure password automatically
                    </p>
                  </div>
                  <Switch
                    checked={formData.generatePassword}
                    onCheckedChange={checked =>
                      setFormData(prev => ({
                        ...prev,
                        generatePassword: checked,
                        customPassword: checked ? '' : prev.customPassword,
                      }))
                    }
                  />
                </div>

                {!formData.generatePassword && (
                  <FormField label="Custom Password" fieldId="customPassword" required error={errors.customPassword}>
                    <div className="relative">
                      <Input
                        id="customPassword"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.customPassword}
                        onChange={e =>
                          setFormData(prev => ({ ...prev, customPassword: e.target.value }))
                        }
                        className="pr-10"
                        aria-invalid={!!errors.customPassword}
                        aria-describedby={errors.customPassword ? 'customPassword-error' : undefined}
                        placeholder="Enter secure password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </FormField>
                )}

                <div className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <Label className="font-medium">Send Invitation Email</Label>
                    <p className="text-sm text-muted-foreground">
                      Send welcome email with login instructions
                    </p>
                  </div>
                  <Switch
                    checked={formData.sendInviteEmail}
                    onCheckedChange={checked =>
                      setFormData(prev => ({ ...prev, sendInviteEmail: checked }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createUserMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {createUserMutation.isPending ? 'Creating...' : 'Create User'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
