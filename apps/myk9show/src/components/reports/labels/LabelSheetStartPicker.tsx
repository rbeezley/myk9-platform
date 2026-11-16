import { buildLabelSheetCells, skipForStartPosition } from '@/lib/labels/labelSheetGrid';
import type { LabelTemplate } from '@/lib/labels/labelTemplates';
import { cn } from '@/lib/utils';

/**
 * A picture of the label sheet. She taps the first unused label; the ones before it show as used.
 * This sets the existing "Labels to skip on first page" value without typing or counting.
 */
export function LabelSheetStartPicker({
  template,
  skip,
  onSkipChange,
}: {
  template: LabelTemplate;
  skip: number;
  onSkipChange: (skip: number) => void;
}) {
  const cells = buildLabelSheetCells(template, skip);
  return (
    <div>
      <p className="mb-1 text-sm">Tap the first unused label on your sheet.</p>
      <div
        role="group"
        aria-label="Label sheet"
        className="grid w-full max-w-xs gap-1 rounded-md border bg-muted/30 p-2"
        style={{ gridTemplateColumns: `repeat(${template.columns}, minmax(0, 1fr))` }}
      >
        {cells.map(cell => (
          <button
            key={cell.position}
            type="button"
            aria-label={`Start at label ${cell.position}`}
            aria-current={cell.position === skip + 1 ? 'true' : undefined}
            data-used={cell.used ? 'true' : 'false'}
            onClick={() => onSkipChange(skipForStartPosition(cell.position))}
            className={cn(
              'min-h-[44px] rounded border text-xs',
              cell.used ? 'bg-muted text-muted-foreground opacity-50' : 'bg-background',
              cell.position === skip + 1 && 'border-primary ring-2 ring-primary'
            )}
          >
            {cell.position}
          </button>
        ))}
      </div>
    </div>
  );
}
