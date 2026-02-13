import React from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, FileText, Settings, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabNavigationProps {
  isBasicValid: boolean;
  isRegistrationValid: boolean;
  isOptionalValid: boolean;
}

const TAB_TRIGGER_BASE = cn(
  "flex items-center justify-center gap-2 rounded-lg transition-all duration-300 ease-apple",
  "data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5",
  "data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:scale-[1.02]",
  "hover:bg-muted/20 hover:scale-[1.01] active:scale-[0.98]"
);

export const TabNavigation: React.FC<TabNavigationProps> = ({
  isBasicValid,
  isRegistrationValid,
  isOptionalValid,
}) => {
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
          !isRegistrationValid && "text-destructive/80 data-[state=active]:text-destructive"
        )}
      >
        <FileText className="h-4 w-4" />
        <span className="font-medium">Registration</span>
        {isRegistrationValid && <CheckCircle className="h-4 w-4 text-emerald-500 animate-in zoom-in-0 duration-200" />}
      </TabsTrigger>
      <TabsTrigger
        value="optional"
        className={cn(
          TAB_TRIGGER_BASE,
          !isOptionalValid && "text-destructive/80 data-[state=active]:text-destructive"
        )}
      >
        <Settings className="h-4 w-4" />
        <span className="font-medium">Additional</span>
        {isOptionalValid && <CheckCircle className="h-4 w-4 text-emerald-500 animate-in zoom-in-0 duration-200" />}
      </TabsTrigger>
    </TabsList>
  );
};
