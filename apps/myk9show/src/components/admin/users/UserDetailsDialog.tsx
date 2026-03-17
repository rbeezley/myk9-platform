/**
 * UserDetailsDialog Component - Comprehensive user profile management dialog
 *
 * Features:
 * - View and edit user profile information
 * - Role assignment and management
 * - Account status controls
 * - Audit trail integration
 * - Form validation with Zod schema
 */

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/services/LoggingService';
import {
  User as UserIcon,
  Mail,
  MapPin,
  Calendar,
  Building2,
  Shield,
  Edit,
  Save,
  X,
  AlertCircle,
  History,
  Settings,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/services/database/supabaseClient';
import { rbacService } from '@/services/rbac/RBACService';

import { User } from '@/types/user-types';
import { useUpdateUserMutation } from '@/hooks/queries/useUsersQuery';
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';
import { format } from 'date-fns';

interface UserDetailsDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserUpdated: (user: User) => void;
}

const userDetailsSchema = z.object({
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
  isActive: z.boolean(),
});

type UserFormData = z.infer<typeof userDetailsSchema>;

export const UserDetailsDialog: React.FC<UserDetailsDialogProps> = ({
  user,
  open,
  onOpenChange,
  onUserUpdated,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [newClub, setNewClub] = useState('');

  const updateUserMutation = useUpdateUserMutation();
  const queryClient = useQueryClient();

  // Fetch available roles from DB
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

  // Fetch user's current active roles from user_roles
  const { data: currentUserRoles = [] } = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from('user_roles')
        .select('role:roles(name)')
        .eq('user_id', user.id)
        .eq('is_active', true);
      return (
        data
          ?.map((r: { role: { name: string } | null }) => r.role?.name)
          .filter((n): n is string => !!n) ?? []
      );
    },
    enabled: !!user?.id,
  });

  // Derive initial form data from user prop
  const getInitialFormData = (): UserFormData => ({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address || '',
    city: user?.city || '',
    state: user?.state || '',
    zipCode: user?.zipCode || '',
    country: user?.country || '',
    membershipId: user?.membershipId || '',
    clubAffiliations: user?.clubAffiliations || [],
    roles: currentUserRoles,
    isActive: true, // Mock - would come from actual user status
  });

  const form = useFormValidation(userDetailsSchema, getInitialFormData());

  // Reset form when user changes
  const userKey = user?.id || '';
  const [lastUserKey, setLastUserKey] = useState(userKey);
  if (userKey !== lastUserKey) {
    setLastUserKey(userKey);
    form.reset(getInitialFormData());
    setGeneralError(null);
  }

  // Handle form submission
  const handleSave = form.handleSubmit(async (validatedData: UserFormData) => {
    setGeneralError(null);
    try {
      // Update person fields (no roles — those go to user_roles)
      const updatedUser = await updateUserMutation.mutateAsync({
        id: user.id,
        updates: {
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          email: validatedData.email,
          phone: validatedData.phone || undefined,
          address: validatedData.address || undefined,
          city: validatedData.city || undefined,
          state: validatedData.state || undefined,
          zipCode: validatedData.zipCode || undefined,
        },
      });

      // Diff roles: add new, soft-deactivate removed
      const currentSet = new Set(currentUserRoles);
      const selectedSet = new Set(validatedData.roles);

      const toAdd = validatedData.roles.filter(r => !currentSet.has(r));
      const toDeactivate = currentUserRoles.filter(r => !selectedSet.has(r));

      for (const roleName of toAdd) {
        try {
          await rbacService.ensureUserHasRole(user.id, roleName);
        } catch (err) {
          logger.error('Failed to assign role:', 'admin', { roleName }, err as Error);
        }
      }

      for (const roleName of toDeactivate) {
        const role = availableRoles.find(r => r.name === roleName);
        if (role) {
          await supabase
            .from('user_roles')
            .update({ is_active: false })
            .eq('user_id', user.id)
            .eq('role_id', role.id);
        }
      }

      // Invalidate role cache
      await queryClient.invalidateQueries({ queryKey: ['user-roles', user.id] });

      onUserUpdated(updatedUser);
      setIsEditing(false);
    } catch (error) {
      logger.error('Failed to update user:', 'admin', {}, error as Error);
      setGeneralError('Failed to update user. Please try again.');
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

  // Generate user initials
  const getUserInitials = () => {
    const first = form.data.firstName?.[0] || user.firstName?.[0] || '';
    const last = form.data.lastName?.[0] || user.lastName?.[0] || '';
    return (first + last).toUpperCase() || 'U';
  };

  // Get user's full name
  const getUserFullName = () => {
    const firstName = form.data.firstName || user.firstName || '';
    const lastName = form.data.lastName || user.lastName || '';
    return `${firstName} ${lastName}`.trim() || 'Unnamed User';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback>{getUserInitials()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="text-xl font-semibold">{getUserFullName()}</div>
              <div className="text-sm text-muted-foreground">
                {user.membershipId && `ID: ${user.membershipId}`}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={updateUserMutation.isPending}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    form.reset(getInitialFormData());
                    setIsEditing(true);
                  }}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit User
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="space-y-6 p-1">
            {/* Error Alert */}
            {generalError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{generalError}</AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="roles">Roles & Access</TabsTrigger>
                <TabsTrigger value="account">Account Status</TabsTrigger>
                <TabsTrigger value="audit">Audit Trail</TabsTrigger>
              </TabsList>

              {/* Profile Tab */}
              <TabsContent value="profile" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Personal Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <UserIcon className="h-5 w-5" />
                      Personal Information
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
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
                          disabled={!isEditing}
                          {...form.getFieldProps('firstName')}
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
                          disabled={!isEditing}
                          {...form.getFieldProps('lastName')}
                        />
                      </FormField>
                    </div>

                    <FormField label="Membership ID" fieldId="membershipId">
                      <Input
                        id="membershipId"
                        value={form.data.membershipId}
                        onChange={e => form.setValue('membershipId', e.target.value)}
                        disabled={!isEditing}
                        placeholder="Optional membership identifier"
                      />
                    </FormField>
                  </div>

                  {/* Contact Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Contact Information
                    </h3>

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
                        disabled={!isEditing}
                        {...form.getFieldProps('email')}
                      />
                    </FormField>

                    <FormField label="Phone Number" fieldId="phone">
                      <Input
                        id="phone"
                        type="tel"
                        value={form.data.phone}
                        onChange={e => form.setValue('phone', e.target.value)}
                        disabled={!isEditing}
                        placeholder="Optional phone number"
                      />
                    </FormField>
                  </div>
                </div>

                <Separator />

                {/* Address Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Address Information
                  </h3>

                  <FormField label="Street Address" fieldId="address">
                    <Input
                      id="address"
                      value={form.data.address}
                      onChange={e => form.setValue('address', e.target.value)}
                      disabled={!isEditing}
                      placeholder="Street address"
                    />
                  </FormField>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField label="City" fieldId="city">
                      <Input
                        id="city"
                        value={form.data.city}
                        onChange={e => form.setValue('city', e.target.value)}
                        disabled={!isEditing}
                        placeholder="City"
                      />
                    </FormField>
                    <FormField label="State/Province" fieldId="state">
                      <Input
                        id="state"
                        value={form.data.state}
                        onChange={e => form.setValue('state', e.target.value)}
                        disabled={!isEditing}
                        placeholder="State or province"
                      />
                    </FormField>
                    <FormField label="ZIP/Postal Code" fieldId="zipCode">
                      <Input
                        id="zipCode"
                        value={form.data.zipCode}
                        onChange={e => form.setValue('zipCode', e.target.value)}
                        disabled={!isEditing}
                        placeholder="ZIP or postal code"
                      />
                    </FormField>
                  </div>

                  <FormField label="Country" fieldId="country">
                    <Input
                      id="country"
                      value={form.data.country}
                      onChange={e => form.setValue('country', e.target.value)}
                      disabled={!isEditing}
                      placeholder="Country"
                    />
                  </FormField>
                </div>

                <Separator />

                {/* Club Affiliations */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Club Affiliations
                  </h3>

                  <div className="space-y-2">
                    {form.data.clubAffiliations.map(club => (
                      <div
                        key={club}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <span>{club}</span>
                        {isEditing && (
                          <Button variant="ghost" size="sm" onClick={() => removeClub(club)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}

                    {isEditing && (
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
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Roles & Access Tab */}
              <TabsContent value="roles" className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Role Assignments
                  </h3>

                  {form.getError('roles') && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{form.getError('roles')}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-3">
                    {availableRoles.map(role => (
                      <div
                        key={role.name}
                        className="flex items-start space-x-3 p-3 border rounded"
                      >
                        <Checkbox
                          id={role.name}
                          checked={form.data.roles.includes(role.name)}
                          onCheckedChange={checked => handleRoleChange(role.name, !!checked)}
                          disabled={!isEditing}
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

                  {/* Current Roles Display */}
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Current Roles:</h4>
                    <div className="flex flex-wrap gap-2">
                      {form.data.roles.map(role => (
                        <Badge key={role} variant="default" className="capitalize">
                          {role}
                        </Badge>
                      ))}
                      {form.data.roles.length === 0 && (
                        <span className="text-muted-foreground italic">No roles assigned</span>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Account Status Tab */}
              <TabsContent value="account" className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Account Status
                  </h3>

                  <div className="space-y-4 p-4 border rounded">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="font-medium">Account Active</Label>
                        <p className="text-sm text-muted-foreground">
                          When disabled, user cannot log in or access the system
                        </p>
                      </div>
                      <Switch
                        checked={form.data.isActive}
                        onCheckedChange={checked => form.setValue('isActive', checked)}
                        disabled={!isEditing}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Account Information */}
                  <div className="space-y-4">
                    <h4 className="font-medium">Account Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Created:</span>
                        <span>
                          {user.createdAt ? format(new Date(user.createdAt), 'PPP') : 'Unknown'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Last Updated:</span>
                        <span>
                          {user.updatedAt ? format(new Date(user.updatedAt), 'PPP') : 'Never'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Audit Trail Tab */}
              <TabsContent value="audit" className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Audit Trail
                  </h3>

                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Audit trail functionality coming soon</p>
                    <p className="text-sm">All user changes will be tracked here</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
