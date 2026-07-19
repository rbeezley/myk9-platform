import type React from 'react';
import { startTransition } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { CommandMenuCommand } from './commandMenuTypes';

/** `CommandPalette.tsx`'s local command shape. Kept here (rather than in the
 * component) so the adapter and the palette component can each stay under
 * the 500-line budget; `CommandPalette.tsx` re-uses this type directly. */
export type CommandAction = {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
  category: 'navigation' | 'data' | 'actions';
  shortcut?: string;
};

/** Adapts a `CommandMenuCommand` (features/command-menu) into the palette's
 * local `CommandAction` shape, per commandMenuTypes.ts's documented
 * compatibility contract. `href` commands navigate; `run` commands (the
 * check-in mutation) dispatch and close the palette per the action contract
 * in design.md Decision 6. */
export function adaptCommandMenuCommand(
  command: CommandMenuCommand,
  navigate: NavigateFunction,
  onOpenChange: (open: boolean) => void,
  icon: React.ReactNode,
  category: CommandAction['category']
): CommandAction {
  return {
    id: command.id,
    title: command.label,
    ...(command.sublabel !== undefined ? { subtitle: command.sublabel } : {}),
    icon,
    action: () =>
      startTransition(() => {
        if (command.href) {
          navigate(command.href);
        } else if (command.run) {
          void command.run();
        }
        onOpenChange(false);
      }),
    keywords: [command.label, command.sublabel ?? ''].filter(Boolean),
    category,
  };
}
