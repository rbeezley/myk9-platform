import React from 'react';
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

import ThreeDotMenu from '@/components/common/ThreeDotMenu';
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

import type { Dog, Owner } from '@/types/dog-types';
import { PawPrint } from 'lucide-react';

interface DogCardProps {
  dog: Dog;
  variant?: 'simple' | 'details';
  owners?: Owner[];
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}

import DogPhotoDialog from './DogPhotoDialog';

/**
 * DogCard component displays dog information in two variants:
 * - 'simple': A compact card for lists and grids (standalone)
 * - 'details': A detailed view for the dog's profile page
 * 
 * When using the 'details' variant, this component should be wrapped in:
 * <EntityPageLayout>
 *   <EntityCardContainer>
 *     <DogCard variant="details" {...props} />
 *   </EntityCardContainer>
 * </EntityPageLayout>
 * 
 * This ensures consistent styling and layout across all entity detail pages.
 */
const DogCard: React.FC<DogCardProps> = ({
  dog,
  variant = 'simple',
  owners = [],
  onEdit,
  onDelete,
  className,
}) => {
  const [photoDialogOpen, setPhotoDialogOpen] = React.useState(false);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  // Note: Event handlers will be added when needed for specific interactions

  const handleEditPhoto = () => setPhotoDialogOpen(true);

  // Handlers for DogPhotoDialog
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = ev => setPreviewImage(ev.target?.result as string);
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
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = ev => setPreviewImage(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };
  const handleCancelPhoto = () => {
    setPhotoDialogOpen(false);
    setPreviewImage(null);
    setIsDragging(false);
  };
  const handleSavePhoto = () => {
    // TODO: Implement save logic (call parent or API)
    setPhotoDialogOpen(false);
    setPreviewImage(null);
    setIsDragging(false);
  };


  
  
  // Find the dog's primary owner
  const owner = owners.find(o => o.id === dog.ownerId);

  if (variant === 'details') {
    return (
      <div className="relative">
          {/* Menu */}
          <div
            className="absolute top-3 right-3 z-10"
            onClick={e => e.stopPropagation()}
          >
            <ThreeDotMenu
              onEdit={onEdit}
              onDelete={onDelete}
              onEditPhoto={handleEditPhoto}
            />
          </div>

          {/* Avatar */}
          <div className="h-44 overflow-hidden flex items-center justify-center p-3">
            <Avatar className="w-28 h-28 mx-auto mb-2 border-4 border-white dark:border-gray-700 shadow-lg dark:shadow-none bg-gray-100">
              <AvatarImage src={dog.imageUrl || '/placeholder-dog.png'} alt={dog.callName} className="object-cover object-top" />
              <AvatarFallback>
                {dog.callName?.[0] ?? <PawPrint className="w-12 h-12 text-gray-400" />}
              </AvatarFallback>
            </Avatar>
          </div>
          
          {/* Title */}
          <div className="py-0 flex flex-col items-center">
            <h3 className="text-xl font-bold text-center mt-[-0.75rem] mb-0">{dog.callName}</h3>
          </div>
          
          {/* Details */}
          <div className="px-6 pb-5 pt-2 text-base text-center space-y-1">
            <div>
              <span className="font-semibold">Gender:</span> {dog.gender || '—'}
            </div>
            <div>
              <span className="font-semibold">Date of Birth:</span> {dog.dateOfBirth || '—'}
            </div>
            <div>
              <span className="font-semibold">Primary Owner:</span> {owner?.name || '—'}
            </div>
            <div>
              <span className="font-semibold">Primary Owner Email:</span> {owner?.email || '—'}
            </div>
          </div>
          
          {/* Edit Photo Dialog */}
          <DogPhotoDialog
            open={photoDialogOpen}
            onOpenChange={setPhotoDialogOpen}
            previewImage={previewImage}
            currentPhoto={dog.imageUrl || '/placeholder-dog.png'}
            isDragging={isDragging}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onFileInput={handleFileInput}
            onCancel={handleCancelPhoto}
            onSave={handleSavePhoto}
          />
      </div>
    );
  }

  // Compact card for 'simple' variant
  return (
    <Card
      className={`overflow-hidden relative max-w-sm w-full mx-auto h-full min-h-0 transition-shadow transition-colors duration-200 hover:shadow-xl hover:border-blue-400 hover:border-2 cursor-pointer group ${className}`}
      tabIndex={0}
      aria-label={`Dog card for ${dog.callName}`}
    >
      <div
        className="absolute top-3 right-3 z-10"
        onClick={e => e.stopPropagation()}
      >
        <ThreeDotMenu
          onEdit={onEdit}
          onDelete={onDelete}
          onEditPhoto={handleEditPhoto}
        />
      </div>
      <div className="h-44 overflow-hidden flex items-center justify-center p-3 bg-card">
        <Avatar className="w-28 h-28 mx-auto mb-2 border-4 border-white dark:border-gray-700 shadow-lg dark:shadow-none bg-gray-100">
          <AvatarImage src={dog.imageUrl || '/placeholder-dog.png'} alt={dog.callName} className="object-cover object-top" />
          <AvatarFallback>
            {dog.callName?.[0] ?? <PawPrint className="w-12 h-12 text-gray-400" />}
          </AvatarFallback>
        </Avatar>
      </div>
      <CardHeader className="py-0 flex flex-col items-center">
        <CardTitle className="text-xl text-center mt-[-0.75rem] mb-0">{dog.callName}</CardTitle>
      </CardHeader>
    </Card>
  );
};

// React.memo optimization for DogCard performance
export default React.memo(DogCard, (prevProps, nextProps) => {
  // Compare dog object properties that affect rendering
  if (prevProps.dog.id !== nextProps.dog.id) return false;
  if (prevProps.dog.name !== nextProps.dog.name) return false;
  if (prevProps.dog.callName !== nextProps.dog.callName) return false;
  if (prevProps.dog.breed !== nextProps.dog.breed) return false;
  if (prevProps.dog.imageUrl !== nextProps.dog.imageUrl) return false;
  if (prevProps.variant !== nextProps.variant) return false;
  
  // Compare owners array length
  if (prevProps.owners?.length !== nextProps.owners?.length) return false;
  
  // Basic prop comparison
  if (prevProps.className !== nextProps.className) return false;
  
  // Callback props are assumed to be stable (memoized by parent)
  return true;
});
