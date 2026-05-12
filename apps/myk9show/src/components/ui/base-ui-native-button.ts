import React from 'react';

type NamedElementType = {
  displayName?: string;
  render?: {
    displayName?: string;
  };
};

// Detect literal <button> children and this app's shared Button wrapper. Other
// component wrappers should pass nativeButton explicitly when their eventual DOM
// element is known.
export function isNativeButtonElement(element: React.ReactNode): boolean {
  const elementType = React.isValidElement(element) ? element.type : undefined;
  const component = elementType as NamedElementType | undefined;
  const componentName = component?.displayName || component?.render?.displayName;

  return (
    React.isValidElement(element) &&
    ((typeof element.type === 'string' && element.type === 'button') || componentName === 'Button')
  );
}

export function getNativeButtonProp(
  element: React.ReactNode,
  nativeButton: boolean | undefined
): boolean {
  return nativeButton ?? isNativeButtonElement(element);
}
