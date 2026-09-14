import React from 'react';
import { ChevronRight, Info, CheckCircle2, ShoppingCart, Plus } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Dog } from '@/types/dog-types';
import { formatTrialTypeLabel } from '@/types/template.types';
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
      'relative inline-flex items-center gap-2 px-3 py-3 -mb-[0.5px] sm:px-5',
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
          className="h-5 px-1.5 text-xs bg-success text-success-foreground hover:bg-success/80"
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
      aria-expanded={isExpanded}
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
            {formatTrialTypeLabel(trialType)}
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
  onAddRegistration?: (() => void) | undefined;
}

export const ElementCard: React.FC<ElementCardProps> = ({
  element,
  levels,
  fee,
  isSingleClass,
  onToggle,
  onAddRegistration,
}) => {
  if (isSingleClass) {
    const cls = levels[0];
    if (!cls) return null;
    const singleDescription = cls.isClassClosed
      ? cls.classClosedReason
      : cls.isFull && !cls.isAlreadyEntered
        ? cls.fullReason
        : null;
    return (
      <div className="myk9-element-card myk9-element-card-single">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`single-${cls.classId}`}
              checked={cls.isSelected || cls.isAlreadyEntered}
              disabled={
                cls.isAlreadyEntered ||
                cls.isRegistrationBlocked ||
                cls.isClassClosed ||
                (cls.isFull && cls.allowsWaitlist === false)
              }
              aria-label={
                cls.isAlreadyEntered ? `${element} (already entered)` : `Select ${element}`
              }
              {...(singleDescription ? { 'aria-describedby': `single-reason-${cls.classId}` } : {})}
              onCheckedChange={() =>
                !cls.isAlreadyEntered && !cls.isClassClosed && onToggle(cls.classId)
              }
            />
            <Label
              htmlFor={`single-${cls.classId}`}
              className={cn(
                'font-semibold text-sm cursor-pointer',
                cls.isAlreadyEntered && 'text-success'
              )}
            >
              <span className="sr-only">Select</span> {element}
            </Label>
            {cls.isAlreadyEntered && (
              <Badge variant="secondary" className="h-5 gap-1 text-xs text-success">
                <CheckCircle2 className="h-3 w-3" />
                Already entered
              </Badge>
            )}
            {cls.isSelected && !cls.isAlreadyEntered && (
              <Badge variant="outline" className="h-5 text-xs text-foreground">
                In cart
              </Badge>
            )}
            {singleDescription && (
              <span id={`single-reason-${cls.classId}`} className="text-sm text-muted-foreground">
                {singleDescription}
              </span>
            )}
            {cls.isAvailabilityUnknown && !cls.isClassClosed && !cls.isAlreadyEntered && (
              <AvailabilityUnknownBadge />
            )}
            {cls.isFull &&
              cls.allowsWaitlist !== false &&
              !cls.isClassClosed &&
              !cls.isAlreadyEntered && <WaitlistBadge waitlistCount={cls.waitlistCount} />}
            {cls.isFull &&
              cls.allowsWaitlist === false &&
              !cls.isClassClosed &&
              !cls.isAlreadyEntered && (
                <Badge variant="destructive" className="h-5 text-xs">
                  Full
                </Badge>
              )}
            {cls.registrationGuidance && !cls.isRegistrationBlocked && (
              <span className="text-sm text-muted-foreground">{cls.registrationGuidance}</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">${fee}</span>
        </div>
        {cls.isRegistrationBlocked && cls.registrationGuidance && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-warning/10 p-2">
            <span className="text-sm text-foreground">{cls.registrationGuidance}</span>
            {onAddRegistration && (
              <Button type="button" variant="outline" size="touch" onClick={onAddRegistration}>
                <Plus className="mr-2 h-4 w-4" />
                Add required registration
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  const blockedRegistration = levels.find(
    level => level.isRegistrationBlocked && level.registrationGuidance
  );

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
            isFull={cls.isFull}
            waitlistCount={cls.waitlistCount}
            allowsWaitlist={cls.allowsWaitlist}
            isAvailabilityUnknown={cls.isAvailabilityUnknown}
            isRegistrationBlocked={cls.isRegistrationBlocked}
            registrationGuidance={cls.isRegistrationBlocked ? null : cls.registrationGuidance}
            isClassClosed={cls.isClassClosed}
            classClosedReason={cls.classClosedReason}
            fullReason={cls.fullReason}
            onToggle={onToggle}
          />
        ))}
      </div>
      {blockedRegistration?.registrationGuidance && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-warning/10 p-2">
          <span className="text-sm text-foreground">
            {blockedRegistration.registrationGuidance}
          </span>
          {onAddRegistration && (
            <Button type="button" variant="outline" size="touch" onClick={onAddRegistration}>
              <Plus className="mr-2 h-4 w-4" />
              Add required registration
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Waitlist Badge ─────────────────────────────────────────────────────────────

interface WaitlistBadgeProps {
  waitlistCount?: number | undefined;
}

const WaitlistBadge: React.FC<WaitlistBadgeProps> = ({ waitlistCount }) => (
  <Badge variant="secondary" className="text-xs h-5 px-1.5">
    Full: join wait list
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
  isFull?: boolean | undefined;
  waitlistCount?: number | undefined;
  allowsWaitlist?: boolean | undefined;
  isAvailabilityUnknown?: boolean | undefined;
  isRegistrationBlocked?: boolean | undefined;
  registrationGuidance?: string | null | undefined;
  isClassClosed?: boolean | undefined;
  classClosedReason?: string | null | undefined;
  fullReason?: string | null | undefined;
  onToggle: (classId: string) => void;
}

const LevelChip: React.FC<LevelChipProps> = ({
  classId,
  displayLabel,
  isSelected,
  isAlreadyEntered,
  isFull,
  waitlistCount,
  allowsWaitlist = true,
  isAvailabilityUnknown = false,
  isRegistrationBlocked,
  registrationGuidance,
  isClassClosed = false,
  classClosedReason,
  fullReason,
  onToggle,
}) => {
  const isChecked = isSelected || isAlreadyEntered;
  const descriptionId = `chip-reason-${classId}`;
  // A started class outranks a full one: it takes nothing at all, so offering a
  // wait list or another day would be wrong, not merely redundant.
  const description = isClassClosed
    ? classClosedReason
    : isFull && !isAlreadyEntered
      ? fullReason
      : null;

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
          disabled={
            isAlreadyEntered ||
            isRegistrationBlocked ||
            isClassClosed ||
            (isFull && allowsWaitlist === false)
          }
          {...(description ? { 'aria-describedby': descriptionId } : {})}
          onCheckedChange={() => !isAlreadyEntered && !isClassClosed && onToggle(classId)}
          className="h-3.5 w-3.5"
        />
        {/* The wrapping <label> is the checkbox's single naming source. Do NOT add
            an aria-label here too — it stacks with the label text and doubles the
            accessible name (e.g. "Select Advanced Select Advanced"). */}
        <span className="sr-only">{isAlreadyEntered ? 'Already entered:' : 'Select'}</span>{' '}
        <span className="text-xs">{displayLabel}</span>
      </label>
      {description && (
        <span id={descriptionId} className="max-w-64 text-xs text-muted-foreground">
          {description}
        </span>
      )}
      {isAvailabilityUnknown && !isClassClosed && !isAlreadyEntered && <AvailabilityUnknownBadge />}
      {isFull && allowsWaitlist && !isClassClosed && !isAlreadyEntered && (
        <WaitlistBadge waitlistCount={waitlistCount} />
      )}
      {isFull && !allowsWaitlist && !isClassClosed && !isAlreadyEntered && (
        <Badge variant="destructive" className="h-5 text-xs">
          Full
        </Badge>
      )}
      {isAlreadyEntered && (
        <Badge variant="secondary" className="h-5 gap-1 text-xs text-success">
          <CheckCircle2 className="h-3 w-3" />
          Already entered
        </Badge>
      )}
      {isSelected && !isAlreadyEntered && (
        <Badge variant="outline" className="h-5 text-xs text-foreground">
          In cart
        </Badge>
      )}
      {registrationGuidance && (
        <span className="max-w-64 text-sm text-muted-foreground">{registrationGuidance}</span>
      )}
    </div>
  );
};

const AvailabilityUnknownBadge: React.FC = () => (
  <Badge variant="outline" className="h-5 text-xs text-muted-foreground">
    Availability unknown
  </Badge>
);

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
  isOrganizer?: boolean;
}

export const NoClassesAlert: React.FC<NoClassesAlertProps> = ({ trialCount, isOrganizer }) => (
  // INTENT: never strand an entrant at the class step. Like NoTrialsAlert, give a recovery path —
  // organizers learn where to add classes; entrants are told to contact the organizer rather than
  // hitting an unexplained dead end (UX-P1-01, "This respects my time").
  <Alert>
    <Info className="h-4 w-4" />
    <AlertDescription>
      No classes available yet. Found {trialCount} trial{trialCount !== 1 ? 's' : ''} but no classes
      assigned.{' '}
      {isOrganizer
        ? 'Add classes in the show management page before registering entries.'
        : 'Please contact the show organizer.'}
    </AlertDescription>
  </Alert>
);

/**
 * Shown when class availability could not be read at all — see
 * `isAvailabilityUnreadable` for why "not read" and "read as empty" are
 * indistinguishable without it. Deliberately does not block the step: the
 * selection is still worth building for any classes whose rows did resolve.
 */
export const AvailabilityUnreadableNotice: React.FC = () => (
  <Alert role="status" className="mb-3">
    <Info className="h-4 w-4" />
    <AlertDescription>
      We could not check which classes still have room. Classes marked “Availability unknown” have
      not been confirmed yet; classes with a resolved status remain available to choose.
    </AlertDescription>
  </Alert>
);
