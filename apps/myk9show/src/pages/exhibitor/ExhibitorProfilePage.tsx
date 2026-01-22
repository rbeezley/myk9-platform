/**
 * Exhibitor Profile Page
 * Allows exhibitors to view and edit their profile and manage their dogs
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Mail, Phone, MapPin, Dog, Plus, Pencil, Trash2, Crown, Save, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthContext } from '@/hooks/useAuthContext';
import { exhibitorService, UpdatePersonData, CreateDogData, ExhibitorDog } from '@/services/exhibitorService';
import { getInitials } from '@/lib/utils';
import { ImageUpload } from '@/components/ui/image-upload';
import { uploadProfilePhoto, uploadDogPhoto } from '@/services/imageUploadService';

/**
 * Format phone number for display
 * Converts 9187067590 to (918) 706-7590
 */
function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export default function ExhibitorProfilePage() {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isDogDialogOpen, setIsDogDialogOpen] = useState(false);
  const [editingDog, setEditingDog] = useState<ExhibitorDog | null>(null);
  const [deleteConfirmDog, setDeleteConfirmDog] = useState<ExhibitorDog | null>(null);

  // Fetch profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['exhibitorProfile', user?.id],
    queryFn: () => exhibitorService.getProfile(user!.id),
    enabled: !!user?.id,
  });

  // Fetch dogs
  const { data: dogs = [], isLoading: dogsLoading } = useQuery({
    queryKey: ['exhibitorDogs', profile?.person_id],
    queryFn: () => exhibitorService.getDogs(profile!.person_id),
    enabled: !!profile?.person_id,
  });

  // Update person mutation
  const updatePersonMutation = useMutation({
    mutationFn: (updates: UpdatePersonData) =>
      exhibitorService.updatePerson(profile!.person_id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibitorProfile'] });
      setIsEditingProfile(false);
    },
  });

  // Create dog mutation
  const createDogMutation = useMutation({
    mutationFn: (data: CreateDogData) =>
      exhibitorService.createDog(profile!.person_id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibitorDogs'] });
      setIsDogDialogOpen(false);
      setEditingDog(null);
    },
  });

  // Update dog mutation
  const updateDogMutation = useMutation({
    mutationFn: ({ dogId, data }: { dogId: string; data: Partial<CreateDogData> }) =>
      exhibitorService.updateDog(dogId, profile!.person_id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibitorDogs'] });
      setIsDogDialogOpen(false);
      setEditingDog(null);
    },
  });

  // Delete dog mutation
  const deleteDogMutation = useMutation({
    mutationFn: (dogId: string) =>
      exhibitorService.deleteDog(dogId, profile!.person_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibitorDogs'] });
      setDeleteConfirmDog(null);
    },
  });

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

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

  return (
    <div className="container mx-auto px-4 pt-20 pb-8 max-w-4xl">
      {/* Profile Header with Avatar */}
      <Card className="border border-border rounded-2xl shadow-sm mb-6">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <ImageUpload
              currentImage={person?.profile_image}
              fallback={
                <span className="text-3xl font-semibold text-muted-foreground">
                  {getInitials(person?.first_name, person?.last_name)}
                </span>
              }
              size="lg"
              onUpload={async (file) => {
                const result = await uploadProfilePhoto(user!.id, file);
                if (result.success && result.url) {
                  await updatePersonMutation.mutateAsync({ profile_image: result.url });
                }
                return result;
              }}
              onRemove={async () => {
                await updatePersonMutation.mutateAsync({ profile_image: null });
              }}
            />
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-bold mb-1">
                {person?.first_name} {person?.last_name}
              </h1>
              <p className="text-muted-foreground flex items-center justify-center sm:justify-start gap-2 mb-3">
                <Mail className="h-4 w-4" />
                {person?.email}
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                {profile.subscription_tier === 'free' ? (
                  <>
                    <Badge variant="secondary">Free Member</Badge>
                    <Button size="sm" className="gap-1.5 h-7">
                      <Sparkles className="h-3.5 w-3.5" />
                      Upgrade to Premium
                    </Button>
                  </>
                ) : (
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
                    <Crown className="h-3 w-3 mr-1" />
                    Premium Member
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
              onSave={(data) => updatePersonMutation.mutate(data)}
              onCancel={() => setIsEditingProfile(false)}
              isLoading={updatePersonMutation.isPending}
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
            <Button
              onClick={() => {
                setEditingDog(null);
                setIsDogDialogOpen(true);
              }}
            >
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
                  onEdit={() => {
                    setEditingDog(dog);
                    setIsDogDialogOpen(true);
                  }}
                  onDelete={() => setDeleteConfirmDog(dog)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dog Dialog */}
      <DogFormDialog
        open={isDogDialogOpen}
        onOpenChange={setIsDogDialogOpen}
        dog={editingDog}
        personId={profile.person_id}
        onSave={(data) => {
          if (editingDog) {
            updateDogMutation.mutate({ dogId: editingDog.id, data });
          } else {
            createDogMutation.mutate(data);
          }
        }}
        isLoading={createDogMutation.isPending || updateDogMutation.isPending}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirmDog} onOpenChange={() => setDeleteConfirmDog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Dog</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {deleteConfirmDog?.call_name || deleteConfirmDog?.name}?
              This will mark the dog as inactive but won't delete their entry history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmDog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmDog && deleteDogMutation.mutate(deleteConfirmDog.id)}
              disabled={deleteDogMutation.isPending}
            >
              {deleteDogMutation.isPending ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Profile Display Component
function ProfileDisplay({ person }: { person?: ExhibitorProfilePage['person'] }) {
  if (!person) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs">Name</Label>
        <p className="font-medium">{person.first_name} {person.last_name}</p>
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs flex items-center gap-1">
          <Mail className="h-3 w-3" /> Email
        </Label>
        <p>{person.email}</p>
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs flex items-center gap-1">
          <Phone className="h-3 w-3" /> Phone
        </Label>
        <p>{person.phone ? formatPhoneNumber(person.phone) : <span className="text-muted-foreground italic">Not provided</span>}</p>
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs flex items-center gap-1">
          <MapPin className="h-3 w-3" /> Address
        </Label>
        <p>
          {person.street_address ? (
            <>
              {person.street_address}
              {person.city && `, ${person.city}`}
              {person.state && `, ${person.state}`}
              {person.zip_code && ` ${person.zip_code}`}
            </>
          ) : (
            <span className="text-muted-foreground italic">Not provided</span>
          )}
        </p>
      </div>
    </div>
  );
}

// Profile Edit Form Component
function ProfileEditForm({
  person,
  onSave,
  onCancel,
  isLoading,
}: {
  person?: ExhibitorProfilePage['person'];
  onSave: (data: UpdatePersonData) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState<UpdatePersonData>({
    first_name: person?.first_name || '',
    last_name: person?.last_name || '',
    phone: person?.phone || '',
    street_address: person?.street_address || '',
    city: person?.city || '',
    state: person?.state || '',
    zip_code: person?.zip_code || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="first_name">First Name</Label>
          <Input
            id="first_name"
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last Name</Label>
          <Input
            id="last_name"
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone || ''}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="street_address">Address</Label>
          <Input
            id="street_address"
            value={formData.street_address || ''}
            onChange={(e) => setFormData({ ...formData, street_address: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={formData.city || ''}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              value={formData.state || ''}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zip_code">ZIP</Label>
            <Input
              id="zip_code"
              value={formData.zip_code || ''}
              onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
            />
          </div>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}

// Dog Card Component
function DogCard({
  dog,
  onEdit,
  onDelete,
}: {
  dog: ExhibitorDog;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center gap-4">
        <Avatar className="w-14 h-14 border border-border">
          {dog.image_url ? (
            <AvatarImage src={dog.image_url} alt={dog.call_name || dog.name} />
          ) : null}
          <AvatarFallback className="bg-muted">
            <Dog className="h-7 w-7 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold">{dog.call_name || dog.name}</p>
          <p className="text-sm text-muted-foreground">
            {dog.breed} {dog.sex && `• ${dog.sex.charAt(0).toUpperCase() + dog.sex.slice(1)}`}
          </p>
          {dog.akc_number && (
            <p className="text-xs text-muted-foreground font-mono">AKC: {dog.akc_number}</p>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit dog</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove dog</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// Dog Form Dialog
function DogFormDialog({
  open,
  onOpenChange,
  dog,
  onSave,
  isLoading,
  personId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dog: ExhibitorDog | null;
  onSave: (data: CreateDogData) => void;
  isLoading: boolean;
  personId: string;
}) {
  const [formData, setFormData] = useState<CreateDogData>({
    name: '',
    call_name: '',
    breed: '',
    date_of_birth: '',
    color: '',
    height: '',
    akc_number: '',
    microchip_number: '',
    image_url: '',
    spayed_neutered: false,
  });
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Reset form when dialog opens/closes or dog changes
  React.useEffect(() => {
    if (dog) {
      setFormData({
        name: dog.name,
        call_name: dog.call_name || '',
        breed: dog.breed,
        ...(dog.sex && { sex: dog.sex }),
        date_of_birth: dog.date_of_birth || '',
        color: dog.color || '',
        height: dog.height || '',
        akc_number: dog.akc_number || '',
        microchip_number: dog.microchip_number || '',
        image_url: dog.image_url || '',
        spayed_neutered: dog.spayed_neutered,
      });
    } else {
      setFormData({
        name: '',
        call_name: '',
        breed: '',
        date_of_birth: '',
        color: '',
        height: '',
        akc_number: '',
        microchip_number: '',
        image_url: '',
        spayed_neutered: false,
      });
    }
  }, [dog, open]);

  const handlePhotoUpload = async (file: File) => {
    setIsUploadingPhoto(true);
    try {
      const dogId = dog?.id || `new-${Date.now()}`;
      const result = await uploadDogPhoto(personId, dogId, file);
      if (result.success && result.url) {
        const url = result.url;
        setFormData(prev => ({ ...prev, image_url: url }));
      }
      return result;
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dog ? 'Edit Dog' : 'Add Dog'}</DialogTitle>
          <DialogDescription>
            {dog ? 'Update your dog\'s information' : 'Enter your dog\'s information for show entries'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Dog Photo Upload */}
          <div className="flex justify-center pb-2">
            <ImageUpload
              currentImage={formData.image_url || null}
              fallback={<Dog className="h-10 w-10 text-muted-foreground" />}
              size="lg"
              onUpload={handlePhotoUpload}
              onRemove={() => setFormData(prev => ({ ...prev, image_url: '' }))}
              isUploading={isUploadingPhoto}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dog-name">Registered Name *</Label>
              <Input
                id="dog-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dog-call_name">Call Name</Label>
              <Input
                id="dog-call_name"
                value={formData.call_name}
                onChange={(e) => setFormData({ ...formData, call_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dog-breed">Breed *</Label>
              <Input
                id="dog-breed"
                value={formData.breed}
                onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dog-sex">Gender</Label>
              <select
                id="dog-sex"
                value={formData.sex || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'male' || value === 'female') {
                    setFormData({ ...formData, sex: value });
                  } else {
                    // Remove sex property if value is empty
                    const { sex: _removed, ...rest } = formData;
                    setFormData(rest as CreateDogData);
                  }
                }}
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark]"
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dog-dob">Date of Birth</Label>
              <Input
                id="dog-dob"
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dog-color">Color</Label>
              <Input
                id="dog-color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dog-height">Jump Height</Label>
              <Input
                id="dog-height"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                placeholder="e.g., 16"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dog-akc">AKC Number</Label>
              <Input
                id="dog-akc"
                value={formData.akc_number}
                onChange={(e) => setFormData({ ...formData, akc_number: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="dog-microchip">Microchip Number</Label>
              <Input
                id="dog-microchip"
                value={formData.microchip_number}
                onChange={(e) => setFormData({ ...formData, microchip_number: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dog-spayed"
              checked={formData.spayed_neutered}
              onChange={(e) => setFormData({ ...formData, spayed_neutered: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="dog-spayed">Spayed/Neutered</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? 'Saving...' : dog ? 'Update Dog' : 'Add Dog'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Type for accessing person from profile
type ExhibitorProfilePage = {
  person: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    street_address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    country: string | null;
  } | undefined;
};
