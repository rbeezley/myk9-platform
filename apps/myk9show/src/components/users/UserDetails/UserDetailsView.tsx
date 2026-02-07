import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';
import ProfilePhotoDialog from '@/components/users/ProfilePhotoDialog';
import { useUserStore } from '@/store/userStore';
import { useUpdateUserMutation, useDeleteUserMutation } from '@/hooks/queries/useUsersQuery';
import UserDetailsTabs from '@/components/users/UserDetails/UserDetailsTabs';
import ThreeDotMenu from '@/components/common/ThreeDotMenu';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import StandardDialog from '@/components/common/StandardDialog';
import { JudgeQualificationPanel, UserEditPanel } from '@/components/panels/edit';
import { User as UserType } from '@/types/dog-types';
import { Award, Settings, User, Camera, Trash2, Mail, Phone, Dog } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useRBAC } from '@/hooks/useRBAC';
import { useEnhancedAuth } from '@/hooks/useEnhancedAuth';
import { useRoleBasedPeople } from '@/hooks/useRoleBasedData';
import { getInitials } from '@/lib/utils';
import type { JudgeQualification } from '@/types/judge-types';
import '@/styles/apple-user-details.css';
import '@/styles/apple-show-details.css';

interface UserDetailsViewProps {
  person: UserType;
}

