/**
 * UserDetailsDialog Component - Comprehensive user profile management dialog
 * 
 * Features:
 * - View and edit user profile information
 * - Role assignment and management
 * - Account status controls
 * - Audit trail integration
 * - Form validation and error handling
 */

import React, { useState, useEffect } from 'react';
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
  Settings
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';

import { User } from '@/types/user-types';
import type { UserRole as UserRoleType } from '@/types/user-types';
import { useUpdateUserMutation } from '@/hooks/queries/useUsersQuery';
import { format } from 'date-fns';

interface UserDetailsDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserUpdated: (user: User) => void;
  onEditUser?: () => void;
}

// Role configuration for management
const AVAILABLE_ROLES = [
  { value: 'exhibitor' as UserRoleType, label: 'Exhibitor', description: 'Can register dogs and enter shows' },
  { value: 'handler' as UserRoleType, label: 'Handler', description: 'Can handle dogs for other owners' },
  { value: 'judge' as UserRoleType, label: 'Judge', description: 'Can judge shows and enter results' },
  { value: 'secretary' as UserRoleType, label: 'Secretary', description: 'Can manage shows and registrations' },
  { value: 'steward' as UserRoleType, label: 'Steward', description: 'Can assist with show operations' },
  { value: 'admin' as UserRoleType, label: 'Admin', description: 'Full system administration access' },
] as const;

// Form validation schema (basic)
interface UserFormData {
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
  roles: UserRoleType[];
  isActive: boolean;
}

