import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Crown } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { DogProfileEditDialog } from '@/components/dogs/common/DogProfileEditDialog';
import { DeleteDogDialog } from '@/components/dogs/common/DeleteDogDialog';
import PhotoDialog from '@/components/common/PhotoDialog';
import PedigreeSection from '@/components/dogs/DogDetails/Pedigree/PedigreeSection';
import TrainingSection from '@/components/dogs/DogDetails/TrainingJournal/TrainingSection';
import HealthRecordsSection from '@/components/dogs/DogDetails/HealthRecords/HealthRecordsSection';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import CompetitionsTabs from '@/components/dogs/DogDetails/Competitions/CompetitionsTabs';
import TitleProgressSection from '@/components/dogs/DogDetails/TitleTracking/TitleProgressSection';
import { mockPedigreeData } from '@/data/mockPedigreeData';
import { ExtendedAncestor } from '@/components/dogs/DogDetails/Pedigree/PedigreeAncestorAddDialog';
import type { Dog, Owner } from '@/types/dog-types';
import DogBasicInfoCard from '@/components/dogs/common/DogBasicInfoCard';
import '@/styles/apple-dog-details.css';

// TEMP: Mock user object for demo/testing premium gating
const user = { isPremium: true };

interface DogDetailsViewProps {
  dog: Dog;
}

