/**
 * Preferences Button Component
 * Phase 6.4: User Preferences & UI State
 * 
 * Button to open the preferences dialog, can be placed in app header or settings menu
 */

import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PreferencesDialog } from '@/components/preferences';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PreferencesButtonProps {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'link' | 'premium';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
  className?: string;
}

export function PreferencesButton({ 
  variant = 'ghost', 
  size = 'icon',
  showLabel = false,
  className 
}: PreferencesButtonProps) {
  const [open, setOpen] = useState(false);

  const buttonContent = (
    <>
      <Settings className="h-4 w-4" />
      {showLabel && <span className="ml-2">Preferences</span>}
    </>
  );

  const button = (
    <Button
      variant={variant}
      size={size}
      onClick={() => setOpen(true)}
      className={className}
    >
      {buttonContent}
    </Button>
  );

  return (
    <>
      {showLabel ? (
        button
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {button}
            </TooltipTrigger>
            <TooltipContent>
              <p>Open Preferences</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
      <PreferencesDialog open={open} onOpenChange={setOpen} />
    </>
  );
}