export const UserDetailsDialog: React.FC<UserDetailsDialogProps> = ({
  user,
  open,
  onOpenChange,
  onUserUpdated,
  onEditUser
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<UserFormData>({
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
    roles: [],
    isActive: true
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newClub, setNewClub] = useState('');

  const updateUserMutation = useUpdateUserMutation();

  // Initialize form data when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
        city: user.city || '',
        state: user.state || '',
        zipCode: user.zipCode || '',
        country: user.country || '',
        membershipId: user.membershipId || '',
        clubAffiliations: user.clubAffiliations || [],
        roles: user.roles || [],
        isActive: true // Mock - would come from actual user status
      });
      setErrors({});
    }
  }, [user]);

  // Form validation
  const validateForm = (): boolean => {
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
    if (formData.roles.length === 0) {
      newErrors.roles = 'At least one role must be assigned';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      const updatedUser = await updateUserMutation.mutateAsync({
        id: user.id,
        updates: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone || undefined,
          address: formData.address || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          zipCode: formData.zipCode || undefined,
          roles: formData.roles.length > 0 ? formData.roles : undefined,
        }
      });

      onUserUpdated(updatedUser);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update user:', error);
      setErrors({ general: 'Failed to update user. Please try again.' });
    }
  };


  // Handle role changes
  const handleRoleChange = (role: UserRoleType, checked: boolean) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        roles: [...prev.roles, role]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        roles: prev.roles.filter(r => r !== role)
      }));
    }
  };

  // Handle club affiliations
  const addClub = () => {
    if (newClub.trim() && !formData.clubAffiliations.includes(newClub.trim())) {
      setFormData(prev => ({
        ...prev,
        clubAffiliations: [...prev.clubAffiliations, newClub.trim()]
      }));
      setNewClub('');
    }
  };

  const removeClub = (club: string) => {
    setFormData(prev => ({
      ...prev,
      clubAffiliations: prev.clubAffiliations.filter(c => c !== club)
    }));
  };

  // Generate user initials
  const getUserInitials = () => {
    const first = formData.firstName?.[0] || user.firstName?.[0] || '';
    const last = formData.lastName?.[0] || user.lastName?.[0] || '';
    return (first + last).toUpperCase() || 'U';
  };

  // Get user's full name
  const getUserFullName = () => {
    const firstName = formData.firstName || user.firstName || '';
    const lastName = formData.lastName || user.lastName || '';
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
                <Button variant="outline" size="sm" onClick={() => {
                  if (onEditUser) {
                    onEditUser();
                  }
                }}>
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
            {errors.general && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errors.general}</AlertDescription>
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
                      <div>
                        <Label htmlFor="firstName">First Name *</Label>
                        <Input
                          id="firstName"
                          value={formData.firstName}
                          onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                          disabled={!isEditing}
                          className={errors.firstName ? 'border-destructive' : ''}
                        />
                        {errors.firstName && (
                          <p className="text-xs text-destructive mt-1">{errors.firstName}</p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="lastName">Last Name *</Label>
                        <Input
                          id="lastName"
                          value={formData.lastName}
                          onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                          disabled={!isEditing}
                          className={errors.lastName ? 'border-destructive' : ''}
                        />
                        {errors.lastName && (
                          <p className="text-xs text-destructive mt-1">{errors.lastName}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="membershipId">Membership ID</Label>
                      <Input
                        id="membershipId"
                        value={formData.membershipId}
                        onChange={(e) => setFormData(prev => ({ ...prev, membershipId: e.target.value }))}
                        disabled={!isEditing}
                        placeholder="Optional membership identifier"
                      />
                    </div>
                  </div>

                  {/* Contact Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Contact Information
                    </h3>
                    
                    <div>
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        disabled={!isEditing}
                        className={errors.email ? 'border-destructive' : ''}
                      />
                      {errors.email && (
                        <p className="text-xs text-destructive mt-1">{errors.email}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        disabled={!isEditing}
                        placeholder="Optional phone number"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Address Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Address Information
                  </h3>
                  
                  <div>
                    <Label htmlFor="address">Street Address</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                      disabled={!isEditing}
                      placeholder="Street address"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                        disabled={!isEditing}
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State/Province</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                        disabled={!isEditing}
                        placeholder="State or province"
                      />
                    </div>
                    <div>
                      <Label htmlFor="zipCode">ZIP/Postal Code</Label>
                      <Input
                        id="zipCode"
                        value={formData.zipCode}
                        onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                        disabled={!isEditing}
                        placeholder="ZIP or postal code"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                      disabled={!isEditing}
                      placeholder="Country"
                    />
                  </div>
                </div>

                <Separator />

                {/* Club Affiliations */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Club Affiliations
                  </h3>
                  
                  <div className="space-y-2">
                    {formData.clubAffiliations.map((club) => (
                      <div key={club} className="flex items-center justify-between p-2 border rounded">
                        <span>{club}</span>
                        {isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeClub(club)}
                          >
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
                          onChange={(e) => setNewClub(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addClub()}
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
                  
                  {errors.roles && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{errors.roles}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-3">
                    {AVAILABLE_ROLES.map((role) => (
                      <div key={role.value} className="flex items-start space-x-3 p-3 border rounded">
                        <Checkbox
                          id={role.value}
                          checked={formData.roles.includes(role.value)}
                          onCheckedChange={(checked) => handleRoleChange(role.value, !!checked)}
                          disabled={!isEditing}
                        />
                        <div className="flex-1 min-w-0">
                          <Label htmlFor={role.value} className="font-medium">
                            {role.label}
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            {role.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Current Roles Display */}
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Current Roles:</h4>
                    <div className="flex flex-wrap gap-2">
                      {formData.roles.map((role) => (
                        <Badge key={role} variant="default">
                          {AVAILABLE_ROLES.find(r => r.value === role)?.label || role}
                        </Badge>
                      ))}
                      {formData.roles.length === 0 && (
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
                        checked={formData.isActive}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
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
                          {user.createdAt 
                            ? format(new Date(user.createdAt), 'PPP')
                            : 'Unknown'
                          }
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Last Updated:</span>
                        <span>
                          {user.updatedAt 
                            ? format(new Date(user.updatedAt), 'PPP')
                            : 'Never'
                          }
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