/**
 * Exhibitor Profile Page
 *
 * Allows exhibitors to view and edit their profile and manage their dogs
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Dog, Plus, Pencil } from 'lucide-react';
import type { ExhibitorDog } from '@/services/exhibitorService';

import { useExhibitorProfileData } from './useExhibitorProfileData';
import { ProfileHeader } from './ProfileHeader';
import { ProfileDisplay } from './ProfileDisplay';
import { ProfileEditForm } from './ProfileEditForm';
import { DogCard } from './DogCard';
import { DogFormDialog } from './DogFormDialog';
import { DeleteDogDialog } from './DeleteDogDialog';

export default function ExhibitorProfilePage() {
  const {
    user,
    profile,
    profileLoading,
    dogs,
    dogsLoading,
    updatePerson,
    updatePersonAsync,
    isUpdatingPerson,
    createDog,
    isCreatingDog,
    updateDog,
    isUpdatingDog,
    deleteDog,
    isDeletingDog,
  } = useExhibitorProfileData();

  // UI state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isDogDialogOpen, setIsDogDialogOpen] = useState(false);
  const [editingDog, setEditingDog] = useState<ExhibitorDog | null>(null);
  const [deleteConfirmDog, setDeleteConfirmDog] = useState<ExhibitorDog | null>(null);

  // Loading state
  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // No profile found
  if (!profile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Profile not found. Please complete your registration.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const person = profile.person;

  const handleEditDog = (dog: ExhibitorDog) => {
    setEditingDog(dog);
    setIsDogDialogOpen(true);
  };

  const handleAddDog = () => {
    setEditingDog(null);
    setIsDogDialogOpen(true);
  };

  const handleDogSave = (data: Parameters<typeof createDog>[0]) => {
    if (editingDog) {
      updateDog(editingDog.id, data);
    } else {
      createDog(data);
    }
    setIsDogDialogOpen(false);
    setEditingDog(null);
  };

  const handleDeleteDog = () => {
    if (deleteConfirmDog) {
      deleteDog(deleteConfirmDog.id);
      setDeleteConfirmDog(null);
    }
  };

  const handleProfileSave = (data: Parameters<typeof updatePerson>[0]) => {
    updatePerson(data);
    setIsEditingProfile(false);
  };

  return (
    <div className="container mx-auto px-4 pt-20 pb-8 max-w-4xl">
      {/* Profile Header with Avatar */}
      <ProfileHeader
        person={person}
        subscriptionTier={profile.subscription_tier}
        userId={user!.id}
        onUpdateProfileImage={async (url) => {
          await updatePersonAsync({ profile_image: url });
        }}
      />

      {/* Personal Information */}
      <Card className="mb-6 border border-border rounded-2xl shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
              <CardDescription>Your contact details for show entries</CardDescription>
            </div>
            {!isEditingProfile && (
              <Button variant="outline" size="sm" onClick={() => setIsEditingProfile(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isEditingProfile ? (
            <ProfileEditForm
              person={person}
              onSave={handleProfileSave}
              onCancel={() => setIsEditingProfile(false)}
              isLoading={isUpdatingPerson}
            />
          ) : (
            <ProfileDisplay person={person} />
          )}
        </CardContent>
      </Card>

      {/* Dogs */}
      <Card className="border border-border rounded-2xl shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Dog className="h-5 w-5" />
                My Dogs
              </CardTitle>
              <CardDescription>Manage your dogs for show entries</CardDescription>
            </div>
            <Button onClick={handleAddDog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Dog
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {dogsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : dogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Dog className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No dogs added yet</p>
              <p className="text-sm">Add your first dog to get started with entries</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dogs.map((dog) => (
                <DogCard
                  key={dog.id}
                  dog={dog}
                  onEdit={() => handleEditDog(dog)}
                  onDelete={() => setDeleteConfirmDog(dog)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dog Form Dialog */}
      <DogFormDialog
        open={isDogDialogOpen}
        onOpenChange={(open) => {
          setIsDogDialogOpen(open);
          if (!open) setEditingDog(null);
        }}
        dog={editingDog}
        userId={user!.id}
        onSave={handleDogSave}
        isLoading={isCreatingDog || isUpdatingDog}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteDogDialog
        dog={deleteConfirmDog}
        onOpenChange={() => setDeleteConfirmDog(null)}
        onConfirm={handleDeleteDog}
        isDeleting={isDeletingDog}
      />
    </div>
  );
}
