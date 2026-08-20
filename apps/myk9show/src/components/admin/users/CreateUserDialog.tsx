/**
 * CreateUserDialog Component - Dialog for creating new users
 *
 * Features:
 * - Complete user creation form
 * - Role assignment during creation (fetched dynamically from DB)
 * - Form validation with Zod schema
 * - Supabase Auth invitation so the new person can actually sign in
 *
 * MYK9-131 / PRA-2026-07-31-01. This dialog used to collect a password
 * (auto-generate toggle + custom field), a membership id and a list of club
 * affiliations, and to default "Send Invitation Email" to on — while
 * `handleCreate` inserted a `people` row and nothing else. Every one of those
 * inputs was dropped on the floor, so the operator saw a success state for an
 * account that had no auth identity and could never log in.
 *
 * The dead inputs are gone rather than implemented:
 *  - passwords: an admin-chosen password has no safe delivery channel, and the
 *    invite flow lets the recipient set their own. Invitation is now the only
 *    path to an identity.
 *  - membership id / club affiliations: `people` has no column for either, and
 *    club membership is already modelled through user_roles club scoping.
 *
 * `street_address` and `country` WERE storable all along and are now saved.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/services/LoggingService';
import { User as UserIcon, Mail, MapPin, Shield, Save, AlertCircle, Send } from 'lucide-react';
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
import { getRoleLabel } from './UserTable/types';
import { useCreateUserMutation } from '@/hooks/queries/useUsersQuery';
import { useFormValidation } from '@/hooks/useFormValidation';
import { commonValidations } from '@/lib/validation';
import { z } from 'zod';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserCreated: (user: User) => void;
}

const createUserSchema = z.object({
  firstName: z.string().min(1, 'Please enter a first name'),
  lastName: z.string().min(1, 'Please enter a last name'),
  email: commonValidations.emailRequired,
  phone: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
  country: z.string(),
  roles: z.array(z.string()).min(1, 'Please select at least one role'),
  sendInviteEmail: z.boolean(),
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
  roles: ['exhibitor'],
  sendInviteEmail: true,
};

export const CreateUserDialog: React.FC<CreateUserDialogProps> = ({
  open,
  onOpenChange,
  onUserCreated,
}) => {
  const form = useFormValidation(createUserSchema, INITIAL_FORM_DATA);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

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
  const resetForm = form.reset;
  React.useEffect(() => {
    if (!open) {
      resetForm(INITIAL_FORM_DATA);
      setGeneralError(null);
    }
  }, [open, resetForm]);

  // Handle form submission
  const handleCreate = form.handleSubmit(async (validatedData: CreateUserFormData) => {
    setGeneralError(null);

    let newUser: User;
    try {
      // Create the person (without roles -- roles go to user_roles table).
      // auth_user_id stays NULL here; handle_new_user() adopts this row by
      // LOWER(email) when the invitation is accepted, and migration 159's
      // trigger then backfills the user_roles rows written just below.
      newUser = await createUserMutation.mutateAsync({
        first_name: validatedData.firstName,
        last_name: validatedData.lastName,
        email: validatedData.email,
        phone: validatedData.phone || null,
        street_address: validatedData.address || null,
        city: validatedData.city || null,
        state: validatedData.state || null,
        zip_code: validatedData.zipCode || null,
        country: validatedData.country || null,
      });
    } catch (error) {
      logger.error('Failed to create user:', 'admin', {}, error as Error);
      // people.email carries a case-insensitive partial unique index, so a
      // repeat submission lands here rather than creating a duplicate person.
      const isDuplicate = /duplicate key|already exists|23505/i.test(String(error));
      setGeneralError(
        isDuplicate
          ? 'Someone with that email address already exists. Open their record to change roles or resend access.'
          : 'Failed to create user. Please try again.'
      );
      return;
    }

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

    if (!validatedData.sendInviteEmail) {
      // Say plainly that the record cannot sign in yet. The old dialog let the
      // operator believe otherwise; that is the bug.
      toast.success(`${validatedData.email} added. No invitation sent — they cannot sign in yet.`);
      onUserCreated(newUser);
      onOpenChange(false);
      return;
    }

    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-invite-user', {
        body: {
          email: validatedData.email,
          firstName: validatedData.firstName,
          roleLabels: validatedData.roles,
        },
      });
      if (error) throw error;

      if (data?.outcome === 'reinvited') {
        toast.success(`${validatedData.email} already had an account — sent them a sign-in link.`);
      } else {
        toast.success(`Invitation sent to ${validatedData.email}.`);
      }
    } catch (err) {
      logger.error(
        'Failed to send invitation:',
        'admin',
        { email: validatedData.email },
        err as Error
      );
      // The person row exists; only delivery failed. Report both halves rather
      // than a bare failure, so the operator knows not to re-create them.
      toast.error(
        `${validatedData.email} was added, but the invitation could not be sent. Use Resend access from their record.`
      );
    } finally {
      setInviting(false);
    }

    onUserCreated(newUser);
    onOpenChange(false);
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

  // Pre-compute errors for fields referenced multiple times
  const rolesError = form.getError('roles');

  const submitting = createUserMutation.isPending || inviting;

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
                      onChange={e => form.setValue('firstName', e.target.value)}
                      onBlur={() => form.touchField('firstName')}
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
                      onChange={e => form.setValue('lastName', e.target.value)}
                      onBlur={() => form.touchField('lastName')}
                      {...form.getFieldProps('lastName')}
                      placeholder="Enter last name"
                    />
                  </FormField>
                </div>
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
                    onChange={e => form.setValue('email', e.target.value)}
                    onBlur={() => form.touchField('email')}
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

            {/* Role Assignment */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Role Assignment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {rolesError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{rolesError}</AlertDescription>
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
                        <Label htmlFor={role.name} className="font-medium">
                          {getRoleLabel(role.name)}
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
                      <Badge key={role} variant="default">
                        {getRoleLabel(role)}
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
                  <Send className="h-5 w-5" />
                  Account Access
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <Label htmlFor="sendInviteEmail" className="font-medium">
                      Send Invitation Email
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Emails a single-use link so they can accept and choose their own password
                    </p>
                  </div>
                  <Switch
                    id="sendInviteEmail"
                    checked={form.data.sendInviteEmail}
                    onCheckedChange={checked => form.setValue('sendInviteEmail', checked)}
                  />
                </div>

                {/* INTENT: state the consequence of declining the invitation. The
                    operator previously had no way to tell that the record they
                    just created could not sign in (MYK9-131). */}
                {!form.data.sendInviteEmail && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Without an invitation this person is a contact record only — they will not be
                      able to sign in. You can invite them later from their record.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            <Save className="h-4 w-4 mr-2" />
            {inviting
              ? 'Sending invitation...'
              : createUserMutation.isPending
                ? 'Creating...'
                : form.data.sendInviteEmail
                  ? 'Create & Invite'
                  : 'Create User'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
