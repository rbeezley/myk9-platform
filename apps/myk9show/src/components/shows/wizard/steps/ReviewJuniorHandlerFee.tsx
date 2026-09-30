import React from 'react';
import type { ShowDraft } from '@/store/wizardStore';
import { formatFee } from '@/utils/format';
import { wizardJuniorHandlerFee } from '@/pages/secretary/ShowCreationWizard/wizardJuniorHandlerFee';

/** Review-step fee row. Renders only when the draft would actually write a junior fee. */
export const ReviewJuniorHandlerFee: React.FC<{ show: ShowDraft }> = ({ show }) => {
  if (wizardJuniorHandlerFee(show) === undefined) return null;
  return (
    <div>
      <div className="text-sm text-muted-foreground">Junior Handler Fee</div>
      <div className="text-foreground font-medium">{formatFee(show.juniorHandlerFee)}</div>
    </div>
  );
};
