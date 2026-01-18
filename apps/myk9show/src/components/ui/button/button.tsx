import * as React from "react"
import { useRender } from "@base-ui/react/use-render"
import { type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { buttonVariants } from "./buttonVariants"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Override the rendered element with a custom one.
   * @example <Button render={<a href="/contact" />}>Contact</Button>
   */
  render?: React.ReactElement | ((props: React.ComponentProps<'button'>) => React.ReactElement)
  /**
   * Radix compatibility: render as child element
   */
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, render, asChild, children, ...props }, ref) => {
    // Support asChild by converting to render prop
    const actualRender = asChild && React.isValidElement(children) ? children : render

    const renderProps = {
      ...props,
      className: cn(buttonVariants({ variant, size, className })),
      ...(asChild ? {} : { children }),
    }

    return useRender({
      ...(actualRender !== undefined && { render: actualRender }),
      defaultTagName: 'button',
      props: renderProps,
      ref,
    })
  }
)
Button.displayName = "Button"

export { Button }
