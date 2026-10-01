import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { getDogDisplayName } from '@/types/dog-types';
import { juniorMeasuringDateText } from './juniorMeasuringDate';

/** The wizard's junior-handler declarations, owned by the page (MYK9-879). */
export interface JuniorHandlerDeclaration {
  /** Card checkout on a show with a junior tier that is not ASCA. */
  canDeclare: boolean;
  /** Dogs whose handler the exhibitor declared a junior. */
  dogIds: ReadonlySet<string>;
  onChange: (dogId: string, declared: boolean) => void;
}

interface JuniorHandlerDeclarationControlProps {
  /** The show's junior handler fee, in dollars. */
  fee: number;
  dogs: { id: string; callName?: string | undefined; name: string }[];
  declaration: JuniorHandlerDeclaration;
  /** The show's organization; picks the registry's measuring date for "under 18". */
  organization?: string | null | undefined;
}

/**
 * MYK9-879: the exhibitor says the person SHOWING a dog is under 18, and card
 * checkout charges the show's junior handler fee for that dog's entries.
 *
 * The question is about the HANDLER, not the registrant: a parent owns the dog and
 * registers it while their child handles it, so the box is offered for every dog
 * whoever in the household shows it. It is a declaration the exhibitor makes and
 * the club can check; nothing here reads a date of birth.
 */
export const JuniorHandlerDeclarationControl: React.FC<JuniorHandlerDeclarationControlProps> = ({
  fee,
  dogs,
  declaration,
  organization,
}) => {
  if (dogs.length === 0) return null;
  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">Junior handler fee (${fee.toFixed(2)})</legend>
      <p className="text-xs text-muted-foreground">
        Tick a dog if the person showing it is under 18 {juniorMeasuringDateText(organization)}.
        This is about the handler, not the owner, so it applies whoever in your household shows the
        dog. The club may check.
      </p>
      {dogs.map(dog => {
        const inputId = `junior-handler-${dog.id}`;
        const checked = declaration.dogIds.has(dog.id);
        return (
          // The WHOLE padded row is the label, so the hit area is the row (>= 44px
          // high, docs/INTENT.md), never the 16px painted checkbox.
          <label
            key={dog.id}
            htmlFor={inputId}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1"
          >
            <Checkbox
              id={inputId}
              checked={checked}
              onCheckedChange={value => declaration.onChange(dog.id, value === true)}
            />
            <span className="text-sm">
              Handler is under 18 (junior handler fee) for{' '}
              <span className="font-medium">{getDogDisplayName(dog)}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
};
