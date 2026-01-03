// Vitest Testing Library extensions
/// <reference types="@testing-library/jest-dom" />

declare global {
  namespace Vi {
    interface Assertion<T = unknown> {
      toBeInTheDocument(): T;
      toHaveTextContent(text: string | RegExp): T;
      toHaveClass(className: string): T;
      toHaveAttribute(attr: string, value?: string): T;
      toHaveValue(value: string | number | string[]): T;
      toBeChecked(): T;
      toBeDisabled(): T;
      toBeEnabled(): T;
      toBeVisible(): T;
      toBeInvalid(): T;
      toBeValid(): T;
      toHaveFocus(): T;
      toHaveFormValues(values: Record<string, unknown>): T;
      toHaveStyle(styles: Record<string, unknown> | string): T;
      toBeEmptyDOMElement(): T;
      toContainElement(element: HTMLElement | null): T;
      toContainHTML(htmlText: string): T;
      toHaveDisplayValue(value: string | RegExp | Array<string | RegExp>): T;
      toBePartiallyChecked(): T;
      toHaveAccessibleDescription(description?: string | RegExp): T;
      toHaveAccessibleName(name?: string | RegExp): T;
      toHaveErrorMessage(message?: string | RegExp): T;
    }
  }
}