const DogDetailsView: React.FC<DogDetailsViewProps> = ({ dog }) => {
  const [searchParams] = useSearchParams();
  const [autoOpenAddRegistration, setAutoOpenAddRegistration] = useState(false);
  const people = useUserStore(state => state.people);

  // Check for addRegistration query parameter on mount
  useEffect(() => {
    const shouldAddRegistration = searchParams.get('addRegistration') === 'true';
    if (shouldAddRegistration) {
      setAutoOpenAddRegistration(true);
      // Remove the query parameter from the URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('addRegistration');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [searchParams]);
  
  // Create an Owner object from the User object or use a placeholder
  const person = people.find(p => p.id === dog.ownerId);
  const owner: Owner = person ? {
    id: person.id,
    name: `${person.firstName} ${person.lastName}`,
    email: person.email,
    phone: person.phone,
    profileImage: person.profileImage
  } : {
    id: 'unknown',
    name: 'Unknown Owner',
    email: 'N/A',
    phone: 'N/A'
  };
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [ancestors, setAncestors] = useState<ExtendedAncestor[]>(mockPedigreeData);

  // --- Photo Dialog State ---
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const [updatedDog, setUpdatedDog] = useState<Dog>(dog);

  // Effect to update local dog state when prop changes
  React.useEffect(() => {
    setUpdatedDog(dog);
  }, [dog]);

  const handlePhotoDialogOpen = (open: boolean) => {
    setIsPhotoDialogOpen(open);
    if (!open) setPhotoPreview(null);
  };

  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPhotoDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPhotoDragging(true);
  };

  const handlePhotoDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPhotoDragging(false);
  };

  const handlePhotoFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoSave = (preview: string | null) => {
    if (preview) {
      // Update dog image (mock logic)
      setUpdatedDog({ ...updatedDog, imageUrl: preview });
    }
    setIsPhotoDialogOpen(false);
    setPhotoPreview(null);
  };

  // These functions are no longer needed as we're using the Zustand store
  // for registrations in the RegistrationsSection component

  const handlePremiumTabClick = (e: React.MouseEvent) => {
    if (!user.isPremium) {
      e.preventDefault();
      console.log('Premium feature clicked');
    }
  };

  return (
    <div className="apple-dog-page">
      <div className="apple-dog-container">
        {/* Dog Information Card */}
        <DogBasicInfoCard
          dog={updatedDog}
          owner={owner}
          onEdit={() => setIsEditModalOpen(true)}
          onDelete={() => setIsDeleteDialogOpen(true)}
          onEditPhoto={() => handlePhotoDialogOpen(true)} 
        />

        {/* Tabs Section */}
        <div className="apple-dog-tabs-section">
          <TooltipProvider>
            <Tabs defaultValue="registrations" className="w-full">
              <TabsList className="grid w-full grid-cols-6 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
                <TabsTrigger 
                  value="registrations" 
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
                >
                  Registrations
                </TabsTrigger>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger 
                    value="competitions" 
                    disabled={!user.isPremium} 
                    onClick={!user.isPremium ? handlePremiumTabClick : undefined}
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 data-[state=disabled]:opacity-50"
                  >
                    <Crown className="mr-2 h-4 w-4" /> 
                    Competitions
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Access Competitions - Premium Feature</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger 
                    value="title-progress" 
                    disabled={!user.isPremium} 
                    onClick={!user.isPremium ? handlePremiumTabClick : undefined}
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 data-[state=disabled]:opacity-50"
                  >
                    <Crown className="mr-2 h-4 w-4" /> 
                    Title Progress
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Access Title Progress - Premium Feature</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger 
                    value="health-records" 
                    disabled={!user.isPremium} 
                    onClick={!user.isPremium ? handlePremiumTabClick : undefined}
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 data-[state=disabled]:opacity-50"
                  >
                    <Crown className="mr-2 h-4 w-4" /> 
                    Health Records
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Access Health Records - Premium Feature</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger 
                    value="training-journal" 
                    disabled={!user.isPremium} 
                    onClick={!user.isPremium ? handlePremiumTabClick : undefined}
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 data-[state=disabled]:opacity-50"
                  >
                    <Crown className="mr-2 h-4 w-4" /> 
                    Training Journal
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Access Training Journal - Premium Feature</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger 
                    value="pedigree" 
                    disabled={!user.isPremium} 
                    onClick={!user.isPremium ? handlePremiumTabClick : undefined}
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 data-[state=disabled]:opacity-50"
                  >
                    <Crown className="mr-2 h-4 w-4" /> 
                    Pedigree
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Access Pedigree - Premium Feature</p>
                </TooltipContent>
              </Tooltip>
              </TabsList>

              {/* Tab Content Sections */}
              <TabsContent value="registrations" className="apple-dog-tab-content">
                <RegistrationsSection dog={updatedDog} autoOpenAddDialog={autoOpenAddRegistration} />
              </TabsContent>

              <TabsContent value="competitions" className="apple-dog-tab-content">
                {user.isPremium ? (
                  <CompetitionsTabs />
                ) : (
                  <div className="apple-premium-gate">
                    <div className="apple-premium-icon">
                      <Crown />
                    </div>
                    <h3 className="apple-premium-title">Competitions Premium Feature</h3>
                    <p className="apple-premium-description">
                      Track your dog's competition history, upcoming shows, and achievements with detailed records.
                    </p>
                    <Button className="apple-premium-button" onClick={() => console.log('Upgrade to Premium')}>
                      Upgrade to Premium
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="title-progress" className="apple-dog-tab-content">
                {user.isPremium ? (
                  <TitleProgressSection initialTitleProgressList={[]} />
                ) : (
                  <div className="apple-premium-gate">
                    <div className="apple-premium-icon">
                      <Crown />
                    </div>
                    <h3 className="apple-premium-title">Title Progress Premium Feature</h3>
                    <p className="apple-premium-description">
                      Track your dog's progress toward various titles and certifications.
                    </p>
                    <Button className="apple-premium-button" onClick={() => console.log('Upgrade to Premium')}>
                      Upgrade to Premium
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="health-records" className="apple-dog-tab-content">
                {user.isPremium ? (
                  <HealthRecordsSection user={user} />
                ) : (
                  <div className="apple-premium-gate">
                    <div className="apple-premium-icon">
                      <Crown />
                    </div>
                    <h3 className="apple-premium-title">Health Records Premium Feature</h3>
                    <p className="apple-premium-description">
                      Keep detailed health records including vaccinations, vet visits, and medications.
                    </p>
                    <Button className="apple-premium-button" onClick={() => console.log('Upgrade to Premium')}>
                      Upgrade to Premium
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="training-journal" className="apple-dog-tab-content">
                {user.isPremium ? (
                  <TrainingSection />
                ) : (
                  <div className="apple-premium-gate">
                    <div className="apple-premium-icon">
                      <Crown />
                    </div>
                    <h3 className="apple-premium-title">Training Journal Premium Feature</h3>
                    <p className="apple-premium-description">
                      Document your dog's training progress with detailed session notes and photos.
                    </p>
                    <Button className="apple-premium-button" onClick={() => console.log('Upgrade to Premium')}>
                      Upgrade to Premium
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="pedigree" className="apple-dog-tab-content">
                {user.isPremium ? (
                  <PedigreeSection
                    header={<h2 className="text-lg font-semibold flex items-center">Pedigree</h2>}
                    pedigree={ancestors}
                    addAncestor={(ancestor) => setAncestors(prev => [...prev, { ...ancestor, id: Date.now().toString() }])}
                    editAncestor={(id, updated) => setAncestors(prev => prev.map(a => String(a.id) === id ? { ...updated, id } : a))}
                    deleteAncestor={(id) => setAncestors(prev => prev.filter(a => String(a.id) !== id))}
                  />
                ) : (
                  <div className="apple-premium-gate">
                    <div className="apple-premium-icon">
                      <Crown />
                    </div>
                    <h3 className="apple-premium-title">Pedigree Premium Feature</h3>
                    <p className="apple-premium-description">
                      View and manage your dog's complete family tree and ancestry information.
                    </p>
                    <Button className="apple-premium-button" onClick={() => console.log('Upgrade to Premium')}>
                      Upgrade to Premium
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TooltipProvider>
        </div>

        {/* Dialogs */}
        {isEditModalOpen && (
          <DogProfileEditDialog
            open={isEditModalOpen}
            dog={updatedDog}
            owners={[owner]} 
            onClose={() => setIsEditModalOpen(false)}
            onSave={(updatedDogData) => {
              setUpdatedDog(updatedDogData);
              setIsEditModalOpen(false);
            }}
          />
        )}

        {isDeleteDialogOpen && (
          <DeleteDogDialog
            open={isDeleteDialogOpen}
            onClose={() => setIsDeleteDialogOpen(false)}
            onDelete={() => {
              const now = new Date().toISOString();
              const currentUser = 'admin@example.com'; // TODO: Replace with actual user
              setUpdatedDog({ ...updatedDog, deletedAt: now, deletedBy: currentUser });
              setIsDeleteDialogOpen(false);
            }}
            dog={dog}
          />
        )}

        {/* Edit Photo Dialog */}
        <PhotoDialog
          open={isPhotoDialogOpen}
          onOpenChange={handlePhotoDialogOpen}
          previewImage={photoPreview}
          currentPhoto={updatedDog?.imageUrl || ''}
          isDragging={isPhotoDragging}
          onDrop={handlePhotoDrop}
          onDragOver={handlePhotoDragOver}
          onDragLeave={handlePhotoDragLeave}
          onFileInput={handlePhotoFileInput}
          onCancel={() => setIsPhotoDialogOpen(false)}
          onSave={handlePhotoSave}
          title="Change Dog Photo"
          previewAlt={updatedDog?.callName || 'Dog Photo'}
        />
      </div>
    </div>
  );
};

// React.memo optimization for DogDetailsView performance
export default React.memo(DogDetailsView, (prevProps, nextProps) => {
  // Compare dog data - this is the primary prop that affects rendering
  if (prevProps.dog?.id !== nextProps.dog?.id) return false;
  if (prevProps.dog?.callName !== nextProps.dog?.callName) return false;
  if (prevProps.dog?.name !== nextProps.dog?.name) return false;
  if (prevProps.dog?.imageUrl !== nextProps.dog?.imageUrl) return false;
  if (prevProps.dog?.dateOfBirth !== nextProps.dog?.dateOfBirth) return false;
  if (prevProps.dog?.birthDate !== nextProps.dog?.birthDate) return false;
  if (prevProps.dog?.breed !== nextProps.dog?.breed) return false;
  if (prevProps.dog?.sex !== nextProps.dog?.sex) return false;
  if (prevProps.dog?.gender !== nextProps.dog?.gender) return false;
  
  // Compare owner data that affects rendering
  if (prevProps.dog?.owner?.id !== nextProps.dog?.owner?.id) return false;
  if (prevProps.dog?.ownerName !== nextProps.dog?.ownerName) return false;
  
  // Compare registrations array length
  if (prevProps.dog?.registrations?.length !== nextProps.dog?.registrations?.length) return false;
  
  return true;
});
