import React from 'react';
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

/** The Select/Done toggle for `useSelectMode`, with the announcement the list swap needs. */
export const SelectModeButton: React.FC<SelectModeButtonProps> = ({
  selectMode,
  onEnter,
  onExit,
  buttonRef,
  noun,
  purpose,
}) => (
  <>
    <Button ref={buttonRef} variant="outline" onClick={selectMode ? onExit : onEnter}>
      {selectMode ? 'Done' : `Select ${noun}`}
    </Button>
    {/* The button's label changes, but the list swapping for a table is otherwise silent. */}
    <p role="status" className="sr-only">
      {selectMode ? `Selecting ${noun}. Tick rows to ${purpose}.` : ''}
    </p>
  </>
);
