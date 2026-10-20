import React from 'react';
import { CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SelectModeButtonProps {
  selectMode: boolean;
  onEnter: () => void;
  onExit: () => void;
  buttonRef: React.Ref<HTMLButtonElement>;
  /** Plural noun for the label, e.g. "people". */
  noun: string;
  /** What ticking rows is for, e.g. "copy emails or export". */
  purpose: string;
}

/**
 * The Select/Done toggle for `useSelectMode`, with the announcement the list swap needs. It sits in
 * the list toolbar beside search (it is a list tool), so the visible label is the single word
 * "Select"; the accessible name keeps the noun ("Select dogs") for a screen reader and for tests.
 */
export const SelectModeButton: React.FC<SelectModeButtonProps> = ({
  selectMode,
  onEnter,
  onExit,
  buttonRef,
  noun,
  purpose,
}) => (
  <>
    <Button
      ref={buttonRef}
      variant="outline"
      className="shrink-0"
      aria-label={selectMode ? undefined : `Select ${noun}`}
      onClick={selectMode ? onExit : onEnter}
    >
      {!selectMode && <CheckSquare className="mr-2 h-4 w-4" aria-hidden="true" />}
      {selectMode ? 'Done' : 'Select'}
    </Button>
    {/* The button's label changes, but the list swapping for a table is otherwise silent. */}
    <p role="status" className="sr-only">
      {selectMode ? `Selecting ${noun}. Tick rows to ${purpose}.` : ''}
    </p>
  </>
);
