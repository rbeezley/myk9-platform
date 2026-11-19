import { Button } from '@/components/ui/button';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';
import { stripPlaceholderNarratives } from './premiumNarratives';
import { useGeneratePremium } from './useGeneratePremium';
import type { GeneratedPremium } from '../../types/premium-types';

interface RebuildNarrativesButtonProps {
  showId: string;
  disabled: boolean;
  onRebuilt: (narratives: GeneratedPremium['narratives']) => void;
}

/**
 * MYK9-2055: Show Hours and Trial Information are built from the show's trials, so a trial or
 * start time added after the text was published never reaches it. This puts the freshly built
 * text into the two boxes for the secretary to read; nothing is saved until they save.
 */
export function RebuildNarrativesButton({
  showId,
  disabled,
  onRebuilt,
}: RebuildNarrativesButtonProps) {
  const { rebuildNarratives, isRebuilding } = useGeneratePremium();
  async function rebuild() {
    try {
      onRebuilt(stripPlaceholderNarratives(await rebuildNarratives(showId)));
      notifications.success('Rebuilt from the show details. Review the text, then save.');
    } catch (err) {
      notifications.error('Could not rebuild from the show details', {
        description: getErrorMessage(err),
      });
    }
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled || isRebuilding}
      onClick={() => void rebuild()}
    >
      {isRebuilding ? 'Rebuilding...' : 'Rebuild from show details'}
    </Button>
  );
}
