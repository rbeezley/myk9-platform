import { ArrowLeft } from 'lucide-react';
import { Button } from '../Button';
import { cn } from '../../utils/cn';

export interface RingsideUpButtonProps {
  /** The parent screen's name ("Show", "Classes", "Entries"): shown beside the arrow. */
  label: string;
  onClick: () => void;
  className?: string;
}

/**
 * The one Up control on every ringside screen (MYK9-1500): top-left, arrow plus
 * the parent's name, always visible. Fixed parent routes only; the caller owns
 * the destination.
 */
export function RingsideUpButton({ label, onClick, className }: RingsideUpButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      data-ringside-up
      className={cn('min-h-11 min-w-11 shrink-0 gap-1 px-2 [&_svg]:size-5', className)}
      onClick={onClick}
    >
      <ArrowLeft aria-hidden />
      <span>{label}</span>
    </Button>
  );
}
