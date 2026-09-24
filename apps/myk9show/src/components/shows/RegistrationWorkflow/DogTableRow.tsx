/**
 * One row of the staff dog picker's virtualized table (`DogSelectionStepEnhanced`).
 *
 * MYK9-619: the Org / Reg # cells show the registration the SHOW will use,
 * resolved by the same `resolveRegistrationForShow` the exhibitor card uses,
 * and the row detail lists every registration through the shared
 * `RegistrationChipsForShow`. Before this the cells read `registrations[0]`,
 * so a UKC number could sit on an AKC show's row.
 */
import React, { useId } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  getDogBreedLabel,
  getDogDisplayName,
  getDogDistinctRegisteredName,
  type Dog,
} from '@/types/dog-types';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { cn } from '@/lib/utils';
import {
  USED_FOR_THIS_SHOW,
  registrationLabel,
  registrationOrganizationLabel,
  resolveRegistrationForShow,
} from './dogRegistrationForShow';
import { DOG_TABLE_GRID, getRegistrationShownInRow } from './DogSelectionStepEnhanced.helpers';
import { RegistrationChipsForShow } from './RegistrationChipsForShow';

export interface DogRowData {
  dogs: Dog[];
  selectedDogs: string[];
  onToggle: (dogId: string) => void;
  getDogEligibilityStatus: (dog: Dog) => { eligible: boolean; issues: string[] };
  /** The show's registry, resolved through `@/features/registries` by the caller. */
  showRegistryId: string | null | undefined;
}

interface DogRowProps {
  index: number;
  style: React.CSSProperties;
  data: DogRowData;
}

// Compact table row for virtual list
export const DogRow: React.FC<DogRowProps> = ({ index, style, data }) => {
  const { dogs, selectedDogs, onToggle, getDogEligibilityStatus, showRegistryId } = data;
  const dog = dogs[index];
  const descriptionId = useId();
  const { eligible, issues } = getDogEligibilityStatus(dog);
  const isSelected = selectedDogs.includes(dog.id);
  const breed = getDogBreedLabel(dog);
  const forShow = resolveRegistrationForShow(dog, showRegistryId);
  const reg = getRegistrationShownInRow(dog, showRegistryId);
  const ownerDisplay = dog.ownerName || dog.owner?.name || '—';
  const dogDisplayName = getDogDisplayName(dog);

  // The row is role="checkbox", whose children are presentational: nothing
  // inside it reaches a screen reader except through aria-describedby.
  const description = forShow.used
    ? `${registrationLabel(forShow.used)}, ${USED_FOR_THIS_SHOW}`
    : forShow.missingRegistrationMessage;

  const handleRowToggle = () => {
    if (eligible) onToggle(dog.id);
  };

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!eligible) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle(dog.id);
    }
  };

  const tooltipDetails: { label: string; value: string }[] = [];
  // Only when it says something the call name above it does not: a dog whose
  // registered name IS its call name gave a secretary "Registered Name: Maple"
  // under a row that already reads Maple (MYK9-485 review round 1).
  const registeredName = getDogDistinctRegisteredName(dog);
  if (registeredName) tooltipDetails.push({ label: 'Registered Name', value: registeredName });
  if (dog.gender) tooltipDetails.push({ label: 'Gender', value: dog.gender });
  if (dog.dateOfBirth)
    tooltipDetails.push({ label: 'Date of Birth', value: formatDateMMDDYYYY(dog.dateOfBirth) });
  if (dog.color) tooltipDetails.push({ label: 'Color', value: dog.color });
  if (dog.microchipNumber || dog.microchip)
    tooltipDetails.push({ label: 'Microchip', value: (dog.microchipNumber || dog.microchip)! });
  const hasRegistrationDetail = forShow.used !== null || forShow.others.length > 0;
  const hasTooltip =
    tooltipDetails.length > 0 || hasRegistrationDetail || (!eligible && issues.length > 0);

  const row = (
    <div
      style={{ ...style, ...DOG_TABLE_GRID }}
      className={`grid items-center gap-x-3 px-3 border-b border-border cursor-pointer hover:bg-muted/50 transition-colors ${
        isSelected ? 'bg-primary/5' : ''
      } ${!eligible ? 'opacity-50 cursor-not-allowed' : ''}`}
      role="checkbox"
      tabIndex={eligible ? 0 : -1}
      aria-label={`Select ${dogDisplayName}`}
      aria-checked={isSelected}
      aria-disabled={!eligible || undefined}
      aria-describedby={description ? descriptionId : undefined}
      onClick={handleRowToggle}
      onKeyDown={handleRowKeyDown}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary shadow',
          isSelected && 'bg-primary text-primary-foreground',
          !eligible && 'opacity-50'
        )}
      >
        {isSelected && <Check className="h-4 w-4" />}
      </span>
      <span className="min-w-0 truncate text-sm font-medium">{dogDisplayName}</span>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{breed}</span>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{ownerDisplay}</span>
      {forShow.missingRegistrationMessage ? (
        // Spans Org + Reg #: the dog holds no registration the show can use,
        // so neither cell has anything true to say. A warning, never a block —
        // the per-trial guard in ClassSelectionStep owns refusal (MYK9-619).
        <span className="col-span-2 flex min-w-0 items-center gap-1 text-xs leading-4 text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span id={descriptionId} className="line-clamp-2">
            {forShow.missingRegistrationMessage}
          </span>
        </span>
      ) : (
        <>
          <span>
            {reg ? (
              <Badge
                variant="outline"
                data-registration-role={forShow.used ? 'used' : undefined}
                title={forShow.used ? USED_FOR_THIS_SHOW : undefined}
                className={cn(
                  'text-xs',
                  forShow.used && 'border-primary bg-primary/10 font-semibold text-foreground'
                )}
              >
                {registrationOrganizationLabel(reg)}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </span>
          <span className="min-w-0 truncate text-sm text-muted-foreground flex items-center gap-1">
            {reg?.registrationNumber ? (
              reg.registrationNumber
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                <span className="text-destructive/70">—</span>
              </>
            )}
          </span>
          {description && (
            <span id={descriptionId} className="sr-only">
              {description}
            </span>
          )}
        </>
      )}
    </div>
  );

  if (hasTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{row}</TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs p-0">
            <div className="px-3 py-2 space-y-1">
              <p className="text-xs font-semibold text-popover-foreground">
                {getDogDisplayName(dog)}
              </p>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                {tooltipDetails.map(({ label, value }) => (
                  <React.Fragment key={label}>
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-xs text-popover-foreground">{value}</span>
                  </React.Fragment>
                ))}
              </div>
              {hasRegistrationDetail && (
                <RegistrationChipsForShow forShow={forShow} className="pt-1" />
              )}
            </div>
            {!eligible && issues.length > 0 && (
              <div className="border-t border-border px-3 py-1.5 bg-destructive/10">
                {issues.map((issue, idx) => (
                  <p key={idx} className="text-xs text-destructive">
                    {issue}
                  </p>
                ))}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return row;
};
