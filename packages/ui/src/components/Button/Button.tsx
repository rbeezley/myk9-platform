import * as React from 'react';
import { useRender } from '@base-ui/react/use-render';
import { type VariantProps } from 'class-variance-authority';

import { cn } from '../../utils/cn';
import { buttonVariants } from './buttonVariants';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
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
  ({ className, variant, size, render, asChild, children, ...props }, ref) => {
    // Support asChild by converting to render prop (backwards compatibility)
    const actualRender = asChild && React.isValidElement(children) ? children : render;

    return useRender({
      render: actualRender,
      defaultTagName: 'button',
      props: {
        ...props,
        children: asChild ? undefined : children,
        className: cn(buttonVariants({ variant, size, className })),
      },
      ref,
    });
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
