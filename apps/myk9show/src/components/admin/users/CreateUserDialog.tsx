/**
 * CreateUserDialog Component - Dialog for creating new users
 *
 * Features:
 * - Complete user creation form
 * - Role assignment during creation (fetched dynamically from DB)
 * - Form validation with Zod schema
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
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserCreated: (user: User) => void;
}

const createUserSchema = z
  .object({
    firstName: z.string().min(1, 'Please enter a first name'),
    lastName: z.string().min(1, 'Please enter a last name'),
    email: z
      .string()
      .min(1, 'Please enter an email address')
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'),
    phone: z.string(),
    address: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string(),
    membershipId: z.string(),
    clubAffiliations: z.array(z.string()),
    roles: z.array(z.string()).min(1, 'Please select at least one role'),
    sendInviteEmail: z.boolean(),
    generatePassword: z.boolean(),
    customPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!data.generatePassword) {
      if (!data.customPassword.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please enter a password',
          path: ['customPassword'],
        });
      } else if (data.customPassword.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Password must be at least 8 characters long',
          path: ['customPassword'],
        });
      }
    }
  });

type CreateUserFormData = z.infer<typeof createUserSchema>;

const INITIAL_FORM_DATA: CreateUserFormData = {
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
};

export const CreateUserDialog: React.FC<CreateUserDialogProps> = ({
  open,
  onOpenChange,
  onUserCreated,
}) => {
  const form = useFormValidation(createUserSchema, INITIAL_FORM_DATA);
  const [generalError, setGeneralError] = useState<string | null>(null);
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
      form.reset(INITIAL_FORM_DATA);
      setGeneralError(null);
      setNewClub('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle form submission
  const handleCreate = form.handleSubmit(async (validatedData: CreateUserFormData) => {
    setGeneralError(null);
    try {
      // Create the person (without roles -- roles go to user_roles table)
      const newUser = await createUserMutation.mutateAsync({
        first_name: validatedData.firstName,
        last_name: validatedData.lastName,
        email: validatedData.email,
        phone: validatedData.phone || null,
        city: validatedData.city || null,
        state: validatedData.state || null,
        zip_code: validatedData.zipCode || null,
      });

      // Assign selected roles via RBAC service (handles dedup + reactivation)
      if (newUser?.id && validatedData.roles.length > 0) {
        for (const roleName of validatedData.roles) {
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
      setGeneralError('Failed to create user. Please try again.');
    }
  });

  // Handle role changes
  const handleRoleChange = (role: string, checked: boolean) => {
    if (checked) {
      form.setValue('roles', [...form.data.roles, role]);
    } else {
      form.setValue(
        'roles',
        form.data.roles.filter(r => r !== role)
      );
    }
    form.touchField('roles');
  };

  // Handle club affiliations
  const addClub = () => {
    if (newClub.trim() && !form.data.clubAffiliations.includes(newClub.trim())) {
      form.setValue('clubAffiliations', [...form.data.clubAffiliations, newClub.trim()]);
      setNewClub('');
    }
  };

  const removeClub = (club: string) => {
    form.setValue(
      'clubAffiliations',
      form.data.clubAffiliations.filter(c => c !== club)
    );
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
            {generalError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{generalError}</AlertDescription>
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
                  <FormField
                    label="First Name"
                    fieldId="firstName"
                    required
                    error={form.getError('firstName')}
                  >
                    <Input
                      id="firstName"
                      value={form.data.firstName}
                      onChange={e => {
                        form.setValue('firstName', e.target.value);
                        form.touchField('firstName');
                      }}
                      {...form.getFieldProps('firstName')}
                      placeholder="Enter first name"
                    />
                  </FormField>
                  <FormField
                    label="Last Name"
                    fieldId="lastName"
                    required
                    error={form.getError('lastName')}
                  >
                    <Input
                      id="lastName"
                      value={form.data.lastName}
                      onChange={e => {
                        form.setValue('lastName', e.target.value);
                        form.touchField('lastName');
                      }}
                      {...form.getFieldProps('lastName')}
                      placeholder="Enter last name"
                    />
                  </FormField>
                </div>

                <FormField label="Membership ID" fieldId="membershipId">
                  <Input
                    id="membershipId"
                    value={form.data.membershipId}
                    onChange={e => form.setValue('membershipId', e.target.value)}
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
                <FormField
                  label="Email Address"
                  fieldId="email"
                  required
                  error={form.getError('email')}
                >
                  <Input
                    id="email"
                    type="email"
                    value={form.data.email}
                    onChange={e => {
                      form.setValue('email', e.target.value);
                      form.touchField('email');
                    }}
                    {...form.getFieldProps('email')}
                    placeholder="Enter email address"
                  />
                </FormField>

                <FormField label="Phone Number" fieldId="phone">
                  <Input
                    id="phone"
                    type="tel"
                    value={form.data.phone}
                    onChange={e => form.setValue('phone', e.target.value)}
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
                    value={form.data.address}
                    onChange={e => form.setValue('address', e.target.value)}
                    placeholder="Street address"
                  />
                </FormField>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField label="City" fieldId="city">
                    <Input
                      id="city"
                      value={form.data.city}
                      onChange={e => form.setValue('city', e.target.value)}
                      placeholder="City"
                    />
                  </FormField>
                  <FormField label="State/Province" fieldId="state">
                    <Input
                      id="state"
                      value={form.data.state}
                      onChange={e => form.setValue('state', e.target.value)}
                      placeholder="State or province"
                    />
                  </FormField>
                  <FormField label="ZIP/Postal Code" fieldId="zipCode">
                    <Input
                      id="zipCode"
                      value={form.data.zipCode}
                      onChange={e => form.setValue('zipCode', e.target.value)}
                      placeholder="ZIP or postal code"
                    />
                  </FormField>
                </div>

                <FormField label="Country" fieldId="country">
                  <Input
                    id="country"
                    value={form.data.country}
                    onChange={e => form.setValue('country', e.target.value)}
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
                  {form.data.clubAffiliations.map(club => (
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
                {form.getError('roles') && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{form.getError('roles')}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-3">
                  {availableRoles.map(role => (
                    <div key={role.name} className="flex items-start space-x-3 p-3 border rounded">
                      <Checkbox
                        id={role.name}
                        checked={form.data.roles.includes(role.name)}
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
                    {form.data.roles.map(role => (
                      <Badge key={role} variant="default" className="capitalize">
                        {role}
                      </Badge>
                    ))}
                    {form.data.roles.length === 0 && (
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
                    checked={form.data.generatePassword}
                    onCheckedChange={checked => {
                      form.setValues({
                        generatePassword: checked,
                        customPassword: checked ? '' : form.data.customPassword,
                      });
                    }}
                  />
                </div>

                {!form.data.generatePassword && (
                  <FormField
                    label="Custom Password"
                    fieldId="customPassword"
                    required
                    error={form.getError('customPassword')}
                  >
                    <div className="relative">
                      <Input
                        id="customPassword"
                        type={showPassword ? 'text' : 'password'}
                        value={form.data.customPassword}
                        onChange={e => {
                          form.setValue('customPassword', e.target.value);
                          form.touchField('customPassword');
                        }}
                        className="pr-10"
                        {...form.getFieldProps('customPassword')}
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
                    checked={form.data.sendInviteEmail}
                    onCheckedChange={checked => form.setValue('sendInviteEmail', checked)}
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
