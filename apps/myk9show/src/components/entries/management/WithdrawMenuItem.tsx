import { useId } from 'react';
import { ENTRY_VERB_HELP } from './entryVerbHelp';

/** The status menu's "Withdraw…" item: the verb, plus its one line of help (MYK9-1687). */
export function WithdrawMenuItem({ onSelect }: { onSelect: () => void }) {
  const id = useId();
  return (
    <button
      type="button"
      role="menuitem"
      data-status-popover-action
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-help`}
      className="flex min-h-11 w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      onClick={onSelect}
    >
      <span className="flex min-w-0 flex-col">
        <span id={`${id}-label`}>Withdraw…</span>
        <span id={`${id}-help`} className="text-xs text-muted-foreground">
          {ENTRY_VERB_HELP.withdraw}
        </span>
      </span>
    </button>
  );
}