const UserDetailsView: React.FC<UserDetailsViewProps> = ({ person }) => {
  const navigate = useNavigate();
  const { user: currentUser } = useEnhancedAuth();
  const { hasPermission } = useRBAC();
  useUserStore();
  const updateUserMutation = useUpdateUserMutation();
  const deleteUserMutation = useDeleteUserMutation();
  const people = useRoleBasedPeople();
  
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isQualificationsPanelOpen, setIsQualificationsPanelOpen] = useState(false);
  // Handle both camelCase and snake_case field names
  const personRecord = person as unknown as Record<string, unknown>;
  const firstName = person.firstName || (personRecord.first_name as string) || '';
  const lastName = person.lastName || (personRecord.last_name as string) || '';
  const fullName = firstName && lastName ? `${firstName} ${lastName}` : person.email || 'Unknown User';
  
  // Always use the new UserEditPanel for improved UX
  const [formData, setFormData] = useState({
    name: fullName,
    email: person.email || '',
    phone: person.phone || '',
    address: person.streetAddress || (personRecord.street_address as string) || '',
    city: person.city || '',
    state: person.state || '',
    zipCode: person.zipCode || (personRecord.zip_code as string) || '',
    photo: person.profileImage || (personRecord.profile_image_url as string) || (personRecord.profile_image as string) || '',
    bio: '',
    deletedAt: null as string | null,
    deletedBy: null as string | null,
    judgeQualifications: person.judgeQualifications || [],
    roles: person.roles || [],
  });
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Check if current user can manage judge qualifications
  const canManageQualifications = () => {
    // Site admins can always edit
    if (hasPermission('admin:manage')) return true;
    
    // Show secretaries can edit judge qualifications
    if (hasPermission('show:manage')) return true;
    
    // Users can edit their own qualifications if they are judges
    if (person.id && currentUser?.id === person.id) {
      return hasPermission('judge:manage_qualifications') || hasPermission('user:update');
    }
    
    return false;
  };
  
  // Update form data when person changes
  React.useEffect(() => {
    if (person) {
      const personRec = person as unknown as Record<string, unknown>;
      const fname = person.firstName || (personRec.first_name as string) || '';
      const lname = person.lastName || (personRec.last_name as string) || '';
      const name = fname && lname ? `${fname} ${lname}` : person.email || 'Unknown User';
      
      const personData = {
        name: name,
        email: person.email || '',
        phone: person.phone || '',
        address: person.streetAddress || (personRec.street_address as string) || '',
        city: person.city || '',
        state: person.state || '',
        zipCode: person.zipCode || (personRec.zip_code as string) || '',
        photo: person.profileImage || (personRec.profile_image_url as string) || (personRec.profile_image as string) || '',
        bio: '',
        deletedAt: null as string | null,
        deletedBy: null as string | null,
        judgeQualifications: person.judgeQualifications || [],
        roles: person.roles || [],
      };
      setFormData(personData);
    }
  }, [person]);
  
  // Removed unused handleInputChange function
  
  const handleDeleteUser = async () => {
    try {
      logger.debug('Deleting user', 'users', { userId: person.id });
      
      // Delete the user from the database
      await deleteUserMutation.mutateAsync({ id: person.id });
      
      // Close the dialog
      setIsDeleteDialogOpen(false);
      
      // Navigate to another user or users list
      const remainingPeople = people.filter(p => p.id !== person.id);
      if (remainingPeople.length > 0) {
        // Navigate to the first remaining person
        navigate(`/users/${remainingPeople[0].id}`, { replace: true });
      } else {
        // No people left, navigate to users list
        navigate('/users', { replace: true });
      }
      
      logger.info('User deleted successfully', 'users', { userId: person.id });
    } catch (error) {
      logger.error('Failed to delete user', 'users', { userId: person.id }, error as Error);
      notifications.error('Failed to delete user', {
        description: getErrorMessage(error),
      });
    }
  };

  const handleQualificationsSave = async (qualifications: JudgeQualification[]) => {
    // Update local state
    setFormData(prev => ({
      ...prev,
      judgeQualifications: qualifications
    }));
    // Judge qualifications now managed through UserEditPanel
    
    // TODO: Save to backend
    logger.debug('Saving qualifications', 'users', { userId: person.id, qualificationsCount: qualifications.length });
  };
  
  const handleUserEditSave = async (userData: Partial<UserType>) => {
    try {
      // Update local state with user data (for immediate UI feedback)
      // Build update object only with defined properties
      const definedUpdates: Partial<typeof formData> = {};
      if (userData.firstName !== undefined) definedUpdates.name = `${userData.firstName} ${userData.lastName || ''}`.trim();
      if (userData.email !== undefined) definedUpdates.email = userData.email;
      if (userData.phone !== undefined) definedUpdates.phone = userData.phone;
      if (userData.streetAddress !== undefined) definedUpdates.address = userData.streetAddress;
      if (userData.city !== undefined) definedUpdates.city = userData.city;
      if (userData.state !== undefined) definedUpdates.state = userData.state;
      if (userData.zipCode !== undefined) definedUpdates.zipCode = userData.zipCode;

      setFormData(prev => ({ ...prev, ...definedUpdates }));

      // Save to database using React Query mutation (this will auto-update the cache)
      logger.debug('Saving user data', 'users', { userId: person.id });

      // Build updates object using conditional spread for exactOptionalPropertyTypes
      const updates: Partial<UserType> = {
        ...(userData.firstName !== undefined && { firstName: userData.firstName }),
        ...(userData.lastName !== undefined && { lastName: userData.lastName }),
        ...(userData.email !== undefined && { email: userData.email }),
        ...(userData.phone !== undefined && { phone: userData.phone }),
        streetAddress: userData.streetAddress || '',
        city: userData.city || '',
        state: userData.state || '',
        zipCode: userData.zipCode || ''
      };

      await updateUserMutation.mutateAsync({
        id: person.id,
        updates
      });

      logger.info('User data saved successfully', 'users', { userId: person.id });
    } catch (error) {
      logger.error('Failed to save user data', 'users', { userId: person.id }, error as Error);
      notifications.error('Failed to save user data', {
        description: getErrorMessage(error),
      });
    }
  };
  
  const handleFileUpload = (file: File) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setPreviewImage(result);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };
  
  // Removed unused handleSubmit function - form submission now handled by UserEditPanel

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-8">
      {/* Breadcrumb Navigation */}
      <Breadcrumb
        showHomeIcon
        items={[
          { label: 'People', href: '/users' },
          { label: fullName, isCurrentPage: true }
        ]}
        className="mb-2"
      />

      {/* Hero Profile Card - Apple-inspired design */}
      <Card className="relative overflow-hidden bg-gradient-to-br from-card/95 to-card/80 
                       apple-subtle-card-border rounded-2xl p-8 shadow-lg backdrop-blur-xl 
                       transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 
                       hover:border-primary/20">
        {/* Background glass effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent 
                        opacity-0 hover:opacity-100 transition-opacity duration-700" />
        
        {/* Three dot menu */}
        <div className="absolute top-6 right-6 z-10">
          <ThreeDotMenu
            onEdit={() => setIsEditModalOpen(true)}
            onDelete={() => setIsDeleteDialogOpen(true)}
            onEditPhoto={() => setIsPhotoModalOpen(true)}
            editLabel="Edit Person"
          />
        </div>
        
        {/* Hero content */}
        <div className="relative">
          <div className="flex items-start gap-8">
            {/* Enhanced Profile Photo */}
            <div className="flex-shrink-0">
              <button 
                type="button"
                onClick={() => setIsPhotoModalOpen(true)}
                className="relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
                aria-label="Edit profile photo"
              >
                {/* Glow effect */}
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-600/20 
                               rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 
                               blur-sm" />
                
                <Avatar className="relative w-28 h-28 border-2 border-white/20 shadow-2xl
                                 group-hover:scale-105 transition-all duration-300">
                  {formData.photo && formData.photo.trim() !== '' ? (
                    <AvatarImage src={formData.photo} alt="Profile photo" className="object-cover" />
                  ) : (
                    <AvatarFallback className="bg-gradient-to-br from-primary/10 to-primary/5 
                                             text-2xl font-semibold text-primary backdrop-blur-sm">
                      {getInitials(firstName, lastName)}
                    </AvatarFallback>
                  )}
                </Avatar>
                
                {/* Camera overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 
                               group-hover:bg-black/40 transition-all duration-300 rounded-full">
                  <div className="p-3 bg-white/90 rounded-full opacity-0 group-hover:opacity-100 
                                 transform scale-75 group-hover:scale-100 transition-all duration-300">
                    <Camera className="w-5 h-5 text-gray-800" />
                  </div>
                </div>
              </button>
            </div>
            
            {/* Enhanced User Info */}
            <div className="flex-1 space-y-4">
              <div>
                <h1 className="text-4xl font-bold text-foreground mb-2 tracking-tight">
                  {fullName}
                </h1>
                <p className="text-lg text-muted-foreground/90 font-medium tracking-wide">
                  {person.email}
                </p>
              </div>
              
              {/* Role badges with glass effect */}
              <div className="flex flex-wrap gap-3">
                {person.roles && person.roles.length > 0 ? (
                  person.roles.map((role) => (
                    <Badge key={role} className="px-4 py-2 text-sm font-medium
                                                bg-gradient-to-r from-primary/10 to-primary/5
                                                text-primary border border-primary/20
                                                backdrop-blur-sm hover:scale-105
                                                transition-all duration-200">
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </Badge>
                  ))
                ) : (
                  <Badge className="px-4 py-2 text-sm font-medium
                                  bg-gradient-to-r from-muted/50 to-muted/30
                                  text-muted-foreground apple-subtle-card-border
                                  backdrop-blur-sm">
                    Member
                  </Badge>
                )}
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap items-center gap-3 mt-4">
                {person.email && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="gap-2 bg-gradient-to-r from-muted/50 to-muted/30 border-border/30
                              hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10
                              hover:border-primary/20 transition-all duration-300"
                  >
                    <a href={`mailto:${person.email}`}>
                      <Mail className="w-4 h-4" />
                      Email
                    </a>
                  </Button>
                )}
                {formData.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="gap-2 bg-gradient-to-r from-muted/50 to-muted/30 border-border/30
                              hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10
                              hover:border-primary/20 transition-all duration-300"
                  >
                    <a href={`tel:${formData.phone.replace(/[^\d]/g, '')}`}>
                      <Phone className="w-4 h-4" />
                      Call
                    </a>
                  </Button>
                )}
                {person.dogs && person.dogs.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                                bg-gradient-to-r from-muted/30 to-muted/20 text-sm text-muted-foreground">
                    <Dog className="w-4 h-4" />
                    <span>{person.dogs.length} dog{person.dogs.length !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Contact Information Card - Consolidated Personal + Address */}
      <Card className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border
                       rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                       hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />

        <div className="relative space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
              <User className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Contact Information
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Personal Details Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  First Name
                </span>
                <span className="text-sm font-medium text-foreground">
                  {firstName || 'Not provided'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Last Name
                </span>
                <span className="text-sm font-medium text-foreground">
                  {lastName || 'Not provided'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Email
                </span>
                <a href={`mailto:${person.email}`}
                   className="text-sm font-medium text-primary dark:text-white hover:text-primary/80 dark:hover:text-white/80
                            transition-colors duration-200 hover:underline">
                  {person.email || 'Not provided'}
                </a>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Phone
                </span>
                {formData.phone ? (
                  <a href={`tel:${formData.phone.replace(/[^\d]/g, '')}`}
                     className="text-sm font-medium text-primary dark:text-white hover:text-primary/80 dark:hover:text-white/80
                              transition-colors duration-200 hover:underline">
                    {formData.phone}
                  </a>
                ) : (
                  <span className="text-sm font-medium text-foreground">Not provided</span>
                )}
              </div>
            </div>

            {/* Address Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Street
                </span>
                <span className="text-sm font-medium text-foreground">
                  {formData.address || 'Not provided'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  City
                </span>
                <span className="text-sm font-medium text-foreground">
                  {formData.city || 'Not provided'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  State
                </span>
                <span className="text-sm font-medium text-foreground">
                  {formData.state || 'Not provided'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Zip Code
                </span>
                <span className="text-sm font-medium text-foreground">
                  {formData.zipCode || 'Not provided'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Account Summary Card */}
      <Card className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border 
                       rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500 
                       hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.02] to-transparent 
                        opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />
        
        <div className="relative space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-xl">
              <Settings className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Account Summary
            </h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center p-4 bg-gradient-to-br 
                           from-muted/30 to-muted/10 rounded-xl apple-subtle-card-border 
                           hover:scale-105 transition-all duration-300">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
                Member Since
              </span>
              <span className="text-lg font-semibold text-foreground">
                {person.createdAt
                  ? new Date(person.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : 'Not available'}
              </span>
            </div>
            
            <div className="flex flex-col items-center text-center p-4 bg-gradient-to-br 
                           from-muted/30 to-muted/10 rounded-xl apple-subtle-card-border 
                           hover:scale-105 transition-all duration-300">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
                Account Type
              </span>
              <Badge className="bg-gradient-to-r from-primary/10 to-primary/5 text-primary 
                              border border-primary/20 font-medium">
                {person.roles && person.roles.length > 0 
                  ? person.roles[0].charAt(0).toUpperCase() + person.roles[0].slice(1)
                  : 'Member'}
              </Badge>
            </div>
            
            <div className="flex flex-col items-center text-center p-4 bg-gradient-to-br 
                           from-muted/30 to-muted/10 rounded-xl apple-subtle-card-border 
                           hover:scale-105 transition-all duration-300">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
                Dogs Registered
              </span>
              <span className="text-lg font-semibold text-foreground">
                {person.dogs?.length || 0} dogs
              </span>
            </div>
            
          </div>
        </div>
      </Card>

      {/* System Information Card - Admin only */}
      {(hasPermission('admin:manage') || hasPermission('user:manage')) && (
        <Card className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border 
                         rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500 
                         hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/[0.01] to-transparent 
                          opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />
          
          <div className="relative space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-xl">
                <Settings className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                System Information
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-br 
                             from-muted/20 to-muted/10 rounded-xl apple-subtle-card-border">
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  User ID
                </span>
                <span className="text-sm font-mono bg-muted/50 px-2 py-1 rounded-md text-foreground">
                  {person.id}
                </span>
              </div>
              
              <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-br 
                             from-muted/20 to-muted/10 rounded-xl apple-subtle-card-border">
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Account Status
                </span>
                <Badge className="bg-gradient-to-r from-green-500/20 to-green-500/10 
                                text-green-700 dark:text-green-300 border-green-500/30 font-medium">
                  Active
                </Badge>
              </div>
              
              {person.user_id && (
                <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-br 
                               from-muted/20 to-muted/10 rounded-xl apple-subtle-card-border">
                  <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                    Auth ID
                  </span>
                  <span className="text-sm font-mono bg-muted/50 px-2 py-1 rounded-md text-foreground">
                    {person.user_id}
                  </span>
                </div>
              )}
              
              <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-br 
                             from-muted/20 to-muted/10 rounded-xl apple-subtle-card-border">
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Database Records
                </span>
                <span className="text-sm font-medium text-foreground">
                  {person.dogs?.length || 0} associated dogs
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}
      
      {/* Judge Qualifications Card - Only show for judges or users with qualifications */}
      {(person.roles?.includes('judge') ||
        (person.judgeQualifications && person.judgeQualifications.length > 0)) && (
      <Card className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border
                       rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                       hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.02] to-transparent 
                        opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />
        
        <div className="relative space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-xl">
                <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Judge Qualifications
              </h3>
            </div>
            
            {canManageQualifications() && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsQualificationsPanelOpen(true)}
                className="gap-2 bg-gradient-to-r from-muted/50 to-muted/30 border-border/30 
                          hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10 
                          hover:border-primary/20 hover:scale-105 transition-all duration-300"
              >
                <Settings className="h-4 w-4" />
                Manage Qualifications
              </Button>
            )}
          </div>
          
          {formData.judgeQualifications && formData.judgeQualifications.length > 0 ? (
            <div className="space-y-6">
              {(formData.judgeQualifications as JudgeQualification[]).map((qual, index) => (
                <div key={index} className="relative p-5 bg-gradient-to-br from-muted/20 to-muted/10 
                                           border-l-4 border-amber-500 rounded-xl 
                                           hover:from-muted/30 hover:to-muted/20 
                                           transition-all duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-gradient-to-r from-amber-500/20 to-amber-500/10 
                                      text-amber-700 dark:text-amber-300 border-amber-500/30 
                                      font-medium px-3 py-1">
                        {qual.organization}
                      </Badge>
                      <span className="font-semibold text-foreground">
                        Judge #{qual.judgeNumber}
                      </span>
                    </div>
                    <Badge className={`font-medium px-3 py-1 ${
                      qual.status === 'Active' 
                        ? 'bg-gradient-to-r from-green-500/20 to-green-500/10 text-green-700 dark:text-green-300 border-green-500/30' 
                        : qual.status === 'Suspended' 
                        ? 'bg-gradient-to-r from-red-500/20 to-red-500/10 text-red-700 dark:text-red-300 border-red-500/30'
                        : 'bg-gradient-to-r from-gray-500/20 to-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/30'
                    }`}>
                      {qual.status}
                    </Badge>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                        Certified:
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {new Date(qual.certificationDate).toLocaleDateString()}
                      </span>
                    </div>
                    
                    {qual.showTypes && qual.showTypes.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2 block">
                          Qualified for:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {qual.showTypes.map((type) => (
                            <Badge key={type} 
                                   className="text-xs bg-gradient-to-r from-primary/10 to-primary/5 
                                            text-primary border-primary/20 font-medium">
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
            <div className="text-center py-12">
              <div className="p-4 bg-gradient-to-br from-amber-500/5 to-amber-500/10 
                             rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                <Award className="h-10 w-10 text-amber-500" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">No Judge Qualifications</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                This user has no judge qualifications on record. Add qualifications to enable judging privileges.
              </p>
              {canManageQualifications() && (
                <Button
                  variant="outline"
                  onClick={() => setIsQualificationsPanelOpen(true)}
                  className="gap-3 bg-gradient-to-r from-muted/50 to-muted/30 border-border/30 
                            hover:bg-gradient-to-r hover:from-amber-500/5 hover:to-amber-500/10 
                            hover:border-amber-500/20 hover:scale-105 transition-all duration-300 px-6 py-3"
                >
                  <Award className="h-4 w-4" />
                  Add Qualifications
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>
      )}

      <UserDetailsTabs
        selectedUser={person}
      />
      
      {/* Edit Person Panel */}
      <UserEditPanel
        open={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        userId={person.id}
        userName={`${person.firstName} ${person.lastName}`}
        initialUserData={person}
        onSave={handleUserEditSave}
        enableAutoSave={false}
      />
      
      <ProfilePhotoDialog
        open={isPhotoModalOpen}
        onOpenChange={setIsPhotoModalOpen}
        previewImage={previewImage}
        currentPhoto={formData.photo}
        isDragging={isDragging}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onFileInput={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const result = ev.target?.result as string;
              setPreviewImage(result);
            };
            reader.readAsDataURL(file);
          }
        }}
        onCancel={() => {
          setIsPhotoModalOpen(false);
          setPreviewImage(null);
        }}
        onSave={() => {
          if (previewImage) {
            setFormData(prev => ({ ...prev, photo: previewImage }));
          }
          setIsPhotoModalOpen(false);
          setPreviewImage(null);
        }}
      />
      
      <StandardDialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onSave={handleDeleteUser}
        title="Delete Person"
        titleIcon={<Trash2 className="w-5 h-5" />}
        description="Are you sure you want to delete this person? This action cannot be undone."
        saveLabel="Delete"
        cancelLabel="Cancel"
        saveButtonProps={{ variant: "destructive" }}
      >
        <p className="text-muted-foreground">
          This will permanently remove {formData.name} from your account.
        </p>
      </StandardDialog>
      
      {/* Judge Qualifications Panel */}
      <JudgeQualificationPanel
        open={isQualificationsPanelOpen}
        onClose={() => setIsQualificationsPanelOpen(false)}
        userId={person.id}
        userName={`${person.firstName} ${person.lastName}`}
        initialQualifications={(formData.judgeQualifications as JudgeQualification[]) || []}
        onSave={handleQualificationsSave}
      />
    </div>
  );
};

export default UserDetailsView;
