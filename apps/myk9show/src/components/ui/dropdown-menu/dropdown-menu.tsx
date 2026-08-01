import * as React from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Check, ChevronRight, Circle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { getNativeButtonProp } from '@/components/ui/base-ui-native-button';

type DropdownMenuProps = React.ComponentProps<typeof MenuPrimitive.Root>;

function DropdownMenu({ modal = false, ...props }: DropdownMenuProps) {
  return <MenuPrimitive.Root modal={modal} {...props} />;
}

interface DropdownMenuTriggerProps extends React.ComponentPropsWithoutRef<
  typeof MenuPrimitive.Trigger
> {
  asChild?: boolean;
  nativeButton?: boolean;
}

const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, DropdownMenuTriggerProps>(
  ({ asChild, children, nativeButton, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return (
        <MenuPrimitive.Trigger
          render={children}
          nativeButton={getNativeButtonProp(children, nativeButton)}
          {...props}
        />
      );
    }
    return (
      <MenuPrimitive.Trigger ref={ref} {...props}>
        {children}
      </MenuPrimitive.Trigger>
    );
  }
);
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

const DropdownMenuGroup = MenuPrimitive.Group;

const DropdownMenuPortal = MenuPrimitive.Portal;

const DropdownMenuSub = MenuPrimitive.SubmenuRoot;

const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.SubmenuTrigger>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.SubmenuTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <MenuPrimitive.SubmenuTrigger
    ref={ref}
    className={cn(
      'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[open]:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
      inset && 'pl-8',
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto" />
  </MenuPrimitive.SubmenuTrigger>
));
DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger';

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Popup>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Positioner collisionPadding={8} collisionAvoidance={{ side: 'flip', align: 'shift' }}>
    <MenuPrimitive.Popup
      ref={ref}
      className={cn(
        // MYK9-138: `overflow-hidden` with no max-height clipped a tall submenu
        // outright — worse than the parent menu, which at least overflowed
        // visibly. Bounded and scrollable, with the same fallback.
        'z-50 max-h-[var(--available-height,calc(100dvh_-_4rem))] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className
      )}
      {...props}
    />
  </MenuPrimitive.Positioner>
));
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent';

interface DropdownMenuContentProps extends React.ComponentPropsWithoutRef<
  typeof MenuPrimitive.Popup
> {
  sideOffset?: number;
  align?: 'start' | 'center' | 'end';
}

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Popup>,
  DropdownMenuContentProps
>(({ className, sideOffset = 4, align = 'center', ...props }, ref) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Positioner
      sideOffset={sideOffset}
      align={align}
      collisionPadding={8}
      // Base UI defaults to `side: 'shift'`, which squeezes the popup into
      // whatever space the preferred side has instead of moving it. For a row
      // menu near the bottom of a table that space can be ~9px, so
      // --available-height becomes 9px and the menu renders as an unusable
      // sliver — the max-height fallback never applies, because the variable IS
      // set. Flipping above the trigger uses the (ample) space on the other
      // side instead. MYK9-138.
      collisionAvoidance={{ side: 'flip', align: 'shift' }}
      className="z-[9999]"
    >
      <MenuPrimitive.Popup
        ref={ref}
        className={cn(
          // MYK9-138. The fallback is load-bearing: `max-h-[var(--available-height)]`
          // with the variable UNSET is an invalid declaration, so the menu had no
          // max-height at all, `overflow-y-auto` never engaged (the content fit its
          // own box), and a menu taller than the viewport simply ran off-screen with
          // no way to scroll. A club member's row menu has ~10 items across three
          // sections, so its lower actions — including "Grant Show Access" — were
          // unreachable for any row low on the page.
          'z-[9999] max-h-[var(--available-height,calc(100dvh_-_4rem))] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
          'data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className
        )}
        {...props}
      />
    </MenuPrimitive.Positioner>
  </MenuPrimitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

// Use Omit to remove properties we want to redefine for exactOptionalPropertyTypes
type DropdownMenuItemProps = Omit<
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item>,
  'onClick' | 'disabled'
> & {
  inset?: boolean;
  asChild?: boolean;
  onClick?: () => void;
  disabled?: boolean;
};

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Item>,
  DropdownMenuItemProps
>(({ className, inset, asChild, children, onClick, disabled, ...props }, ref) => {
  // Conditionally include onClick and disabled to avoid passing undefined
  const conditionalProps = {
    ...(onClick !== undefined ? { onClick } : {}),
    ...(disabled !== undefined ? { disabled } : {}),
  };

  if (asChild && React.isValidElement(children)) {
    return (
      <MenuPrimitive.Item
        ref={ref}
        render={children}
        className={cn(
          'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0',
          inset && 'pl-8',
          className
        )}
        {...conditionalProps}
        {...props}
      />
    );
  }
  return (
    <MenuPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0',
        inset && 'pl-8',
        className
      )}
      {...conditionalProps}
      {...props}
    >
      {children}
    </MenuPrimitive.Item>
  );
});
DropdownMenuItem.displayName = 'DropdownMenuItem';

// Use Omit to handle checked property for exactOptionalPropertyTypes
type DropdownMenuCheckboxItemProps = Omit<
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.CheckboxItem>,
  'checked'
> & {
  checked?: boolean;
};

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.CheckboxItem>,
  DropdownMenuCheckboxItemProps
>(({ className, children, checked, ...props }, ref) => {
  // Conditionally include checked to avoid passing undefined
  const checkedProps = checked !== undefined ? { checked } : {};

  return (
    <MenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...checkedProps}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <MenuPrimitive.CheckboxItemIndicator>
          <Check className="h-4 w-4" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
});
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <MenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <MenuPrimitive.RadioItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </MenuPrimitive.RadioItemIndicator>
    </span>
    {children}
  </MenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem';

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.GroupLabel>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.GroupLabel> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <MenuPrimitive.GroupLabel
    ref={ref}
    className={cn('px-2 py-1.5 text-sm font-semibold', inset && 'pl-8', className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span className={cn('ml-auto text-xs tracking-widest opacity-60', className)} {...props} />
  );
};
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
