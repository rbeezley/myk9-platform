import React, { useState, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Users, MapPin, Eye, ExternalLink, Plus, CheckCircle, Mail, Phone, Globe, Award, Shield, MoreVertical, Edit, Trash2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useClubStore } from '@/store/clubStore';
import { ClubEditPanel } from '@/components/panels/edit/ClubEditPanel';
import { Club } from '@/types/club-types';
import ClubPhotoDialog from './ClubPhotoDialog';
import { ShowCreationWizard } from '@/components/shows/wizard/ShowCreationWizard';
import { PanelProvider, PanelStack } from '@/components/panels';
import Breadcrumb from '@/components/common/Breadcrumb';
import { RegistrationWorkflow } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RegistrationFormData } from '@/types/show-registration-types';
import { DeleteConfirmationDialog } from '@/components/base/DeleteConfirmationDialog';
import { AddMemberDialog } from './members/AddMemberDialog';
import { MemberList } from './members/MemberList';
import { useAuthContext } from '@/hooks/useAuthContext';
import { ClubAdminService } from '@/services/clubAdminService';
import { ScopeType } from '@/types/auth-types';
import { logger } from '@/services/LoggingService';


export interface ClubDetailsProps {
  selectedClub: Club | null;
  breadcrumbItems: Array<{ label: string; href?: string; }>;
}

/**
 * ClubDetails component displays information about a club.
 * This component should be used within the following hierarchy:
 * <EntityPageLayout>
 *   <EntityCardContainer>
 *     <ClubDetails selectedClub={selectedClub} />
 *   </EntityCardContainer>
 * </EntityPageLayout>
 * 
 * CACHE_BUST_2025_01_08_20_05 - Fixed undefined array access
 */
