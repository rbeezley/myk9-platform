import React, { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/database/supabaseClient';
import type { UserFormData } from './UserEditPanel.types';

/** Extract the first validation error that matches any of the given keywords. */
const findFieldError = (errors: string[], ...keywords: string[]): string | undefined =>
  errors.find(e => keywords.some(k => e.toLowerCase().includes(k.toLowerCase())));

/** Fetch role names for a person (people.id) from user_roles table */
function usePersonRoleNames(personId?: string) {
  return useQuery({
    queryKey: ['personRoles', personId],
    queryFn: async () => {
      if (!personId) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select('role:roles!user_roles_role_id_fkey(name)')
        .eq('user_id', personId)
        .eq('is_active', true);
      if (error) throw error;
      return (data || [])
        .map((r: Record<string, unknown>) => (r.role as { name: string })?.name)
        .filter(Boolean) as string[];
    },
    enabled: !!personId,
    staleTime: 30_000,
  });
}

interface BasicInfoTabProps {
  data: UserFormData;
  personId?: string;
  errors: string[];
  updateData: (updates: Partial<UserFormData>) => void;
  hasAdminPermission: boolean;
  canEditAdvancedFields: boolean;
  onOpenPhotoModal: () => void;
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({
  data,
  personId,
  errors,
  updateData,
  hasAdminPermission,
  canEditAdvancedFields,
  onOpenPhotoModal,
}) => {
  const { data: dbRoles = [] } = usePersonRoleNames(personId);

  // Seed form roles from DB on initial load
  useEffect(() => {
    if (dbRoles.length > 0 && data.roles.length === 0) {
      updateData({ roles: dbRoles.map(r => (r === 'site_admin' ? 'admin' : r)) });
    }
  }, [dbRoles]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = useCallback(
    (field: keyof UserFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        updateData({ [field]: e.target.value });
      },
    [updateData]
  );

  return (
    <div className="space-y-6">
      {/* Profile Picture */}
      <Card className="border-0 shadow-none bg-transparent">
        <CardContent className="p-0">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {data.profileImage ? (
                <AvatarImage src={data.profileImage} alt={`${data.firstName} ${data.lastName}`} />
              ) : null}
              <AvatarFallback className="text-lg bg-muted">
                {data.firstName && data.lastName ? (
                  `${data.firstName[0]}${data.lastName[0]}`.toUpperCase()
                ) : (
                  <User className="h-6 w-6" />
                )}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Profile Picture
              </p>
              <Button variant="outline" size="sm" onClick={onOpenPhotoModal} className="gap-2">
                <Camera className="h-3.5 w-3.5" />
                Change Photo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Name Fields */}
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="First Name"
          fieldId="firstName"
          required
          error={findFieldError(errors, 'first name')}
        >
          <Input
            id="firstName"
            value={data.firstName}
            onChange={handleInputChange('firstName')}
            placeholder="Enter first name"
            name="firstName"
            aria-invalid={!!findFieldError(errors, 'first name')}
            aria-describedby="firstName-error"
          />
        </FormField>
        <FormField
          label="Last Name"
          fieldId="lastName"
          required
          error={findFieldError(errors, 'last name')}
        >
          <Input
            id="lastName"
            value={data.lastName}
            onChange={handleInputChange('lastName')}
            placeholder="Enter last name"
            name="lastName"
            aria-invalid={!!findFieldError(errors, 'last name')}
            aria-describedby="lastName-error"
          />
        </FormField>
      </div>

      {/* Email */}
      <FormField
        label="Email Address"
        fieldId="email"
        required
        error={findFieldError(errors, 'email')}
      >
        <Input
          id="email"
          type="email"
          value={data.email}
          onChange={handleInputChange('email')}
          placeholder="Enter email address"
          name="email"
          aria-invalid={!!findFieldError(errors, 'email')}
          aria-describedby="email-error"
        />
      </FormField>

      {/* Role Management - Admin Only */}
      {hasAdminPermission && (
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

            <FormField label="Bio" fieldId="bio">
              <Input
                id="bio"
                value={data.bio || ''}
                onChange={handleInputChange('bio')}
                placeholder="Enter bio or description"
                name="bio"
              />
            </FormField>
          </div>
        </>
      )}
    </div>
  );
};
