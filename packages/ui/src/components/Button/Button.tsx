import * as React from 'react';
import { useRender } from '@base-ui/react/use-render';
import { type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '../../utils/cn';
import { buttonVariants } from './buttonVariants';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /**
   * Override the rendered element with a custom one.
   * @example <Button render={<a href="/contact" />}>Contact</Button>
   */
  render?: React.ReactElement | ((props: React.ComponentProps<'button'>) => React.ReactElement);
  /**
   * Radix compatibility: render as child element
   * @deprecated Use `render` prop instead
   */
  asChild?: boolean;
  /**
   * Show a pending spinner and disable the button for the duration of an action.
   * Opt-in: omit it on surfaces where a spinner is deliberately absent
   * (judge scoring between entries, silent background sync — see docs/INTENT.md).
   *
   * Designed for the standard button form. With `asChild`/`render`, loading
   * still applies inert affordances (aria-busy, aria-disabled, tabIndex,
   * pointer-events) and guards the wrapper click handler, but it cannot block a
   * custom child element's own `onClick`. Keep pending actions on plain buttons.
   */
  loading?: boolean;
}

/**
 * Button component with Apple-inspired styling and multiple variants.
 *
 * @example
 * // Default primary button
 * <Button>Click me</Button>
 *
 * @example
 * // Outline button
 * <Button variant="outline">Cancel</Button>
 *
 * @example
 * // Icon button
 * <Button size="icon"><PlusIcon /></Button>
 *
 * @example
 * // As link
 * <Button render={<a href="/page" />}>Go to page</Button>
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, render, asChild, loading, disabled, children, onClick, ...props },
    ref
  ) => {
    // Support asChild by converting to render prop (backwards compatibility)
    const actualRender = asChild && React.isValidElement(children) ? children : render;

    // Activation guard: `disabled` only blocks a native <button>. For custom
    // renders (asChild, e.g. an <a>) intercept the activation itself so a
    // pending action cannot fire again from a pointer click OR a keyboard Enter
    // on an already-focused element — both dispatch a click event.
    const handleClick = loading
      ? (event: React.MouseEvent<HTMLButtonElement>) => {
          event.preventDefault();
          event.stopPropagation();
        }
      : onClick;

    const content =
      loading && !asChild ? (
        <>
          <Loader2
            data-testid="button-spinner"
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {children}
        </>
      ) : asChild ? undefined : (
        children
      );

    return useRender({
      render: actualRender,
      defaultTagName: 'button',
      props: {
        ...props,
        // `disabled` only blocks native <button>. For custom renders, the
        // handleClick guard above blocks activation; aria-disabled + tabIndex +
        // pointer-events convey and reinforce the inert pending state. The
        // spinner affordance renders for the button form.
        onClick: handleClick,
        disabled: disabled || loading,
        // Force the pending ARIA state while loading, but fall through to any
        // caller-provided value otherwise — never clobber it with undefined.
        'aria-busy': loading ? true : props['aria-busy'],
        'aria-disabled': loading ? true : props['aria-disabled'],
        tabIndex: loading ? -1 : props.tabIndex,
        children: content,
        className: cn(
          buttonVariants({ variant, size }),
          loading && 'pointer-events-none',
          className
        ),
      },
      ref,
    });
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
