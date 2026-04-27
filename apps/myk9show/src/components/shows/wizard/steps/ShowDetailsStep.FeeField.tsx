import React from 'react';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  FeeField — small presentational helper                             */
/*                                                                     */
/*  Used by ShowDetailsStep for Pre-Entry Fee and Day-of-Show Fee.     */
/*  Extracted from the parent step so the file stays under the         */
/*  500-line cap from CLAUDE.md.                                       */
/* ------------------------------------------------------------------ */

export interface FeeFieldProps {
  /** id on the CurrencyInput so the sibling Label htmlFor connects for a11y. */
  id?: string | undefined;
  label: string;
  tooltip: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

export const FeeField: React.FC<FeeFieldProps> = ({ id, label, tooltip, value, onChange }) => (
  <div className="space-y-2">
    <Label {...(id !== undefined && { htmlFor: id })} className="flex items-center gap-1.5">
      {label}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </Label>
    <CurrencyInput
      {...(id !== undefined && { id })}
      value={value}
      onChange={onChange}
      placeholder="0.00"
      className="border border-border bg-secondary rounded-md"
    />
  </div>
);