const ClubDetails: React.FC<ClubDetailsProps> = ({ selectedClub, breadcrumbItems }) => {
  logger.debug('ClubDetails render start', 'clubs', {
    selectedClub,
    selectedClubType: typeof selectedClub,
    selectedClubKeys: selectedClub ? Object.keys(selectedClub) : null
  });
  
  const navigate = useNavigate();
  const { updateClub, removeClub } = useClubStore();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past' | 'about' | 'members'>('upcoming');
  const [showEditPanel, setShowEditPanel] = useState(false);
  
  
  // Photo dialog state
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Registration dialog state
  const [showRegistrationDialog, setShowRegistrationDialog] = useState(false);
  const [selectedShowForRegistration, setSelectedShowForRegistration] = useState<string | null>(null);

  // Show creation wizard state
  const [showWizardDialog, setShowWizardDialog] = useState(false);
  
  // Delete club dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add member dialog state
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);

  // Get auth context for RBAC permissions
  const { userWithRoles, hasPermission } = useAuthContext();

  // RBAC permission check for club management
  const canManageMembers = userWithRoles && selectedClub && userWithRoles.databaseUserId &&
    (hasPermission('club:manage_members', { type: ScopeType.CLUB, id: selectedClub.id }) ||
     ClubAdminService.isClubAdmin(userWithRoles.databaseUserId, selectedClub.id));

  if (!selectedClub) {
    return <div className="flex items-center justify-center text-gray-500">No club selected.</div>;
  }

  // Additional safety check for club data integrity
  if (!selectedClub.id || !selectedClub.name) {
    logger.error('Invalid club data', 'clubs', { selectedClub });
    return <div className="flex items-center justify-center text-gray-500">Invalid club data.</div>;
  }

  // Debug: Log club shows data
  logger.debug('ClubDetails debug', 'clubs', {
    clubId: selectedClub.id,
    clubName: selectedClub.name,
    upcomingShowsCount: selectedClub.upcomingShows?.length || 0,
    pastShowsCount: selectedClub.pastShows?.length || 0
  });

  // Calculate club statistics
  const totalShows = (selectedClub.upcomingShows?.length || 0) + (selectedClub.pastShows?.length || 0);
  const upcomingShows = selectedClub.upcomingShows?.length || 0;
  const pastShows = selectedClub.pastShows?.length || 0;
  
  // Real member count from club data
  const memberCount = selectedClub.memberIds?.length || 0;

  const stats = [
    {
      title: "Total Shows",
      value: totalShows.toString(),
      detail1: `Upcoming: ${upcomingShows}`,
      detail2: `Completed: ${pastShows}`,
      progress: totalShows > 0 ? Math.round((pastShows / totalShows) * 100) : 0,
      type: "shows"
    },
    {
      title: "Active Members",
      value: memberCount.toString(),
      detail1: `Total: ${memberCount}`,
      detail2: memberCount > 0 ? `In club roster` : `No members yet`,
      progress: Math.min(Math.round((memberCount / 50) * 100), 100),
      type: "members"
    }
  ];

  // Helper function to determine show status
  const getShowStatus = (date: string, isUpcoming: boolean) => {
    const showDate = new Date(date);
    const today = new Date();
    const daysUntil = Math.ceil((showDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (!isUpcoming) return { status: 'completed', label: 'Completed' };
    if (daysUntil > 30) return { status: 'registration', label: 'Registration Open' };
    if (daysUntil > 0) return { status: 'upcoming', label: 'Upcoming' };
    return { status: 'upcoming', label: 'This Week' };
  };

  // Handler functions for club actions
  const handleEditClub = () => {
    setShowEditPanel(true);
  };

  const handleDeleteClub = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    logger.debug('handleConfirmDelete called', 'clubs', {
      selectedClub: selectedClub?.name,
      userWithRoles: userWithRoles?.id,
      databaseUserId: userWithRoles?.databaseUserId
    });

    if (!selectedClub) {
      logger.error('No club selected for deletion', 'clubs');
      setShowDeleteDialog(false);
      return;
    }

    if (!userWithRoles || !userWithRoles.databaseUserId) {
      logger.error('No user context or database user ID available for deletion', 'clubs');
      setShowDeleteDialog(false);
      return;
    }

    logger.info('Starting deletion process', 'clubs', {
      clubId: selectedClub.id,
      clubName: selectedClub.name,
      authUserId: userWithRoles.id,
      databaseUserId: userWithRoles.databaseUserId,
      userEmail: userWithRoles.email
    });

    setIsDeleting(true);
    try {
      logger.debug('Calling removeClub', 'clubs');
      await removeClub(selectedClub.id);
      logger.info('Club deletion completed successfully', 'clubs', { clubId: selectedClub.id });
      setShowDeleteDialog(false);
      // Navigate back to clubs list after successful deletion
      navigate('/clubs');
    } catch (error) {
      logger.error('Club deletion failed', 'clubs', { clubId: selectedClub.id }, error as Error);
      // Still close the dialog even on error so user isn't stuck
      setShowDeleteDialog(false);
      // TODO: Show error toast to user
    } finally {
      setIsDeleting(false);
    }
  };

  // Handler for club edit completion
  const handleClubEditComplete = async (formData: Partial<Club>) => {
    if (!selectedClub) return;
    
    logger.debug('Saving club form data', 'clubs', { formData });
    
    // Convert form data to club object, preserving ID and other non-form fields
    const updatedClub: Club = {
      ...selectedClub, // Keep existing data
      ...formData,     // Apply form changes
      id: selectedClub.id, // Ensure ID is preserved
      // Ensure address is properly handled if it comes as separate fields
      address: formData.address || {
        street: (formData as Record<string, unknown>).street as string || selectedClub.address?.street || '',
        city: (formData as Record<string, unknown>).city as string || selectedClub.address?.city || '',
        state: (formData as Record<string, unknown>).state as string || selectedClub.address?.state || '',
        zipCode: (formData as Record<string, unknown>).zipCode as string || selectedClub.address?.zipCode || '',
        country: (formData as Record<string, unknown>).country as string || selectedClub.address?.country || 'US'
      }
    };
    
    logger.debug('Updated club object', 'clubs', { updatedClub });
    
    try {
      await updateClub(updatedClub);
      setShowEditPanel(false);
    } catch (error) {
      logger.error('Failed to save club', 'clubs', { clubId: selectedClub?.id }, error as Error);
      // Keep the panel open so user can try again
      // TODO: Show error message in panel
    }
  };

  // Handler function for show navigation
  const handleViewShowDetails = (showId: string) => {
    startTransition(() => {
      navigate(`/shows/${showId}`);
    });
  };

  // Photo dialog handlers
  const handleEditPhoto = () => {
    setShowPhotoDialog(true);
  };

  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handlePhotoFile(files[0]);
    }
  };

  const handlePhotoDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handlePhotoDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handlePhotoFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handlePhotoFile(files[0]);
    }
  };

  const handlePhotoFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPreviewImage(result);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoCancel = () => {
    setPreviewImage(null);
    setShowPhotoDialog(false);
  };

  const handlePhotoSave = async (savedImage: string | null) => {
    if (savedImage && selectedClub) {
      const updatedClub = {
        ...selectedClub,
        logo: savedImage
      };
      await updateClub(updatedClub);
      setPreviewImage(null);
      setShowPhotoDialog(false);
    }
  };

  // Registration dialog handlers
  const handleRegisterForShow = (showId: string) => {
    setSelectedShowForRegistration(showId);
    setShowRegistrationDialog(true);
  };

  const handleRegistrationComplete = (data: RegistrationFormData) => {
    logger.info('Registration completed', 'clubs', { registrationData: data });
    setShowRegistrationDialog(false);
    setSelectedShowForRegistration(null);
    // TODO: Handle successful registration (show success message, redirect, etc.)
  };

  const handleRegistrationCancel = () => {
    setShowRegistrationDialog(false);
    setSelectedShowForRegistration(null);
  };

  // Add Show handlers
  const handleAddShow = () => {
    setShowWizardDialog(true);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-20">
      {/* Breadcrumb Navigation */}
      <Breadcrumb items={breadcrumbItems} showHomeIcon={true} className="mb-6" />

      {/* Enhanced Header with logo and club info */}
      <div className="mb-10 p-8 bg-card border border-border rounded-2xl relative overflow-hidden">
        {/* 3-dot menu positioned absolutely in top-right corner */}
        <div className="absolute top-4 right-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 p-0">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEditClub}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Club
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleEditPhoto}>
                <Camera className="mr-2 h-4 w-4" />
                Change Photo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.open(`mailto:${selectedClub.email}`, '_self')}>
                <Mail className="mr-2 h-4 w-4" />
                Email Club
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(`tel:${selectedClub.phone}`, '_self')}>
                <Phone className="mr-2 h-4 w-4" />
                Call Club
              </DropdownMenuItem>
              {selectedClub.website && (
                <DropdownMenuItem onClick={() => window.open(
                  selectedClub.website?.startsWith('http') ? selectedClub.website : `https://${selectedClub.website}`,
                  '_blank',
                  'noopener,noreferrer'
                )}>
                  <Globe className="mr-2 h-4 w-4" />
                  Visit Website
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDeleteClub} className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Club
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Club content layout */}
        <div className="flex flex-col md:flex-row items-center gap-6">
          <img
            src={selectedClub.logo}
            alt={selectedClub.name}
            className="w-32 h-32 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
            onClick={handleEditPhoto}
            title="Click to edit club logo"
          />
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold text-foreground mb-2">{selectedClub.name}</h1>
            <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground mb-4">
              <Shield className="w-4 h-4" />
              Club #{selectedClub.clubNumber}
            </div>
            <div className="flex gap-2 flex-wrap justify-center md:justify-start">
              {selectedClub.clubType && (
                <div className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                  <Award className="w-3 h-3" />
                  {selectedClub.clubType.charAt(0).toUpperCase() + selectedClub.clubType.slice(1)} Club
                </div>
              )}
              {selectedClub.founded && (
                <div className="flex items-center gap-1 px-3 py-1 bg-secondary/10 text-secondary-foreground rounded-full text-xs font-medium">
                  <Shield className="w-3 h-3" />
                  Founded {selectedClub.founded instanceof Date
                    ? selectedClub.founded.getFullYear()
                    : new Date(selectedClub.founded).getFullYear()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stats.map((stat, index) => (
            <div key={index} className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl ${
                  stat.type === 'shows' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'
                }`}>
                  {stat.type === 'shows' ? <Calendar className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium text-foreground">{stat.title}</div>
                </div>
              </div>

              <div className="text-2xl font-bold text-foreground mb-2">{stat.value}</div>

              <div className="flex justify-between text-xs text-muted-foreground mb-3">
                <span>{stat.detail1}</span>
                <span>{stat.detail2}</span>
              </div>

              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    stat.type === 'shows' ? 'bg-blue-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${stat.progress}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Tabs Section */}
      <div className="mb-6">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'upcoming' | 'past' | 'about' | 'members')} className="w-full">
          <div className="flex items-center justify-between border-b border-border">
            <TabsList className="bg-transparent border-0 rounded-none p-0 h-auto gap-6 justify-start">
              <TabsTrigger value="upcoming" className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors">
                Upcoming Shows ({selectedClub.upcomingShows?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="past" className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors">
                Past Shows ({selectedClub.pastShows?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="about" className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors">
                About
              </TabsTrigger>
              <TabsTrigger value="members" className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors">
                Members ({selectedClub.memberIds?.length || 0})
              </TabsTrigger>
            </TabsList>
            
            {/* Add Show Button - only shown on upcoming shows tab */}
            {activeTab === 'upcoming' && (
              <Button
                onClick={handleAddShow}
                className="mb-3 min-h-[44px]"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Show
              </Button>
            )}
          </div>

          <TabsContent value="upcoming" className="pt-6">
            <div>
            {(selectedClub.upcomingShows?.length || 0) > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(selectedClub.upcomingShows || []).map((show) => {
                  const showStatus = getShowStatus(show.date, true);

                  return (
                    <div key={show.id} className="bg-card border border-border rounded-2xl p-5 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-primary/30">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="text-lg font-semibold text-foreground">{show.name}</div>
                          <div className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${
                            showStatus.status === 'upcoming' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                            showStatus.status === 'registration' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                            'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                          }`}>
                            {showStatus.label}
                          </div>
                        </div>
                        <div className="flex items-start flex-shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewShowDetails(String(show.id))}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleRegisterForShow(show.id)}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Register
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(show.date).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {show.location}
                        </div>
                      </div>

                      {show.description && (
                        <div className="text-sm text-foreground leading-relaxed">{show.description}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 px-8 bg-muted/50 rounded-2xl border border-dashed border-border">
                <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-60" />
                <div className="text-lg font-medium mb-2 text-foreground">No Upcoming Shows</div>
                <div className="text-sm text-muted-foreground leading-relaxed mb-5">
                  This club doesn't have any shows scheduled yet. Add your first show to get started organizing events.
                </div>
                <Button onClick={handleAddShow} className="inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add First Show
                </Button>
              </div>
            )}
            </div>
          </TabsContent>

          <TabsContent value="past" className="pt-6">
            <div>
            {(selectedClub.pastShows?.length || 0) > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(selectedClub.pastShows || []).map((show) => {
                  const showStatus = getShowStatus(show.date, false);

                  return (
                    <div key={show.id} className="bg-card border border-border rounded-2xl p-5 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-primary/30">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="text-lg font-semibold text-foreground">{show.name}</div>
                          <div className="px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide bg-purple-500/10 text-purple-500 border border-purple-500/20">
                            {showStatus.label}
                          </div>
                        </div>
                        <div className="flex items-start flex-shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewShowDetails(String(show.id))}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Results
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(show.date).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {show.location}
                        </div>
                      </div>

                      {show.description && (
                        <div className="text-sm text-foreground leading-relaxed">{show.description}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 px-8 bg-muted/50 rounded-2xl border border-dashed border-border">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-60" />
                <div className="text-lg font-medium mb-2 text-foreground">No Past Shows</div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  This club hasn't hosted any shows yet. Once they organize their first event, the results will appear here.
                </div>
              </div>
            )}
            </div>
          </TabsContent>

          <TabsContent value="about" className="pt-6">
            <div className="space-y-6">
              {selectedClub.description && (
                <div className="text-base text-foreground leading-relaxed">{selectedClub.description}</div>
              )}

              {/* Contact Information */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Email</div>
                      <a href={`mailto:${selectedClub.email}`} className="text-sm text-foreground hover:text-primary transition-colors">
                        {selectedClub.email}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Phone</div>
                      <a href={`tel:${selectedClub.phone}`} className="text-sm text-foreground hover:text-primary transition-colors">
                        {selectedClub.phone}
                      </a>
                    </div>
                  </div>

                  {selectedClub.website && (
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Website</div>
                        <a
                          href={selectedClub.website.startsWith('http') ? selectedClub.website : `https://${selectedClub.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-foreground hover:text-primary transition-colors"
                        >
                          {selectedClub.website}
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Address</div>
                      <div className="text-sm text-foreground">
                        {[
                          selectedClub.address?.street,
                          selectedClub.address?.city,
                          selectedClub.address?.state,
                          selectedClub.address?.zipCode
                        ].filter(Boolean).join(', ')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="members" className="pt-6">
            <div className="space-y-6">
              {(selectedClub.memberIds?.length || 0) > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Club Members</h3>
                    {canManageMembers && (
                      <Button onClick={() => setShowAddMemberDialog(true)} className="min-h-[44px]">
                        <Plus className="w-5 h-5 mr-2" />
                        Add Member
                      </Button>
                    )}
                  </div>
                  <MemberList club={selectedClub} canManageMembers={!!canManageMembers} />
                </div>
              ) : (
                <div className="text-center py-16 px-8 bg-muted/50 rounded-2xl border border-dashed border-border">
                  <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-60" />
                  <div className="text-lg font-medium mb-2 text-foreground">No Members Yet</div>
                  <div className="text-sm text-muted-foreground leading-relaxed mb-5">
                    This club doesn't have any members yet. {canManageMembers ? 'Add your first member to get started.' : 'Only club admins can add members.'}
                  </div>
                  {canManageMembers && (
                    <Button onClick={() => setShowAddMemberDialog(true)} className="inline-flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Add First Member
                    </Button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Club Panel */}
      <ClubEditPanel
        open={showEditPanel}
        onClose={() => setShowEditPanel(false)}
        clubId={selectedClub?.id || ''}
        clubName={selectedClub?.name || ''}
        initialClubData={selectedClub || {}}
        onSave={handleClubEditComplete}
      />

      {/* Club Photo Dialog */}
      <ClubPhotoDialog
        open={showPhotoDialog}
        onOpenChange={setShowPhotoDialog}
        previewImage={previewImage}
        currentPhoto={selectedClub.logo}
        isDragging={isDragging}
        onDrop={handlePhotoDrop}
        onDragOver={handlePhotoDragOver}
        onDragLeave={handlePhotoDragLeave}
        onFileInput={handlePhotoFileInput}
        onCancel={handlePhotoCancel}
        onSave={handlePhotoSave}
      />

      {/* Registration Workflow Dialog */}
      <Dialog open={showRegistrationDialog} onOpenChange={setShowRegistrationDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0">
          {selectedShowForRegistration && (
            <RegistrationWorkflow
              showId={selectedShowForRegistration}
              onComplete={handleRegistrationComplete}
              onCancel={handleRegistrationCancel}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Show Creation Wizard */}
      {showWizardDialog && (
        <PanelProvider
          onEntityCreated={(entity, context) => {
            logger.info('Entity created from club page', 'clubs', { entityName: entity.name || entity.id, entityType: context.entityType });
            
            // Handle automatic selection of newly created entities
            if (context.selectionCallback) {
              context.selectionCallback(entity);
            }
          }}
          onPanelResult={(panelId, result) => {
            logger.debug('Panel result from club page', 'clubs', { panelId, action: result.action, success: result.success });
          }}
        >
          <ShowCreationWizard
            open={showWizardDialog}
            onOpenChange={setShowWizardDialog}
          />
          <PanelStack maxPanels={3} />
        </PanelProvider>
      )}

      {/* Delete Club Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleConfirmDelete}
        entityName={selectedClub.name}
        entityType="Club"
        description="This will mark the club as deleted and hide it from normal view. An administrator can restore it later if needed."
        isDeleting={isDeleting}
      />

      {/* Add Member Dialog */}
      <AddMemberDialog
        open={showAddMemberDialog}
        onOpenChange={setShowAddMemberDialog}
        club={selectedClub}
      />
    </div>
  );
};

export default ClubDetails;
