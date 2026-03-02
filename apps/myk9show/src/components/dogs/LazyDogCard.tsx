import { useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton/skeleton';
import { logger } from '@/services/LoggingService';
import {
  Dog,
  Calendar,
  User,
  Heart,
  Award,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { useDogStore } from '../../store/dogStore';
import { useUserStore } from '../../store/userStore';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator';
import type { SyncStatus } from '@/components/sync/SyncStatusIndicator';
import { getDogDisplayName } from '@/types/dog-types';

interface LazyDogCardProps {
  dogId: string;
  selected?: boolean;
  onSelect?: (dogId: string) => void;
  onDeselect?: (dogId: string) => void;
  showDetails?: boolean;
  className?: string;
  /** Only load basic info initially, detailed info on demand */
  lazyMode?: boolean;
  syncStatus?: SyncStatus;
  lastSyncAt?: Date;
  syncErrorMessage?: string;
  showSyncStatus?: boolean;
  onSyncRetry?: () => void;
}

interface HealthRecord {
  id: string;
  type: string;
  date: string;
  description: string;
}

interface Competition {
  id: string;
  name: string;
  date: string;
  placement: string;
}

interface RegistrationRecord {
  id: string;
  organization: string;
  number: string;
  status: string;
}

interface Achievement {
  id: string;
  title: string;
  date: string;
}

interface DogDetailsData {
  healthRecords?: HealthRecord[];
  competitions?: Competition[];
  registrations?: RegistrationRecord[];
  achievements?: Achievement[];
}

export function LazyDogCard({
  dogId,
  selected = false,
  onSelect,
  onDeselect,
  showDetails = false,
  className,
  lazyMode = true,
  syncStatus = 'synced',
  lastSyncAt,
  syncErrorMessage,
  showSyncStatus = true,
  onSyncRetry,
}: LazyDogCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsData, setDetailsData] = useState<DogDetailsData | null>(null);
  const [hasLoadedDetails, setHasLoadedDetails] = useState(false);

  const { dogs } = useDogStore();
  const { people } = useUserStore();

  // Find dog in already loaded data
  const dog = dogs.find(d => d.id === dogId);
  const owner = dog ? people.find(p => p.id === dog.ownerId) : null;

  // Intersection observer for lazy loading
  const cardRef = useIntersectionObserver(
    () => {
      if (lazyMode && !dog && !isLoadingDetails) {
        loadDogBasicInfo();
      }
    },
    {
      rootMargin: '50px',
      threshold: 0.1,
    }
  );

  // Load basic dog info when card comes into view
  const loadDogBasicInfo = async () => {
    if (!dogId || dog) return;

    setIsLoadingDetails(true);
    try {
      // Simulate API call to load basic dog info
      await new Promise(resolve => setTimeout(resolve, 500));

      // In real implementation, this would call an API
      // For now, we'll use the existing store data
      const loadedDog = dogs.find(d => d.id === dogId);
      if (!loadedDog) {
        logger.warn('Dog not found:', 'dogs', { data: dogId });
      }
    } catch (error) {
      logger.error('Failed to load dog info:', 'dogs', {}, error as Error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Load detailed dog information on demand
  const loadDetailedInfo = async () => {
    if (hasLoadedDetails || isLoadingDetails || !dog) return;

    setIsLoadingDetails(true);
    try {
      // Simulate loading detailed information
      await new Promise(resolve => setTimeout(resolve, 800));

      // Mock detailed data (in real app, this would come from API)
      const mockDetails: DogDetailsData = {
        healthRecords: [
          { id: '1', type: 'vaccination', date: '2024-01-15', description: 'Annual vaccinations' },
          { id: '2', type: 'checkup', date: '2024-06-01', description: 'Regular health checkup' },
        ],
        competitions: [
          { id: '1', name: 'Spring Agility Trial', date: '2024-03-15', placement: '2nd' },
          { id: '2', name: 'Summer Championship', date: '2024-07-20', placement: '1st' },
        ],
        registrations: [{ id: '1', organization: 'AKC', number: 'WS12345678', status: 'active' }],
        achievements: [
          { id: '1', title: 'Novice Agility', date: '2024-03-15' },
          { id: '2', title: 'Rally Excellent', date: '2024-06-10' },
        ],
      };

      setDetailsData(mockDetails);
      setHasLoadedDetails(true);
    } catch (error) {
      logger.error('Failed to load dog details:', 'dogs', {}, error as Error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Handle expand/collapse
  const handleToggleExpanded = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);

    if (newExpanded && !hasLoadedDetails) {
      loadDetailedInfo();
    }
  };

  // Handle selection
  const handleSelection = () => {
    if (selected) {
      onDeselect?.(dogId);
    } else {
      onSelect?.(dogId);
    }
  };

  // Loading skeleton
  if (lazyMode && (!dog || isLoadingDetails) && !hasLoadedDetails) {
    return (
      <Card ref={cardRef} className={cn('transition-all duration-200', className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-6 w-16" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!dog) {
    return (
      <Card className={cn('border-dashed border-muted-foreground/30', className)}>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-muted-foreground">
            <Dog className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Dog not found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString();
  };

  const calculateAge = (birthDate: Date | string) => {
    const birth = new Date(birthDate);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      return age - 1;
    }
    return age;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          'transition-all duration-200 cursor-pointer hover:shadow-md',
          selected && 'ring-2 ring-primary ring-offset-2',
          className
        )}
        onClick={handleSelection}
      >
        <CardHeader className="pb-3 relative">
          {/* Sync Status Indicator */}
          {showSyncStatus && (
            <div className="absolute top-3 left-3 z-10">
              <SyncStatusIndicator
                status={syncStatus}
                entityType="dog"
                entityId={dogId}
                compact
                lastSyncAt={lastSyncAt}
                errorMessage={syncErrorMessage}
                enableActions={syncStatus === 'error' || syncStatus === 'conflict'}
                onRetry={onSyncRetry}
                className="bg-white/90 backdrop-blur-sm rounded-full p-1"
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-full">
                <Dog className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{getDogDisplayName(dog)}</h3>
                <p className="text-sm text-muted-foreground">{dog.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selected && (
                <Badge variant="default" className="bg-primary">
                  Selected
                </Badge>
              )}

              {showDetails && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={e => {
                    e.stopPropagation();
                    handleToggleExpanded();
                  }}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Dog className="h-4 w-4 text-muted-foreground" />
                <span>{dog.registrations?.[0]?.breed || 'No breed specified'}</span>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{calculateAge(dog.dateOfBirth || '1990-01-01')} years old</span>
              </div>

              {owner && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {owner.firstName} {owner.lastName}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {dog.gender || 'Unknown'}
                </Badge>
              </div>
            </div>

            {/* Expanded details */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 border-t space-y-3">
                    {isLoadingDetails ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Loading details...</span>
                      </div>
                    ) : detailsData ? (
                      <div className="space-y-4">
                        {/* Health Records */}
                        {detailsData.healthRecords && detailsData.healthRecords.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Heart className="h-4 w-4 text-red-500" />
                              <span className="text-sm font-medium">Recent Health Records</span>
                            </div>
                            <div className="space-y-1">
                              {detailsData.healthRecords.slice(0, 2).map(record => (
                                <div key={record.id} className="text-xs text-muted-foreground">
                                  {record.description} - {formatDate(record.date)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Achievements */}
                        {detailsData.achievements && detailsData.achievements.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Award className="h-4 w-4 text-yellow-500" />
                              <span className="text-sm font-medium">Recent Achievements</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {detailsData.achievements.slice(0, 3).map(achievement => (
                                <Badge key={achievement.id} variant="secondary" className="text-xs">
                                  {achievement.title}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Registrations */}
                        {detailsData.registrations && detailsData.registrations.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-4 w-4 text-blue-500" />
                              <span className="text-sm font-medium">Registrations</span>
                            </div>
                            <div className="space-y-1">
                              {detailsData.registrations.map(reg => (
                                <div key={reg.id} className="text-xs text-muted-foreground">
                                  {reg.organization}: {reg.number}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No additional details available
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
