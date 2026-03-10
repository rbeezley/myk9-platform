import React from 'react';
import {
  ChevronRight,
  Info,
  CheckCircle2,
  Users,
  Clock,
  AlertTriangle,
  ShoppingCart,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { Dog } from '@/types/dog-types';
import type { EligibilityResult } from '@/hooks/useEntryEligibility';
import type { ClassWithTrial } from './ClassSelectionStep.types';

// ─── Dog Tab Trigger ───────────────────────────────────────────────────────────

interface DogTabTriggerProps {
  dogId: string;
  dog: Dog | undefined;
  isActive: boolean;
  existingEntryCount: number;
  cartCount: number;
}

export const DogTabTrigger: React.FC<DogTabTriggerProps> = ({
  dogId,
  dog,
  isActive,
  existingEntryCount,
  cartCount,
}) => (
  <TabsTrigger
    key={dogId}
    value={dogId}
    className={cn(
      'relative inline-flex items-center gap-2 px-5 py-3 -mb-[0.5px]',
      'border-0 border-b-2 font-medium text-sm transition-all duration-200',
      'bg-transparent rounded-none cursor-pointer',
      isActive
        ? [
            'text-blue-600 border-blue-600 font-semibold',
            'data-[state=active]:text-blue-600 data-[state=active]:border-blue-600',
          ]
        : [
            'text-muted-foreground border-transparent hover:text-foreground',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-transparent',
          ]
    )}
    style={{
      borderBottomColor: isActive ? '#007AFF' : 'transparent',
      color: isActive ? '#007AFF' : undefined,
    }}
  >
    <span>{dog?.callName || dog?.name || 'Unknown'}</span>
    <div className="flex items-center gap-1">
      {existingEntryCount > 0 && (
        <Badge
          variant="default"
          className="h-5 px-1.5 text-xs bg-teal-600"
          title={`Already entered in ${existingEntryCount} class${existingEntryCount !== 1 ? 'es' : ''}`}
        >
          <CheckCircle2 className="h-3 w-3 mr-0.5" />
          {existingEntryCount}
        </Badge>
      )}
      {cartCount > 0 && (
        <Badge
          variant={isActive ? 'default' : 'secondary'}
          className="h-5 px-1.5 text-xs flex items-center gap-0.5"
          style={isActive ? { backgroundColor: '#007AFF' } : {}}
          title={`${cartCount} class${cartCount !== 1 ? 'es' : ''} in cart`}
        >
          <ShoppingCart className="h-3 w-3" />
          {cartCount}
        </Badge>
      )}
    </div>
  </TabsTrigger>
);

// ─── Trial Section Header ──────────────────────────────────────────────────────

interface TrialSectionHeaderProps {
  trialName: string;
  trialType?: string | undefined;
  classCount: number;
}

export const TrialSectionHeader: React.FC<TrialSectionHeaderProps> = ({
  trialName,
  trialType,
  classCount,
}) => (
  <div className="flex items-center justify-between pb-2 border-b">
    <div className="flex items-center space-x-2">
      <ChevronRight className="h-4 w-4 text-gray-400" />
      <h4 className="font-medium">{trialName || 'Unnamed Trial'}</h4>
      {trialType && <Badge variant="outline">{trialType}</Badge>}
    </div>
    <div className="text-xs text-muted-foreground">
      {classCount} class{classCount !== 1 ? 'es' : ''}
    </div>
  </div>
);

// ─── Empty States ──────────────────────────────────────────────────────────────

export const NoTrialsAlert: React.FC = () => (
  <Alert>
    <Info className="h-4 w-4" />
    <AlertDescription>
      No trials found for this show. Please contact the show organizer.
    </AlertDescription>
  </Alert>
);

interface NoClassesAlertProps {
  trialCount: number;
}

export const NoClassesAlert: React.FC<NoClassesAlertProps> = ({ trialCount }) => (
  <Alert>
    <Info className="h-4 w-4" />
    <AlertDescription>
      No classes available yet. Found {trialCount} trial{trialCount !== 1 ? 's' : ''} but no classes
      assigned.
    </AlertDescription>
  </Alert>
);

// ─── Class Card Row ────────────────────────────────────────────────────────────

interface ClassCardRowProps {
  dogId: string;
  classData: ClassWithTrial['classData'];
  isSelected: boolean;
  isAlreadyEntered: boolean;
  isFull: boolean;
  isLowSpots: boolean;
  isProcessing: boolean;
  isIneligible: boolean;
  hasWarnings: boolean;
  isLoadingAvailability: boolean;
  entryLimit: number;
  spotsAvailable: number;
  waitlistCount: number;
  fee: number;
  selectedJumpHeight: string | undefined;
  eligibilityResult: EligibilityResult | undefined;
  joiningWaitlistKey: string | null;
  onToggle: () => void;
  onJumpHeightChange: (value: string) => void;
  onJoinWaitlist: () => void;
}

export const ClassCardRow: React.FC<ClassCardRowProps> = ({
  dogId,
  classData,
  isSelected,
  isAlreadyEntered,
  isFull,
  isLowSpots,
  isProcessing,
  isIneligible,
  hasWarnings,
  isLoadingAvailability,
  entryLimit,
  spotsAvailable,
  waitlistCount,
  fee,
  selectedJumpHeight,
  eligibilityResult,
  joiningWaitlistKey,
  onToggle,
  onJumpHeightChange,
  onJoinWaitlist,
}) => {
  const isDisabled = !!(isAlreadyEntered || isFull || isProcessing || isIneligible);
  const itemKey = `${dogId}-${classData.id}`;

  return (
    <div key={`${dogId}-${classData.id}`} className="space-y-2">
      <div
        className={cn(
          'myk9-class-card myk9-class-card-compact',
          (isSelected || isAlreadyEntered) && 'selected',
          isAlreadyEntered && 'bg-teal-50 border-teal-300',
          isFull && !isAlreadyEntered && 'bg-gray-50 border-gray-200 opacity-75',
          isIneligible && !isAlreadyEntered && 'bg-orange-50 border-orange-200 opacity-75',
          isProcessing && 'opacity-50'
        )}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center space-x-3 flex-1">
            <Checkbox
              id={`${dogId}-${classData.id}`}
              checked={isSelected || isAlreadyEntered}
              disabled={isDisabled}
              onCheckedChange={() => !isDisabled && onToggle()}
            />
            <Label
              htmlFor={`${dogId}-${classData.id}`}
              className={cn('cursor-pointer flex-1', isDisabled && 'cursor-not-allowed')}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'myk9-class-card-title-compact',
                      isAlreadyEntered && 'text-teal-700',
                      isFull && !isAlreadyEntered && 'text-gray-500',
                      isIneligible && !isAlreadyEntered && !isFull && 'text-orange-600'
                    )}
                  >
                    {classData.name}
                  </span>
                  {isAlreadyEntered && (
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4 text-teal-600" />
                      <span className="text-xs text-teal-600 font-medium">Already Entered</span>
                    </div>
                  )}
                  <IneligibleBadge
                    isIneligible={isIneligible}
                    isAlreadyEntered={isAlreadyEntered}
                    eligibilityResult={eligibilityResult}
                  />
                  <WarningsBadge
                    hasWarnings={hasWarnings}
                    isIneligible={isIneligible}
                    isAlreadyEntered={isAlreadyEntered}
                    eligibilityResult={eligibilityResult}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <AvailabilityBadge
                    isLoadingAvailability={isLoadingAvailability}
                    entryLimit={entryLimit}
                    spotsAvailable={spotsAvailable}
                    isFull={isFull}
                    isLowSpots={isLowSpots}
                  />
                  <WaitlistBadge waitlistCount={waitlistCount} />
                  <div
                    className={cn(
                      'myk9-class-card-price-compact',
                      isAlreadyEntered && 'bg-teal-100 text-teal-700',
                      isFull && !isAlreadyEntered && 'bg-gray-100 text-gray-500'
                    )}
                  >
                    ${fee}
                  </div>
                </div>
              </div>
            </Label>
          </div>
        </div>
        {classData.description && (
          <div className="myk9-class-card-details-compact">{classData.description}</div>
        )}

        {/* Full class - offer waitlist option */}
        {isFull && !isAlreadyEntered && (
          <div className="mt-2 ml-9 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-muted-foreground">This class is full.</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={joiningWaitlistKey === itemKey}
              onClick={onJoinWaitlist}
            >
              {joiningWaitlistKey === itemKey ? 'Joining...' : 'Join Waitlist'}
            </Button>
          </div>
        )}

        {isSelected && classData.requiresJumpHeight && (
          <div className="mt-2 ml-9">
            <Label className="text-sm">Jump Height</Label>
            <Select value={selectedJumpHeight || ''} onValueChange={onJumpHeightChange}>
              <SelectTrigger className="w-32 h-8 mt-1">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="8">8&quot;</SelectItem>
                <SelectItem value="12">12&quot;</SelectItem>
                <SelectItem value="16">16&quot;</SelectItem>
                <SelectItem value="20">20&quot;</SelectItem>
                <SelectItem value="24">24&quot;</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Small Badge Sub-components ────────────────────────────────────────────────

const IneligibleBadge: React.FC<{
  isIneligible: boolean;
  isAlreadyEntered: boolean;
  eligibilityResult: EligibilityResult | undefined;
}> = ({ isIneligible, isAlreadyEntered, eligibilityResult }) => {
  if (!isIneligible || isAlreadyEntered) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="text-xs bg-orange-100 text-orange-700 border-orange-300"
          >
            <AlertTriangle className="h-3 w-3 mr-1" />
            Ineligible
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">Cannot enter this class:</p>
            <ul className="list-disc pl-4 text-xs">
              {eligibilityResult?.reasons.map((reason, idx) => (
                <li key={idx}>{reason.message}</li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const WarningsBadge: React.FC<{
  hasWarnings: boolean;
  isIneligible: boolean;
  isAlreadyEntered: boolean;
  eligibilityResult: EligibilityResult | undefined;
}> = ({ hasWarnings, isIneligible, isAlreadyEntered, eligibilityResult }) => {
  if (!hasWarnings || isIneligible || isAlreadyEntered) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
            <AlertTriangle className="h-3 w-3" />
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">Warnings:</p>
            <ul className="list-disc pl-4 text-xs">
              {eligibilityResult?.warnings.map((warning, idx) => (
                <li key={idx}>{warning.message}</li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const AvailabilityBadge: React.FC<{
  isLoadingAvailability: boolean;
  entryLimit: number;
  spotsAvailable: number;
  isFull: boolean;
  isLowSpots: boolean;
}> = ({ isLoadingAvailability, entryLimit, spotsAvailable, isFull, isLowSpots }) => {
  if (isLoadingAvailability || entryLimit <= 0) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={isFull ? 'destructive' : isLowSpots ? 'default' : 'outline'}
            className={cn(
              'text-xs',
              isFull && 'bg-red-100 text-red-700 hover:bg-red-100',
              isLowSpots && !isFull && 'bg-amber-100 text-amber-700 hover:bg-amber-100',
              !isFull && !isLowSpots && 'text-muted-foreground'
            )}
          >
            <Users className="h-3 w-3 mr-1" />
            {isFull ? 'Full' : `${spotsAvailable}/${entryLimit}`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {isFull
              ? `Class is full (${entryLimit} entries)`
              : isLowSpots
                ? `Only ${spotsAvailable} spot${spotsAvailable !== 1 ? 's' : ''} left!`
                : `${spotsAvailable} of ${entryLimit} spots available`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const WaitlistBadge: React.FC<{ waitlistCount: number }> = ({ waitlistCount }) => {
  if (waitlistCount <= 0) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            <Clock className="h-3 w-3 mr-1" />
            {waitlistCount} waiting
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {waitlistCount} {waitlistCount === 1 ? 'exhibitor' : 'exhibitors'} on waitlist
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// ─── Cart Summary ──────────────────────────────────────────────────────────────

interface DogCartSummaryProps {
  cartCount: number;
  totalFees: number;
}

export const DogCartSummary: React.FC<DogCartSummaryProps> = ({ cartCount, totalFees }) => {
  if (cartCount <= 0) return null;
  return (
    <div className="mt-4 p-3 bg-primary/10 rounded-lg flex justify-between items-center">
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-4 w-4" />
        <span className="text-sm font-medium">
          {cartCount} class{cartCount > 1 ? 'es' : ''} in cart
        </span>
      </div>
      <span className="text-sm font-semibold">Total: ${totalFees.toFixed(2)}</span>
    </div>
  );
};

interface OverallCartSummaryProps {
  totalItems: number;
  totalFees: number;
}

export const OverallCartSummary: React.FC<OverallCartSummaryProps> = ({
  totalItems,
  totalFees,
}) => {
  if (totalItems <= 0) return null;
  return (
    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">
            Cart Total ({totalItems} item{totalItems !== 1 ? 's' : ''}):
          </span>
        </div>
        <span className="text-lg font-semibold">${totalFees.toFixed(2)}</span>
      </div>
    </div>
  );
};
