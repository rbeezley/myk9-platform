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
  ({ className, variant, size, render, asChild, loading, disabled, children, ...props }, ref) => {
    // Support asChild by converting to render prop (backwards compatibility)
    const actualRender = asChild && React.isValidElement(children) ? children : render;

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
        // `disabled` only blocks native <button>. When rendering a custom
        // element (asChild/render, e.g. an <a>), also mark it aria-disabled and
        // make it non-interactive so a pending action cannot be re-triggered by
        // pointer or keyboard. The spinner affordance renders for the button
        // form; custom-render forms convey pending via aria-busy + inertness.
        disabled: disabled || loading,
        'aria-busy': loading || undefined,
        'aria-disabled': loading || undefined,
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
