import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditMode } from './show-creation-wizard-types';
import { getEditModeTitle } from './wizardLabels';

interface WizardHeaderProps {
  editMode: EditMode | undefined;
  onClose: () => void;
}

/** Sticky header with a back button and Secretary / Create Show breadcrumb. */
export const WizardHeader: React.FC<WizardHeaderProps> = ({ editMode, onClose }) => (
  <div className="border-b bg-card/95 backdrop-blur-xl sticky top-0 z-40">
    <div className="container mx-auto px-6 py-4 max-w-7xl">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="gap-2 hover:-translate-y-0.5 transition-all duration-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Secretary</span>
          <span>/</span>
          <span>Create Show</span>
          <span>/</span>
          <span className="text-foreground font-medium">
            {getEditModeTitle(editMode) ?? 'Wizard'}
          </span>
        </div>
      </div>
    </div>
  </div>
);
