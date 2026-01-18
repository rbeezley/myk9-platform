/**
 * Exhibitor Profile Page
 * Allows exhibitors to view and edit their profile and manage their dogs
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Mail, Phone, MapPin, Dog, Plus, Edit2, Trash2, Crown, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthContext } from '@/hooks/useAuthContext';
import { exhibitorService, UpdatePersonData, CreateDogData, ExhibitorDog } from '@/services/exhibitorService';

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
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">My Profile</h1>

      {/* Subscription Status */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5" />
              Subscription
            </CardTitle>
            <Badge variant={profile.subscription_tier === 'free' ? 'secondary' : 'default'}>
              {profile.subscription_tier.charAt(0).toUpperCase() + profile.subscription_tier.slice(1)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {profile.subscription_tier === 'free' ? (
            <p className="text-sm text-muted-foreground">
              Upgrade to Premium for unlimited entries and priority support.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {profile.subscription_expires_at
                ? `Renews on ${new Date(profile.subscription_expires_at).toLocaleDateString()}`
                : 'Active subscription'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card className="mb-6">
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
                <Edit2 className="h-4 w-4 mr-2" />
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
      <Card>
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
        <p>{person.phone || 'Not provided'}</p>
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs flex items-center gap-1">
          <MapPin className="h-3 w-3" /> Address
        </Label>
        <p>
          {person.address ? (
            <>
              {person.address}
              {person.city && `, ${person.city}`}
              {person.state && `, ${person.state}`}
              {person.zip && ` ${person.zip}`}
            </>
          ) : (
            'Not provided'
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
    address: person?.address || '',
    city: person?.city || '',
    state: person?.state || '',
    zip: person?.zip || '',
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
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            value={formData.address || ''}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
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
            <Label htmlFor="zip">ZIP</Label>
            <Input
              id="zip"
              value={formData.zip || ''}
              onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
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
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex items-center gap-4">
        {dog.image_url ? (
          <img
            src={dog.image_url}
            alt={dog.call_name || dog.name}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Dog className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div>
          <p className="font-medium">{dog.call_name || dog.name}</p>
          <p className="text-sm text-muted-foreground">
            {dog.breed} {dog.sex && `• ${dog.sex}`}
          </p>
          {dog.akc_number && (
            <p className="text-xs text-muted-foreground">AKC: {dog.akc_number}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dog: ExhibitorDog | null;
  onSave: (data: CreateDogData) => void;
  isLoading: boolean;
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
    spayed_neutered: false,
  });

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
        spayed_neutered: false,
      });
    }
  }, [dog, open]);

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
              <Label htmlFor="dog-sex">Sex</Label>
              <Select
                value={formData.sex || ''}
                onValueChange={(value) => {
                  if (value === 'male' || value === 'female') {
                    setFormData({ ...formData, sex: value });
                  } else {
                    // Remove sex property if value is invalid
                    const { sex: _removed, ...rest } = formData;
                    setFormData(rest as CreateDogData);
                  }
                }}
              >
                <SelectTrigger id="dog-sex">
                  <SelectValue placeholder="Select sex" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
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
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
  } | undefined;
};
