import React, { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/database/supabaseClient';
import type { UserFormData } from './UserEditPanel.types';

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

/** Toggle a role for a person via user_roles table */
async function togglePersonRole(personId: string, roleName: string, grant: boolean) {
  const { data: role } = await supabase
    .from('roles')
    .select('id')
    .eq('name', roleName === 'admin' ? 'site_admin' : roleName)
    .single();
  if (!role) return;

  if (grant) {
    // Check if deactivated row exists — reactivate it
    const { data: existing } = await supabase
      .from('user_roles')
      .select('id, is_active')
      .eq('user_id', personId)
      .eq('role_id', role.id)
      .maybeSingle();

    if (existing && !existing.is_active) {
      await supabase.from('user_roles').update({ is_active: true }).eq('id', existing.id);
    } else if (!existing) {
      const currentUser = (await supabase.auth.getUser()).data.user;
      await supabase.from('user_roles').insert({
        user_id: personId,
        role_id: role.id,
        granted_by: currentUser?.id ?? null,
      });
    }
  } else {
    // Soft-deactivate
    await supabase
      .from('user_roles')
      .update({ is_active: false })
      .eq('user_id', personId)
      .eq('role_id', role.id);
  }
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
  const queryClient = useQueryClient();
  const { data: dbRoles = [] } = usePersonRoleNames(personId);
  const [localRoles, setLocalRoles] = useState<string[]>([]);

  // Sync DB roles into local state when they load
  useEffect(() => {
    // Map site_admin back to 'admin' for display
    setLocalRoles(dbRoles.map(r => (r === 'site_admin' ? 'admin' : r)));
  }, [dbRoles]);

  const handleRoleToggle = useCallback(
    async (role: string) => {
      if (!personId) return;
      const isSelected = localRoles.includes(role);
      // Optimistic update
      setLocalRoles(prev => (isSelected ? prev.filter(r => r !== role) : [...prev, role]));
      try {
        await togglePersonRole(personId, role, !isSelected);
        queryClient.invalidateQueries({ queryKey: ['personRoles', personId] });
      } catch {
        // Revert on error
        setLocalRoles(dbRoles.map(r => (r === 'site_admin' ? 'admin' : r)));
      }
    },
    [personId, localRoles, dbRoles, queryClient]
  );

  const handleInputChange = useCallback(
    (field: keyof UserFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        updateData({ [field]: e.target.value });
      },
    [updateData]
  );

  return (
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
                onClick={onOpenPhotoModal}
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
              className={cn(errors.some(e => e.includes('First name')) && 'border-destructive')}
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
              className={cn(errors.some(e => e.includes('Last name')) && 'border-destructive')}
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
              errors.some(e => e.includes('email') || e.includes('Email')) && 'border-destructive'
            )}
          />
        </div>

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
                    const isSelected = localRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => handleRoleToggle(role)}
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
                {localRoles.length === 0 && (
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
  );
};
