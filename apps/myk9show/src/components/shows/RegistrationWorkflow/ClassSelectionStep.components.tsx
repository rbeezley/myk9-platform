import React from 'react';
import { ChevronRight, Info, CheckCircle2, ShoppingCart } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { Dog } from '@/types/dog-types';
import type { LevelInfo } from './ClassSelectionStep.types';

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
            'text-primary border-primary font-semibold',
            'data-[state=active]:text-primary data-[state=active]:border-primary',
          ]
        : [
            'text-muted-foreground border-transparent hover:text-foreground',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-transparent',
          ]
    )}
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
          className={cn(
            'h-5 px-1.5 text-xs flex items-center gap-0.5',
            isActive && 'bg-primary text-primary-foreground'
          )}
          title={`${cartCount} class${cartCount !== 1 ? 'es' : ''} in cart`}
        >
          <ShoppingCart className="h-3 w-3" />
          {cartCount}
        </Badge>
      )}
    </div>
  </TabsTrigger>
);

// ─── Trial Section (Collapsible) ────────────────────────────────────────────────

interface TrialSectionProps {
  trialName: string;
  trialType?: string | undefined;
  selectedCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const TrialSection: React.FC<TrialSectionProps> = ({
  trialName,
  trialType,
  selectedCount,
  isExpanded,
  onToggle,
  children,
}) => (
  <div className="mb-4">
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between w-full pb-2 border-b cursor-pointer hover:bg-muted/30 -mx-1 px-1 rounded-sm transition-colors"
    >
      <div className="flex items-center gap-2">
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-90'
          )}
        />
        <h4 className="font-medium text-sm">{trialName || 'Unnamed Trial'}</h4>
        {trialType && (
          <Badge variant="outline" className="text-xs">
            {trialType}
          </Badge>
        )}
      </div>
      <span
        className={cn(
          'text-xs font-medium',
          selectedCount > 0 ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        {selectedCount} selected
      </span>
    </button>
    {isExpanded && <div className="mt-3 space-y-2 pl-6">{children}</div>}
  </div>
);

// ─── Element Card ───────────────────────────────────────────────────────────────

interface ElementCardProps {
  element: string;
  levels: LevelInfo[];
  fee: number;
  isSingleClass: boolean;
  onToggle: (classId: string) => void;
}

export const ElementCard: React.FC<ElementCardProps> = ({
  element,
  levels,
  fee,
  isSingleClass,
  onToggle,
}) => {
  if (isSingleClass) {
    const cls = levels[0];
    if (!cls) return null;
    return (
      <div className="myk9-element-card myk9-element-card-single">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`single-${cls.classId}`}
              checked={cls.isSelected || cls.isAlreadyEntered}
              disabled={cls.isAlreadyEntered}
              onCheckedChange={() => !cls.isAlreadyEntered && onToggle(cls.classId)}
            />
            <Label
              htmlFor={`single-${cls.classId}`}
              className={cn(
                'font-semibold text-sm cursor-pointer',
                cls.isAlreadyEntered && 'text-teal-600'
              )}
            >
              {element}
            </Label>
            {cls.isAlreadyEntered && <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />}
            {cls.isJudgeDayFull && !cls.isAlreadyEntered && (
              <WaitlistBadge waitlistCount={cls.waitlistCount} />
            )}
          </div>
          <span className="text-xs text-muted-foreground">${fee}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="myk9-element-card">
      <div className="flex items-center justify-between mb-2.5">
        <span className="font-semibold text-sm text-card-foreground">{element}</span>
        <span className="text-xs text-muted-foreground">${fee}/class</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {levels.map(cls => (
          <LevelChip
            key={cls.classId}
            classId={cls.classId}
            displayLabel={cls.displayLabel}
            isSelected={cls.isSelected}
            isAlreadyEntered={cls.isAlreadyEntered}
            isJudgeDayFull={cls.isJudgeDayFull}
            waitlistCount={cls.waitlistCount}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
};

// ─── Waitlist Badge ─────────────────────────────────────────────────────────────

interface WaitlistBadgeProps {
  waitlistCount?: number | undefined;
}

const WaitlistBadge: React.FC<WaitlistBadgeProps> = ({ waitlistCount }) => (
  <Badge variant="secondary" className="text-xs h-5 px-1.5">
    Full — Join Wait List
    {waitlistCount !== undefined && waitlistCount > 0 && (
      <span className="ml-1 text-muted-foreground">({waitlistCount} waiting)</span>
    )}
  </Badge>
);

// ─── Level Chip ─────────────────────────────────────────────────────────────────

interface LevelChipProps {
  classId: string;
  displayLabel: string;
  isSelected: boolean;
  isAlreadyEntered: boolean;
  isJudgeDayFull?: boolean | undefined;
  waitlistCount?: number | undefined;
  onToggle: (classId: string) => void;
}

const LevelChip: React.FC<LevelChipProps> = ({
  classId,
  displayLabel,
  isSelected,
  isAlreadyEntered,
  isJudgeDayFull,
  waitlistCount,
  onToggle,
}) => {
  const isChecked = isSelected || isAlreadyEntered;

  return (
    <div className="flex flex-col gap-1">
      <label
        className={cn(
          'myk9-level-chip',
          isAlreadyEntered && 'myk9-level-chip-entered',
          isSelected && !isAlreadyEntered && 'myk9-level-chip-selected'
        )}
      >
        <Checkbox
          id={`chip-${classId}`}
          checked={isChecked}
          disabled={isAlreadyEntered}
          onCheckedChange={() => !isAlreadyEntered && onToggle(classId)}
          className="h-3.5 w-3.5"
        />
        <span className="text-xs">{displayLabel}</span>
      </label>
      {isJudgeDayFull && !isAlreadyEntered && <WaitlistBadge waitlistCount={waitlistCount} />}
    </div>
  );
};

// ─── Empty States ──────────────────────────────────────────────────────────────

interface NoTrialsAlertProps {
  isOrganizer?: boolean;
}

export const NoTrialsAlert: React.FC<NoTrialsAlertProps> = ({ isOrganizer }) => (
  <Alert>
    <Info className="h-4 w-4" />
    <AlertDescription>
      {isOrganizer
        ? 'This show has no trials yet. Add trials in the show management page before registering entries.'
        : 'No trials found for this show. Please contact the show organizer.'}
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
