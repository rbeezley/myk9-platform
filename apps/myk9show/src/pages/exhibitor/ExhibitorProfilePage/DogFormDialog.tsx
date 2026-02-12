/**
 * Dog Form Dialog Component
 *
 * Dialog for adding or editing dog information
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Dog, Save } from 'lucide-react';
import { ImageUpload } from '@/components/ui/image-upload';
import { uploadDogPhoto } from '@/services/imageUploadService';
import type { ExhibitorDog, CreateDogData } from '@/services/exhibitorService';

interface DogFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dog: ExhibitorDog | null;
  userId: string;
  onSave: (data: CreateDogData) => void;
  isLoading: boolean;
}

const initialFormData: CreateDogData = {
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
};

export function DogFormDialog({
  open,
  onOpenChange,
  dog,
  userId,
  onSave,
  isLoading,
}: DogFormDialogProps) {
  const [formData, setFormData] = useState<CreateDogData>(initialFormData);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Reset form when dialog opens/closes or dog changes
  useEffect(() => {
    if (dog) {
      setFormData({
        name: dog.name,
        call_name: dog.call_name || '',
        breed: dog.breed,
        ...(dog.sex === 'male' || dog.sex === 'female' ? { sex: dog.sex } : {}),
        date_of_birth: dog.date_of_birth || '',
        color: dog.color || '',
        height: dog.height || '',
        akc_number: dog.akc_number || '',
        microchip_number: dog.microchip_number || '',
        image_url: dog.image_url || '',
        spayed_neutered: dog.spayed_neutered ?? false,
      });
    } else {
      setFormData(initialFormData);
    }
  }, [dog, open]);

  const handlePhotoUpload = async (file: File) => {
    setIsUploadingPhoto(true);
    try {
      const dogId = dog?.id || `new-${Date.now()}`;
      const result = await uploadDogPhoto(userId, dogId, file);
      if (result.success && result.url) {
        setFormData((prev) => ({ ...prev, image_url: result.url! }));
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

  const handleSexChange = (value: string) => {
    if (value === 'male' || value === 'female') {
      setFormData({ ...formData, sex: value });
    } else {
      const { sex: _removed, ...rest } = formData;
      setFormData(rest as CreateDogData);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dog ? 'Edit Dog' : 'Add Dog'}</DialogTitle>
          <DialogDescription>
            {dog
              ? "Update your dog's information"
              : "Enter your dog's information for show entries"}
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
              onRemove={() => setFormData((prev) => ({ ...prev, image_url: '' }))}
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
                onChange={(e) => handleSexChange(e.target.value)}
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
