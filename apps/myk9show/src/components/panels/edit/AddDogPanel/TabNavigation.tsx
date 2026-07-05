import React from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, FileText, Settings, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabNavigationProps {
  /** The Essential tab holds the only required fields — a check means "done". */
  isBasicValid: boolean;
  /** Registration is optional; only a *started* (non-empty) registration set
   *  can be "complete" or "incomplete". Empty = untouched, no indicator. */
  hasRegistrations: boolean;
  isRegistrationValid: boolean;
}

const TAB_TRIGGER_BASE = cn(
  "flex items-center justify-center gap-2 rounded-lg transition-all duration-300 ease-apple",
  "data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5",
  "data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:scale-[1.02]",
  "hover:bg-muted/20 hover:scale-[1.01] active:scale-[0.98]"
);

export const TabNavigation: React.FC<TabNavigationProps> = ({
  isBasicValid,
  hasRegistrations,
  isRegistrationValid,
}) => {
  // A green check reads as "this section is done". Only show it where "done"
  // is meaningful: the required Essential tab, and a registration the user has
  // actually started and completed. The Optional tab never earns a check —
  // there is nothing there to complete (4.E: no false "complete" on untouched
  // tabs). Red only flags a *started-but-incomplete* registration.
  const showRegistrationCheck = hasRegistrations && isRegistrationValid;
  const showRegistrationError = hasRegistrations && !isRegistrationValid;
  return (
    <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 backdrop-blur-xl">
      <TabsTrigger
        value="basic"
        className={cn(
          TAB_TRIGGER_BASE,
          !isBasicValid && "text-destructive/80 data-[state=active]:text-destructive"
        )}
      >
        <Heart className="h-4 w-4" />
        <span className="font-medium">Essential</span>
        {isBasicValid && <CheckCircle className="h-4 w-4 text-emerald-500 animate-in zoom-in-0 duration-200" />}
      </TabsTrigger>
      <TabsTrigger
        value="registration"
        className={cn(
          TAB_TRIGGER_BASE,
          showRegistrationError && "text-destructive/80 data-[state=active]:text-destructive"
        )}
      >
        <FileText className="h-4 w-4" />
        <span className="font-medium">Registration</span>
        {showRegistrationCheck && <CheckCircle className="h-4 w-4 text-emerald-500 animate-in zoom-in-0 duration-200" />}
      </TabsTrigger>
      <TabsTrigger value="optional" className={TAB_TRIGGER_BASE}>
        <Settings className="h-4 w-4" />
        <span className="font-medium">Optional details</span>
      </TabsTrigger>
    </TabsList>
  );
};
