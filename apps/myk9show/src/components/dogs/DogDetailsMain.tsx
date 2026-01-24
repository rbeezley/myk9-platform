import React, { useState, useEffect, startTransition, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { logger } from '@/services/LoggingService';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { 
  Crown, 
 
  Camera,
  FileText,
  Activity,
  Clock,
  User as UserIcon,
  Award,
  Heart,
  Sparkles,
  Star,
  Smile,
  PawPrint
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import Breadcrumb from '@/components/common/Breadcrumb';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import ThreeDotMenu from '@/components/common/ThreeDotMenu';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import { PremiumGate } from '@/components/common/PremiumGate';

// Lazy load heavy components
const DogEditPanel = lazy(() => import('@/components/panels/edit/DogEditPanel').then(m => ({ default: m.DogEditPanel })));
const DeleteDogDialog = lazy(() => import('@/components/dogs/common/DeleteDogDialog').then(m => ({ default: m.DeleteDogDialog })));
const PhotoDialog = lazy(() => import('@/components/common/PhotoDialog'));
const PedigreeSection = lazy(() => import('@/components/dogs/DogDetails/Pedigree/PedigreeSection'));
const TrainingSection = lazy(() => import('@/components/dogs/DogDetails/TrainingJournal/TrainingSection'));
const HealthRecordsSection = lazy(() => import('@/components/dogs/DogDetails/HealthRecords/HealthRecordsSection'));
const CompetitionsTabs = lazy(() => import('@/components/dogs/DogDetails/Competitions/CompetitionsTabs'));
const TitleProgressSection = lazy(() => import('@/components/dogs/DogDetails/TitleTracking/TitleProgressSection'));
import { mockPedigreeData } from '@/data/mockPedigreeData';
import type { Dog, Owner, DogInput } from '@/types/dog-types';
import type { User } from '@/types/user-types';
import type { ExtendedAncestor } from '@/components/dogs/DogDetails/Pedigree/PedigreeAncestorAddDialog';
import { getInitials } from '@/lib/utils';
import '@/styles/apple-show-details.css';

// TEMP: Mock user object for demo/testing premium gating
const user = { isPremium: true };

// Constants
const CELEBRATION_DURATION_MS = 3000;
const CELEBRATION_FADE_DELAY_MS = 1000;

// Skeleton Components
const DogEditPanelSkeleton = () => (
  <div className="p-6 space-y-6">
    <div className="space-y-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
    <div className="flex justify-end gap-2">
      <Skeleton className="h-10 w-20" />
      <Skeleton className="h-10 w-24" />
    </div>
  </div>
);

const DeleteDialogSkeleton = () => (
  <div className="p-6 space-y-4">
    <Skeleton className="h-6 w-48" />
    <Skeleton className="h-4 w-72" />
    <div className="flex justify-end gap-2 pt-4">
      <Skeleton className="h-10 w-20" />
      <Skeleton className="h-10 w-20" />
    </div>
  </div>
);

const PhotoDialogSkeleton = () => (
  <div className="p-6 space-y-4">
    <Skeleton className="h-6 w-40" />
    <Skeleton className="h-48 w-full rounded-lg" />
    <div className="flex justify-end gap-2">
      <Skeleton className="h-10 w-20" />
      <Skeleton className="h-10 w-20" />
    </div>
  </div>
);

const TabContentSkeleton = () => (
  <div className="pt-6 space-y-6">
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="flex justify-between items-center pt-4">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
    </Card>
  </div>
);

/**
 * Formats a date string from storage format (YYYY-MM-DD) to display format (M/D/YYYY)
 */
function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';

  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateStr.split('-');
    return `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}`;
  }

  return dateStr;
}

/**
 * Displays a value or a clickable "Add" prompt when empty
 */
interface EditableValueProps {
  value: string | undefined | null;
  onEdit: () => void;
  suffix?: string;
  formatFn?: (val: string) => string;
}

const EditableValue: React.FC<EditableValueProps> = ({ value, onEdit, suffix = '', formatFn }) => {
  if (value) {
    const displayValue = formatFn ? formatFn(value) : value;
    return <span className="text-sm font-medium text-foreground">{displayValue}{suffix}</span>;
  }

  return (
    <button
      onClick={onEdit}
      className="text-sm font-medium text-primary/70 hover:text-primary
                 transition-colors cursor-pointer hover:underline"
    >
      Add
    </button>
  );
};

