/**
 * Preferences Button Component
 * Phase 6.4: User Preferences & UI State
 *
 * Button to navigate to the preferences page
 */

import React from 'react';
import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
  const navigate = useNavigate();

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
      onClick={() => navigate('/preferences')}
      className={className}
    >
      {buttonContent}
    </Button>
  );

  if (showLabel) {
    return button;
  }

  return (
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
  );
}