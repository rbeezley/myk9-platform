import React from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, FileText, Settings, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabNavigationProps {
  /** The Essential tab holds the only required fields — a check means "done". */
  isBasicValid: boolean;
  /** Only a *started* (non-empty) registration set can be "complete" or
   *  "incomplete". Empty = untouched, no indicator. */
  hasRegistrations: boolean;
  isRegistrationValid: boolean;
  /**
   * Inline (MYK9-1081): below `sm` the three labels must fit a 375px slide-out,
   * so the decorative icons drop and the text steps down and may wrap. Measured
   * in Montserrat at 375px: the default strip overflows "Registration" by 3px
   * and "Optional details" by 15px into its neighbours; this fits with 5px spare.
   * MYK9-1121: the green check is then a corner badge below `sm`. In the row it
   * was a flex item that shrank to 2px at 375px and 0px at 320px, so the "done"
   * mark vanished exactly where the label already left no room for it. The label stays at `text-xs` (14px, the app's floor, INTENT.md); the
   * strip's columns flex instead so "Registration" fits a 320px strip.
   */
  compact?: boolean | undefined;
}

const TAB_TRIGGER_BASE = cn(
  'flex items-center justify-center gap-2 rounded-lg transition-all duration-300 ease-apple',
  'hover:bg-muted/20 hover:scale-[1.01] active:scale-[0.98]'
);

const COMPACT_TRIGGER = cn(
  'relative gap-1 px-0 text-xs leading-tight whitespace-normal text-center',
  'min-[360px]:px-1',
  'sm:gap-2 sm:px-4 sm:text-sm'
);
// "Registration" is one unbreakable word, so its tab takes its width and the two
// that can wrap share the rest; equal thirds left it 4px short at 320px.
const COMPACT_STRIP = 'grid-cols-[auto_1fr_1fr] sm:grid-cols-3';
const COMPACT_ICON = 'hidden shrink-0 sm:block';
const COMPACT_CHECK = 'absolute right-0.5 top-0 h-3 w-3 sm:static sm:h-4 sm:w-4';

export const TabNavigation: React.FC<TabNavigationProps> = ({
  isBasicValid,
  hasRegistrations,
  isRegistrationValid,
  compact = false,
}) => {
  // A green check reads as "this section is done". Only show it where "done"
  // is meaningful: the required Essential tab, and a registration the user has
  // actually started and completed. The Optional tab never earns a check —
  // there is nothing there to complete (4.E: no false "complete" on untouched
  // tabs). Red only flags a *started-but-incomplete* registration.
  const showRegistrationCheck = hasRegistrations && isRegistrationValid;
  const showRegistrationError = hasRegistrations && !isRegistrationValid;
  const trigger = cn(TAB_TRIGGER_BASE, compact && COMPACT_TRIGGER);
  const icon = cn('h-4 w-4', compact && COMPACT_ICON);
  const check = cn(
    'text-emerald-500 animate-in zoom-in-0 duration-200',
    compact ? COMPACT_CHECK : 'h-4 w-4'
  );
  return (
    <TabsList
      className={cn(
        'grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 backdrop-blur-xl',
        compact && COMPACT_STRIP
      )}
    >
      <TabsTrigger
        value="registration"
        className={cn(trigger, showRegistrationError && 'text-destructive/80')}
      >
        <FileText className={icon} />
        <span className="font-medium">Registration</span>
        {showRegistrationCheck && <CheckCircle className={check} />}
      </TabsTrigger>
      <TabsTrigger value="basic" className={cn(trigger, !isBasicValid && 'text-destructive/80')}>
        <Heart className={icon} />
        <span className="font-medium">Essential</span>
        {isBasicValid && <CheckCircle className={check} />}
      </TabsTrigger>
      <TabsTrigger value="optional" className={trigger}>
        <Settings className={icon} />
        <span className="font-medium">Optional details</span>
      </TabsTrigger>
    </TabsList>
  );
};