interface DogDetailsMainProps {
  dog: Dog;
  fromPerson?: User | undefined; // User object when navigating from a person's page
  onDelete?: () => void; // Callback for when dog is deleted
  onUpdate?: (id: string, updates: Partial<DogInput>) => Promise<Dog | null>; // Callback for when dog is updated
}

const DogDetailsMain: React.FC<DogDetailsMainProps> = ({ dog, fromPerson, onDelete, onUpdate }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [autoOpenAddRegistration, setAutoOpenAddRegistration] = useState(false);
  const people = useUserStore(state => state.people);
  const { getUserRoles } = useAuthContext();
  const userRole = getUserRoles()[0]; // Get primary role

  // Check for addRegistration query parameter on mount
  useEffect(() => {
    const shouldAddRegistration = searchParams.get('addRegistration') === 'true';
    if (shouldAddRegistration) {
      setAutoOpenAddRegistration(true);
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
  
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [ancestors, setAncestors] = useState<ExtendedAncestor[]>(mockPedigreeData);

  // Photo Dialog State
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const [updatedDog, setUpdatedDog] = useState<Dog>(dog);
  const [isPhotoHovered] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [recentUpdate, setRecentUpdate] = useState<string | null>(null);

  // Photo validation constants
  const MAX_FILE_SIZE_MB = 5;
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  // Validate image file
  const validateImageFile = (file: File): { valid: boolean; error?: string } => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return { valid: false, error: 'Please select a valid image file (JPEG, PNG, GIF, or WebP)' };
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return { valid: false, error: `Image must be smaller than ${MAX_FILE_SIZE_MB}MB` };
    }
    return { valid: true };
  };

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
      const validation = validateImageFile(file);
      if (!validation.valid) {
        toast.error(validation.error);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.onerror = () => toast.error('Failed to read the image file');
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
      const validation = validateImageFile(file);
      if (!validation.valid) {
        toast.error(validation.error);
        e.target.value = ''; // Reset input
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.onerror = () => toast.error('Failed to read the image file');
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoSave = (preview: string | null) => {
    if (preview) {
      setUpdatedDog({ ...updatedDog, imageUrl: preview });
    }
    setIsPhotoDialogOpen(false);
    setPhotoPreview(null);
  };

  const handlePremiumTabClick = (e: React.MouseEvent) => {
    if (!user.isPremium) {
      e.preventDefault();
      logger.debug('Premium feature clicked', 'dogs');
    }
  };

  // Convert Dog form data to DogInput for database updates
  const convertDogToDogInput = (dogData: Partial<Dog>): Partial<DogInput> => {
    // Extract breed from registrations or use existing dog breed
    const breed = dogData.registrations?.[0]?.breed ||
                  updatedDog.registrations?.[0]?.breed ||
                  'Unknown';

    // Build result object conditionally to comply with exactOptionalPropertyTypes
    const result: Partial<DogInput> = {
      breed: breed,
      sex: (dogData.sex || dogData.gender?.toLowerCase()) as 'male' | 'female',
      ownerId: dogData.ownerId || dog.ownerId,
    };

    // Only add optional properties if they have defined values
    const name = dogData.callName || dogData.name;
    if (name !== undefined) result.name = name;
    if (dogData.callName !== undefined) result.callName = dogData.callName;
    const birthDate = dogData.dateOfBirth || dogData.birthDate;
    if (birthDate !== undefined) result.birthDate = birthDate;
    if (dogData.color !== undefined) result.color = dogData.color;
    const weight = typeof dogData.weight === 'string' ? parseFloat(dogData.weight) : dogData.weight;
    if (weight !== undefined) result.weight = weight;
    const height = typeof dogData.height === 'string' ? parseFloat(dogData.height) : dogData.height;
    if (height !== undefined) result.height = height;
    if (dogData.ownerName !== undefined) result.ownerName = dogData.ownerName;
    const microchipNumber = dogData.microchip || dogData.microchipNumber;
    if (microchipNumber !== undefined) result.microchipNumber = microchipNumber;
    if (dogData.imageUrl !== undefined) result.imageUrl = dogData.imageUrl;
    if (dogData.registrations !== undefined) {
      result.registrations = dogData.registrations.map(reg => ({
        organization: reg.organization,
        number: reg.registrationNumber,
        registeredName: reg.registeredName,
        type: reg.breed || 'Unknown',
        status: reg.status
      }));
    }
    if (dogData.healthRecords !== undefined) result.healthRecords = dogData.healthRecords;

    return result;
  };

  // Generate breadcrumb items
  const breadcrumbItems = useBreadcrumb({
    currentPage: fromPerson ? 'dog' : 'dog',
    dog: updatedDog,
    fromPerson
  });

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-8">
      {/* Breadcrumb Navigation */}
      <Breadcrumb items={breadcrumbItems} showHomeIcon={true} className="mb-6" />

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
            onEdit={() => setIsEditPanelOpen(true)}
            onEditPhoto={() => handlePhotoDialogOpen(true)}
            onDelete={() => setIsDeleteDialogOpen(true)}
            editLabel="Edit Dog"
          />
        </div>
        
        {/* Hero content */}
        <div className="relative">
          <div className="flex items-start gap-8">
            {/* Enhanced Profile Photo */}
            <div className="flex-shrink-0">
              <button 
                type="button"
                onClick={() => handlePhotoDialogOpen(true)}
                className="relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
                aria-label="Edit dog photo"
              >
                {/* Glow effect */}
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-600/20 
                               rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 
                               blur-sm" />
                
                <Avatar className="relative w-28 h-28 border-2 border-white/20 shadow-2xl
                                 group-hover:scale-105 transition-all duration-300">
                  {updatedDog.imageUrl ? (
                    <AvatarImage 
                      src={updatedDog.imageUrl} 
                      alt={`${updatedDog.callName}'s photo`} 
                      className="object-cover" 
                    />
                  ) : (
                    <AvatarFallback className="bg-gradient-to-br from-primary/10 to-primary/5 
                                             text-2xl font-semibold text-primary backdrop-blur-sm">
                      {getInitials(updatedDog.callName)}
                    </AvatarFallback>
                  )}
                </Avatar>
                
                {/* Playful paw prints on hover */}
                {isPhotoHovered && (
                  <div className="absolute -top-2 -right-2 animate-bounce">
                    <PawPrint className="w-4 h-4 text-primary/60" />
                  </div>
                )}
                
                {/* Camera overlay with heart */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 
                               group-hover:bg-black/40 transition-all duration-300 rounded-full">
                  <div className="p-3 bg-white/90 rounded-full opacity-0 group-hover:opacity-100 
                                 transform scale-75 group-hover:scale-100 transition-all duration-300">
                    <div className="relative">
                      <Camera className="w-5 h-5 text-gray-800" />
                      <Heart className="w-2 h-2 text-pink-500 absolute -top-1 -right-1 fill-current" />
                    </div>
                  </div>
                </div>
              </button>
            </div>
            
            {/* Enhanced Dog Info */}
            <div className="flex-1 space-y-4">
              <div className="relative">
                <div className="flex items-center gap-2">
                  <h1 className="text-4xl font-bold text-foreground mb-2 tracking-tight">
                    {updatedDog.callName}
                  </h1>
                  {/* Celebration sparkles */}
                  {showCelebration && (
                    <div className="flex gap-1 animate-bounce">
                      <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" />
                      <Star className="w-5 h-5 text-yellow-400 animate-spin" />
                    </div>
                  )}
                </div>
                {/* Recent update celebration */}
                {recentUpdate && (
                  <div className="absolute -top-2 left-0 bg-gradient-to-r from-emerald-400 to-emerald-500 
                                 text-white px-3 py-1 rounded-full text-xs font-medium animate-pulse">
                    <Smile className="w-3 h-3 inline mr-1" />
                    {recentUpdate}
                  </div>
                )}
                <p className="text-lg text-foreground font-medium tracking-wide">
                  {(() => {
                    if (!updatedDog.registrations || updatedDog.registrations.length === 0) {
                      return 'No breed registered';
                    }

                    // Get unique breeds from all registrations
                    const breeds = Array.from(new Set(
                      updatedDog.registrations.map(reg => reg.breed).filter(Boolean)
                    ));

                    if (breeds.length === 0) {
                      return 'Breed not specified';
                    }

                    return breeds.join(', ');
                  })()}
                </p>
              </div>
              
              {/* Status badges with glass effect */}
              <div className="flex flex-wrap gap-3">
                {updatedDog.gender && (
                  <Badge className="px-4 py-2 text-sm font-medium 
                                 bg-gradient-to-r from-primary/10 to-primary/5 
                                 text-primary border border-primary/20 
                                 backdrop-blur-sm hover:scale-105 
                                 transition-all duration-200">
                    <Activity className="w-3 h-3 mr-2" />
                    {updatedDog.gender.charAt(0).toUpperCase() + updatedDog.gender.slice(1)}
                  </Badge>
                )}
                {updatedDog.dateOfBirth && (
                  <Badge className="px-4 py-2 text-sm font-medium 
                                 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 
                                 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 
                                 backdrop-blur-sm hover:scale-105 
                                 transition-all duration-200">
                    <Clock className="w-3 h-3 mr-2" />
                    Born {formatDisplayDate(updatedDog.dateOfBirth)}
                  </Badge>
                )}
                {updatedDog.registrations && updatedDog.registrations.length > 0 && (
                  <Badge className="px-4 py-2 text-sm font-medium 
                                 bg-gradient-to-r from-purple-500/10 to-purple-500/5 
                                 text-purple-600 dark:text-purple-400 border border-purple-500/20 
                                 backdrop-blur-sm hover:scale-105 
                                 transition-all duration-200">
                    <Award className="w-3 h-3 mr-2" />
                    {updatedDog.registrations.length} Registration{updatedDog.registrations.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>

            </div>
          </div>
        </div>
      </Card>

      {/* Information Grid - Apple-style cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Dog Information Card */}
        <Card className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border 
                         rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500 
                         hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] to-transparent 
                          opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />
          
          <div className="relative space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-gradient-to-br from-pink-500/10 to-rose-500/5 rounded-xl 
                             hover:scale-110 transition-transform duration-200">
                <Heart className="h-5 w-5 text-pink-500 hover:text-rose-500 transition-colors duration-200" />
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                About {updatedDog.callName}
              </h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Registered Name
                </span>
                <EditableValue
                  value={updatedDog.registrations?.[0]?.registeredName}
                  onEdit={() => setIsEditPanelOpen(true)}
                />
              </div>
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Sex
                </span>
                <EditableValue
                  value={updatedDog.gender}
                  onEdit={() => setIsEditPanelOpen(true)}
                  formatFn={(val) => val.charAt(0).toUpperCase() + val.slice(1)}
                />
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Date of Birth
                </span>
                <EditableValue
                  value={updatedDog.dateOfBirth}
                  onEdit={() => setIsEditPanelOpen(true)}
                  formatFn={formatDisplayDate}
                />
              </div>
            </div>
          </div>
        </Card>
        
        {/* Physical Characteristics Card */}
        <Card className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border 
                         rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500 
                         hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.02] to-transparent 
                          opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />
          
          <div className="relative space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 rounded-xl">
                <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Physical Characteristics
              </h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Height
                </span>
                <EditableValue
                  value={updatedDog.height}
                  onEdit={() => setIsEditPanelOpen(true)}
                  suffix='"'
                />
              </div>
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Weight
                </span>
                <EditableValue
                  value={updatedDog.weight}
                  onEdit={() => setIsEditPanelOpen(true)}
                  suffix=" lbs"
                />
              </div>
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Color
                </span>
                <EditableValue
                  value={updatedDog.color}
                  onEdit={() => setIsEditPanelOpen(true)}
                />
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Microchip
                </span>
                <EditableValue
                  value={updatedDog.microchip}
                  onEdit={() => setIsEditPanelOpen(true)}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Owner Information Card */}
      <Card className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border 
                       rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500 
                       hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.02] to-transparent 
                        opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />
        
        <div className="relative space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-xl">
              <UserIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Owner Information
            </h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-br 
                           from-muted/20 to-muted/10 rounded-xl apple-subtle-card-border">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Owner Name
              </span>
              {owner.id !== 'unknown' ? (
                <span
                  className="text-sm font-medium text-primary dark:text-white hover:text-primary/80 dark:hover:text-white/80
                             transition-colors duration-200 hover:underline cursor-pointer"
                  onClick={() => startTransition(() => navigate(`/people/${owner.id}?fromDog=${updatedDog.id}`))}
                >
                  {owner.name}
                </span>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">
                  {owner.name}
                </span>
              )}
            </div>
            
            <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-br 
                           from-muted/20 to-muted/10 rounded-xl apple-subtle-card-border">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Email
              </span>
              {owner.email && owner.email !== 'N/A' ? (
                <a href={`mailto:${owner.email}`} 
                   className="text-sm font-medium text-primary dark:text-white hover:text-primary/80 dark:hover:text-white/80 
                            transition-colors duration-200 hover:underline">
                  {owner.email}
                </a>
              ) : (
                <span className="text-sm font-medium text-foreground">Not specified</span>
              )}
            </div>
            
            {owner.phone && owner.phone !== 'N/A' && (
              <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-br 
                             from-muted/20 to-muted/10 rounded-xl apple-subtle-card-border">
                <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  Phone
                </span>
                <a href={`tel:${owner.phone.replace(/[^\d]/g, '')}`} 
                   className="text-sm font-medium text-primary dark:text-white hover:text-primary/80 dark:hover:text-white/80 
                            transition-colors duration-200 hover:underline">
                  {owner.phone}
                </a>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Dog Summary Card */}
      <Card className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border 
                       rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500 
                       hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.02] to-transparent 
                        opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />
        
        <div className="relative space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-xl">
              <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Dog Summary
            </h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                           from-muted/30 to-muted/10 rounded-xl apple-subtle-card-border
                           hover:scale-105 transition-all duration-300">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
                Registrations
              </span>
              <span className="text-lg font-semibold text-foreground">
                {updatedDog.registrations?.length || 0}
              </span>
            </div>

            <div className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                           from-muted/30 to-muted/10 rounded-xl apple-subtle-card-border
                           hover:scale-105 transition-all duration-300">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
                Competitions
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Coming soon
              </span>
            </div>

            <div className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                           from-muted/30 to-muted/10 rounded-xl apple-subtle-card-border
                           hover:scale-105 transition-all duration-300">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
                Titles Earned
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Coming soon
              </span>
            </div>

            <div className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                           from-muted/30 to-muted/10 rounded-xl apple-subtle-card-border
                           hover:scale-105 transition-all duration-300">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
                Health Records
              </span>
              <span className="text-lg font-semibold text-foreground">
                {(updatedDog.healthRecords?.vaccinations?.length || 0) +
                  (updatedDog.healthRecords?.medications?.length || 0) +
                  (updatedDog.healthRecords?.allergies?.length || 0)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Navigation Tabs */}
      <div className="space-y-6">
        <TooltipProvider>
          <Tabs defaultValue="registrations" className="w-full">
            <TabsList className="overflow-x-auto no-scrollbar">
              <TabsTrigger value="registrations">
                <FileText className="w-4 h-4" />
                Registrations
              </TabsTrigger>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value="competitions"
                    disabled={!user.isPremium}
                    onClick={!user.isPremium ? handlePremiumTabClick : undefined}
                  >
                    <Crown className="w-4 h-4" />
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
                  >
                    <Crown className="w-4 h-4" />
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
                  >
                    <Crown className="w-4 h-4" />
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
                  >
                    <Crown className="w-4 h-4" />
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
                  >
                    <Crown className="w-4 h-4" />
                    Pedigree
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Access Pedigree - Premium Feature</p>
                </TooltipContent>
              </Tooltip>
            </TabsList>
            
            {/* Tab Content */}
            <TabsContent value="registrations" className="pt-6">
              <RegistrationsSection dog={updatedDog} autoOpenAddDialog={autoOpenAddRegistration} />
            </TabsContent>

            <TabsContent value="competitions" className="pt-6">
              {user.isPremium ? (
                <Suspense fallback={<TabContentSkeleton />}>
                  <CompetitionsTabs />
                </Suspense>
              ) : (
                <PremiumGate
                  title="Competitions"
                  description="Track your dog's competition history and achievements with our premium features."
                  trackingContext="competitions"
                />
              )}
            </TabsContent>

            <TabsContent value="title-progress" className="pt-6">
              {user.isPremium ? (
                <Suspense fallback={<TabContentSkeleton />}>
                  <TitleProgressSection initialTitleProgressList={[]} />
                </Suspense>
              ) : (
                <PremiumGate
                  title="Title Progress"
                  description="Monitor your dog's progress toward titles and certifications."
                  trackingContext="title-progress"
                />
              )}
            </TabsContent>

            <TabsContent value="health-records" className="pt-6">
              {user.isPremium ? (
                <Suspense fallback={<TabContentSkeleton />}>
                  <HealthRecordsSection user={user} />
                </Suspense>
              ) : (
                <PremiumGate
                  title="Health Records"
                  description="Keep comprehensive health records for your dog's wellbeing."
                  trackingContext="health-records"
                />
              )}
            </TabsContent>

            <TabsContent value="training-journal" className="pt-6">
              {user.isPremium ? (
                <Suspense fallback={<TabContentSkeleton />}>
                  <TrainingSection />
                </Suspense>
              ) : (
                <PremiumGate
                  title="Training Journal"
                  description="Document training sessions and track your dog's progress."
                  trackingContext="training-journal"
                />
              )}
            </TabsContent>

            <TabsContent value="pedigree" className="pt-6">
              {user.isPremium ? (
                <Suspense fallback={<TabContentSkeleton />}>
                  <PedigreeSection
                    header={<h2 className="text-lg font-semibold flex items-center">Pedigree</h2>}
                    pedigree={ancestors.length > 0 ? ancestors : mockPedigreeData}
                    addAncestor={(ancestor) => setAncestors(prev => [...prev, { ...ancestor, id: String(Date.now()) }])}
                    editAncestor={(id, updated) => setAncestors(prev => prev.map(a => String(a.id) === id ? updated : a))}
                    deleteAncestor={(id) => setAncestors(prev => prev.filter(a => String(a.id) !== id))}
                  />
                </Suspense>
              ) : (
                <PremiumGate
                  title="Pedigree"
                  description="Explore your dog's lineage and ancestry with detailed pedigree tracking."
                  trackingContext="pedigree"
                />
              )}
            </TabsContent>
            </Tabs>
          </TooltipProvider>
        </div>

      {/* Edit Panel */}
      <Suspense fallback={<DogEditPanelSkeleton />}>
        <DogEditPanel
          open={isEditPanelOpen}
          onClose={() => setIsEditPanelOpen(false)}
          dogId={updatedDog.id}
          dogName={updatedDog.callName || ''}
          initialDogData={updatedDog}
          userRole={userRole}
          people={people}
          onSave={async (updatedDogData) => {
          // Store previous state for rollback on error
          const previousDog = { ...updatedDog };

          try {
            // Update local state immediately for UI feedback
            setUpdatedDog({ ...updatedDog, ...updatedDogData });

            // Save to database if onUpdate prop is available
            if (onUpdate) {
              const dogInputData = convertDogToDogInput(updatedDogData);
              logger.debug('Saving dog data to database', 'dogs', { dogId: updatedDog.id, dogInputData });
              const savedDog = await onUpdate(updatedDog.id, dogInputData);

              if (savedDog) {
                // Update with the data returned from the database
                setUpdatedDog(savedDog);
                logger.debug('Dog data saved successfully', 'dogs', { dogId: savedDog.id });

                // Show success celebration
                setShowCelebration(true);
                setRecentUpdate(`${updatedDog.callName} updated!`);
                setTimeout(() => {
                  setShowCelebration(false);
                  setTimeout(() => setRecentUpdate(null), CELEBRATION_FADE_DELAY_MS);
                }, CELEBRATION_DURATION_MS);

                toast.success('Changes saved successfully');
                setIsEditPanelOpen(false);
              } else {
                throw new Error('No data returned from update');
              }
            } else {
              // No onUpdate prop - just close panel (local-only mode)
              setIsEditPanelOpen(false);
            }
          } catch (error) {
            logger.error('Failed to save dog data', 'dogs', { dogId: updatedDog.id }, error as Error);
            // Revert optimistic update
            setUpdatedDog(previousDog);
            // Show error to user
            toast.error('Failed to save changes. Please try again.');
            // Keep panel open so user can retry
          }
        }}
        enableAutoSave={false}
      />
      </Suspense>

      {isDeleteDialogOpen && (
        <Suspense fallback={<DeleteDialogSkeleton />}>
          <DeleteDogDialog
            open={isDeleteDialogOpen}
            onClose={() => setIsDeleteDialogOpen(false)}
            onDelete={() => {
              setIsDeleteDialogOpen(false);
              // Call the onDelete callback to handle database deletion and navigation
              onDelete?.();
            }}
            dog={updatedDog}
          />
        </Suspense>
      )}

      {/* Edit Photo Dialog with Personal Touch */}
      <Suspense fallback={<PhotoDialogSkeleton />}>
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
          onSave={(preview) => {
            if (!preview) {
              toast.error('No photo selected');
              return;
            }
            try {
              handlePhotoSave(preview);
              toast.success('Photo updated successfully');
              // Show celebration for photo update
              setShowCelebration(true);
              setRecentUpdate(`Photo updated for ${updatedDog.callName}`);
              setTimeout(() => {
                setShowCelebration(false);
                setTimeout(() => setRecentUpdate(null), CELEBRATION_FADE_DELAY_MS);
              }, CELEBRATION_DURATION_MS);
            } catch (error) {
              toast.error('Failed to update photo');
              logger.error('Photo save failed', 'dogs', { dogId: updatedDog.id }, error as Error);
            }
          }}
          title={`Update ${updatedDog.callName}'s Photo`}
          previewAlt={`${updatedDog?.callName}'s adorable photo`}
        />
      </Suspense>
    </div>
  );
};

export default DogDetailsMain;