import React from 'react';
import { describe, expect, it } from 'vitest';

import { getNativeButtonProp, isNativeButtonElement } from '../base-ui-native-button';

function CustomButton() {
  return <button type="button">Custom</button>;
}

describe('base-ui-native-button helpers', () => {
  it('detects literal button elements as native buttons', () => {
    const button = <button type="button">Save</button>;

    expect(isNativeButtonElement(button)).toBe(true);
    expect(getNativeButtonProp(button, undefined)).toBe(true);
  });

  it('treats component wrappers as non-native unless overridden', () => {
    const wrappedButton = <CustomButton />;

    expect(isNativeButtonElement(wrappedButton)).toBe(false);
    expect(getNativeButtonProp(wrappedButton, undefined)).toBe(false);
  });

  it('preserves an explicit native button override', () => {
    expect(getNativeButtonProp(<CustomButton />, true)).toBe(true);
  });

  it('preserves an explicit non-native button override', () => {
    expect(getNativeButtonProp(<button type="button">Save</button>, false)).toBe(false);
  });
});
