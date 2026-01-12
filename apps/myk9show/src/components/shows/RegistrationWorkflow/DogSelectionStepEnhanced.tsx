import React, { useState, useMemo } from 'react';
import { Check, Users, ChevronDown, Plus, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
// import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDogStore } from '@/store/dogStore';
import { Dog, User } from '@/types/dog-types';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { useRegistrationContext } from '@/hooks/useRegistrationContext';
import { DogSearchInterface } from './DogSearchInterface';
import { CreateExhibitorDialog } from './CreateExhibitorDialog';
import { CreateDogDialog } from './CreateDogDialog';
import { QuickCreateFlow } from './QuickCreateFlow';
import { FixedSizeList as List } from 'react-window';
import { logger } from '@/services/LoggingService';

interface DogSelectionStepProps {
  selectedDogs: string[];
  onSelectionChange: (dogIds: string[]) => void;
}

// interface SearchFilters {
//   searchQuery: string;
//   breedFilter: string;
//   genderFilter: string;
//   registrationFilter: string;
//   ageFilter: string;
// }

interface DogListItemProps {
  index: number;
  style: React.CSSProperties;
  data: {
    dogs: Dog[];
    selectedDogs: string[];
    onToggle: (dogId: string) => void;
    getDogEligibilityStatus: (dog: Dog) => { eligible: boolean; issues: string[] };
    canBulkSelect: boolean;
  };
}


// Virtual list item component
const DogListItem: React.FC<DogListItemProps> = ({ index, style, data }) => {
  const { dogs, selectedDogs, onToggle, getDogEligibilityStatus } = data;
  const dog = dogs[index];
  const { eligible, issues } = getDogEligibilityStatus(dog);
  const isSelected = selectedDogs.includes(dog.id);
  
  return (
    <div style={style}>
      <Card
        className={`cursor-pointer transition-colors mx-2 mb-2 ${
          isSelected ? 'border-primary bg-primary/5' : ''
        } ${!eligible ? 'opacity-60' : ''}`}
        onClick={() => eligible && onToggle(dog.id)}
      >
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              checked={isSelected}
              disabled={!eligible}
              onCheckedChange={() => eligible && onToggle(dog.id)}
              onClick={(e) => e.stopPropagation()}
              className="mt-1"
            />
            
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium cursor-pointer">
                    {dog.callName || dog.name}
                    {dog.registrations?.[0]?.registeredName && ` "${dog.registrations[0].registeredName}"`}
                  </Label>
                  <p className="text-sm text-gray-600 mt-1">
                    {dog.registrations?.[0]?.breed || 'No breed specified'} • {dog.gender || 'Unknown'} • Born {formatDateMMDDYYYY(dog.dateOfBirth)}
                  </p>
                </div>
                
                {isSelected && (
                  <Badge variant="default" className="ml-2">
                    <Check className="w-3 h-3 mr-1" />
                    Selected
                  </Badge>
                )}
              </div>
              
              {dog.registrations && dog.registrations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {dog.registrations.map((reg, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {reg.organization}: {reg.registrationNumber}
                    </Badge>
                  ))}
                </div>
              )}
              
              {!eligible && (
                <div className="mt-2">
                  {issues.map((issue, idx) => (
                    <p key={idx} className="text-xs text-red-600">
                      • {issue}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const DogSelectionStepEnhanced: React.FC<DogSelectionStepProps> = ({
  selectedDogs,
  onSelectionChange
}) => {
  const { dogs } = useDogStore();
  const { filterAccessibleDogs, canBulkOperations, getMaxDogsPerRegistration } = useRegistrationPermissions();
  const { workflowConfig } = useRegistrationContext();
  
  // State for filtered dogs from the search interface
  const [filteredDogs, setFilteredDogs] = useState<Dog[]>([]);
  
  // Creation dialog states
  const [showQuickCreateFlow, setShowQuickCreateFlow] = useState(false);
  const [showExhibitorDialog, setShowExhibitorDialog] = useState(false);
  const [showDogDialog, setShowDogDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Get role-based accessible dogs for the search interface
  const accessibleDogs = useMemo(() => {
    return filterAccessibleDogs(dogs).filter(dog => !dog.deletedAt);
  }, [dogs, filterAccessibleDogs]);

  // Check creation permissions
  const { canCreateExhibitor } = useRegistrationPermissions();
  const canCreateNew = workflowConfig?.features?.createNew && canCreateExhibitor;

  // Creation flow handlers
  const handleQuickCreateFlowCompleted = (exhibitor: User, newDogs: Dog[]) => {
    // In real app, these would be saved to the backend/store
    logger.debug('Quick create flow completed:', 'shows', { data: { exhibitor, dogs: newDogs } });
    
    // Auto-select the newly created dogs
    const newDogIds = newDogs.map(dog => dog.id);
    onSelectionChange([...selectedDogs, ...newDogIds]);
  };

  const handleExhibitorCreated = (exhibitor: User) => {
    logger.debug('Exhibitor created:', 'shows', { data: exhibitor });
    // Could open dog creation dialog next
    setShowDogDialog(true);
  };

  const handleDogCreated = (dog: Dog) => {
    logger.debug('Dog created:', 'shows', { data: dog });
    // Auto-select the newly created dog
    onSelectionChange([...selectedDogs, dog.id]);
  };

  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleDogToggle = (dogId: string) => {
    const maxDogs = getMaxDogsPerRegistration();
    
    if (selectedDogs.includes(dogId)) {
      onSelectionChange(selectedDogs.filter(id => id !== dogId));
    } else {
      // Check if we're at the limit
      if (selectedDogs.length >= maxDogs) {
        // Could show a toast notification here
        return;
      }
      onSelectionChange([...selectedDogs, dogId]);
    }
  };
  
  const handleBulkSelect = (action: 'all' | 'none' | 'eligible') => {
    if (!canBulkOperations) return;
    
    switch (action) {
      case 'all': {
        const maxDogs = getMaxDogsPerRegistration();
        const eligibleIds = filteredDogs
          .filter(dog => getDogEligibilityStatus(dog).eligible)
          .slice(0, maxDogs)
          .map(dog => dog.id);
        onSelectionChange(eligibleIds);
        break;
      }
      case 'none':
        onSelectionChange([]);
        break;
      case 'eligible': {
        const eligibleOnly = filteredDogs
          .filter(dog => getDogEligibilityStatus(dog).eligible)
          .slice(0, getMaxDogsPerRegistration())
          .map(dog => dog.id);
        onSelectionChange(eligibleOnly);
        break;
      }
    }
  };

  const getDogEligibilityStatus = (dog: Dog) => {
    // Mock eligibility checks
    const issues = [];
    
    // Check age (example: must be at least 6 months old)
    if (dog.dateOfBirth) {
      const birthDate = new Date(dog.dateOfBirth);
      const ageInMonths = (new Date().getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (ageInMonths < 6) {
        issues.push('Too young (must be 6+ months)');
      }
    }
    
    // Check registrations
    if (!dog.registrations || dog.registrations.length === 0) {
      issues.push('No registration on file');
    }
    
    return {
      eligible: issues.length === 0,
      issues
    };
  };

  // Handle no dogs case
  if (accessibleDogs.length === 0) {
    return (
      <div className="space-y-4">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Select Dogs to Register</h3>
          <p className="text-sm text-gray-600 mt-1">
            You don't have any dogs available for registration.
          </p>
        </div>
        
        <div className="text-center py-8 space-y-4">
          <p className="text-gray-500">No dogs found.</p>
          <p className="text-sm text-gray-400">
            Make sure you have dogs added and they have up-to-date information.
          </p>
          
          {canCreateNew && (
            <div className="space-y-3">
              <Alert>
                <UserPlus className="h-4 w-4" />
                <AlertDescription>
                  As a secretary, you can create new exhibitors and dogs for registration.
                </AlertDescription>
              </Alert>
              
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => setShowQuickCreateFlow(true)}
                  className="flex items-center gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  Create Exhibitor & Dog(s)
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => setShowExhibitorDialog(true)}
                  className="flex items-center gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  Create Exhibitor Only
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Select Dogs to Register</h3>
        <p className="text-sm text-gray-600 mt-1">
          {workflowConfig.features.advancedSearch 
            ? 'Search and filter to find dogs, then select which ones to register.'
            : 'Choose which dogs you want to enter in this show.'}
          {` (Max: ${getMaxDogsPerRegistration()} dogs)`}
        </p>
      </div>
      
      {/* Advanced Search Interface */}
      {workflowConfig.features.advancedSearch && (
        <DogSearchInterface
          dogs={accessibleDogs}
          onDogsFiltered={setFilteredDogs}
          onSearchQueryChange={handleSearchQueryChange}
          showQuickFilters={true}
          showAdvancedFilters={true}
          className="mb-4"
        />
      )}
      
      {/* Actions Bar - Bulk Actions and Creation Options */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Bulk Actions - Only for secretaries */}
        {canBulkOperations && filteredDogs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Users className="h-4 w-4 mr-2" />
                Bulk Select
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleBulkSelect('eligible')}>
                Select All Eligible
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleBulkSelect('all')}>
                Select All Visible
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleBulkSelect('none')}>
                Clear Selection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Creation Options - Only for users with create permissions */}
        {canCreateNew && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setShowQuickCreateFlow(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Exhibitor & Dog(s)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowExhibitorDialog(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Exhibitor Only
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowDogDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Dog Only
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
      
      {/* Results Count */}
      {(!workflowConfig.features.advancedSearch || filteredDogs.length > 0) && (
        <div className="text-sm text-gray-600">
          Showing {workflowConfig.features.advancedSearch ? filteredDogs.length : accessibleDogs.length} dog{(workflowConfig.features.advancedSearch ? filteredDogs.length : accessibleDogs.length) !== 1 ? 's' : ''}
          {selectedDogs.length > 0 && (
            <span className="ml-2 font-medium text-primary">
              • {selectedDogs.length} selected
            </span>
          )}
        </div>
      )}

      {/* Virtual Scrolling List */}
      {(workflowConfig.features.advancedSearch ? filteredDogs.length > 0 : accessibleDogs.length > 0) ? (
        <div className="border rounded-lg">
          <List
            height={400}
            width="100%"
            itemCount={workflowConfig.features.advancedSearch ? filteredDogs.length : accessibleDogs.length}
            itemSize={120}
            itemData={{
              dogs: workflowConfig.features.advancedSearch ? filteredDogs : accessibleDogs,
              selectedDogs,
              onToggle: handleDogToggle,
              getDogEligibilityStatus,
              canBulkSelect: canBulkOperations
            }}
          >
            {DogListItem}
          </List>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-500">No dogs found matching your criteria.</p>
          <p className="text-sm text-gray-400 mt-2">
            Try adjusting your search terms or filters.
          </p>
        </div>
      )}
      
      {selectedDogs.length > 0 && (
        <div className="mt-4 p-3 bg-primary/10 rounded-lg">
          <p className="text-sm font-medium">
            {selectedDogs.length} dog{selectedDogs.length > 1 ? 's' : ''} selected
            {selectedDogs.length >= getMaxDogsPerRegistration() && (
              <span className="ml-2 text-yellow-600">
                (Maximum reached)
              </span>
            )}
          </p>
        </div>
      )}

      {/* Creation Dialogs */}
      <QuickCreateFlow
        open={showQuickCreateFlow}
        onOpenChange={setShowQuickCreateFlow}
        onFlowCompleted={handleQuickCreateFlowCompleted}
        searchQuery={searchQuery}
        mode="batch"
      />

      <CreateExhibitorDialog
        open={showExhibitorDialog}
        onOpenChange={setShowExhibitorDialog}
        onExhibitorCreated={handleExhibitorCreated}
        searchQuery={searchQuery}
      />

      <CreateDogDialog
        open={showDogDialog}
        onOpenChange={setShowDogDialog}
        onDogCreated={handleDogCreated}
      />
    </div>
  );
};