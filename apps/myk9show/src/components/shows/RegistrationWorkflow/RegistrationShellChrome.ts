import { createContext, useContext } from 'react';

/**
 * Lets the wizard's bottom entries bar tell the shell how tall it is (MYK9-1138).
 *
 * The shell is the page's scrollport, so it sets `scroll-padding-bottom` from this height: without
 * it the browser's scroll-to-focus parks a control under the bar. The bar owns its own height (it
 * wraps and grows with its details list), so it reports it rather than the shell guessing.
 */
export const RegistrationShellChromeContext = createContext<{
  setBarHeight: (height: number) => void;
}>({ setBarHeight: () => {} });

export function useRegistrationShellChrome() {
  return useContext(RegistrationShellChromeContext);
}
