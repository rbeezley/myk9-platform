import React from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, HelpCircle } from 'lucide-react';
import type { ShowDraft } from '@/store/wizardStore';
import {
  getPremiumStyleOptions,
  resolvePremiumStyle,
  type PremiumStyle,
} from '@/types/premium-types';

const PREMIUM_STYLE_OPTIONS = getPremiumStyleOptions();
const PREMIUM_STYLE_LABEL_BY_VALUE: Record<PremiumStyle, string> = PREMIUM_STYLE_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.value] = opt.label;
    return acc;
  },
  {} as Record<PremiumStyle, string>
);

function getPremiumStyleLabel(style: PremiumStyle | undefined): string {
  return PREMIUM_STYLE_LABEL_BY_VALUE[resolvePremiumStyle(style)];
}

interface MoreOptionsSectionProps {
  show: ShowDraft;
  onUpdate: (patch: Partial<ShowDraft>) => void;
}

/* ------------------------------------------------------------------ */
/*  More options — premium-list style and starting armband number.     */
/*  Both ship with sensible defaults (monogram premium, armband 100),  */
/*  so they're collapsed by default: a first-time secretary can ignore */
/*  them entirely, an experienced one can open and tune them.          */
/* ------------------------------------------------------------------ */

export const MoreOptionsSection: React.FC<MoreOptionsSectionProps> = ({ show, onUpdate }) => (
  <div className="border-t border-border">
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="text-foreground">
        <span className="flex items-center gap-2 text-sm">
          More options
          <span className="font-normal text-muted-foreground">
            Premium list style, starting armband number
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="show-premium-style">Premium List Style</Label>
            <Select
              value={resolvePremiumStyle(show.style)}
              onValueChange={value => onUpdate({ style: value as PremiumStyle })}
            >
              <SelectTrigger id="show-premium-style" className="bg-input h-10">
                <SelectValue placeholder="Select style">
                  {getPremiumStyleLabel(show.style)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PREMIUM_STYLE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-starting-armband" className="flex items-center gap-1.5">
              Starting Armband Number
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p>
                      First dog registered will receive this armband number. Subsequent dogs get
                      sequential numbers.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              id="show-starting-armband"
              type="number"
              min={1}
              value={show.startingArmbandNumber ?? 100}
              onChange={e =>
                onUpdate({
                  startingArmbandNumber: parseInt(e.target.value, 10) || 100,
                })
              }
              className="border border-border bg-input rounded-md"
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
);
