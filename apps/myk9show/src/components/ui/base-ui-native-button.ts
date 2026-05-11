import React from 'react';

// Detect only literal <button> children. Component wrappers should pass nativeButton
// explicitly when their eventual DOM element is known.
export function isNativeButtonElement(element: React.ReactNode): boolean {
  return (
    React.isValidElement(element) && typeof element.type === 'string' && element.type === 'button'
  );
}

export function getNativeButtonProp(
  element: React.ReactNode,
  nativeButton: boolean | undefined
): boolean {
  return nativeButton ?? isNativeButtonElement(element);
}
