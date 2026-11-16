import { useLocation } from 'react-router-dom';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { FOCUSED_CLASS_PIN_QUERY } from './showStickyLayout';

/**
 * Show Desk from lg with a class selected (MYK9-1989): the class's entries need the laptop's
 * height, so the breadcrumb row above them folds away. The cockpit writes `focus` into the URL for its class. Callers that can also
 * render on another tab (the show shell) must additionally check they are on Show Desk.
 */
export function useClassSelectedOnLaptop(): boolean {
  const { search } = useLocation();
  const wide = useMediaQuery(FOCUSED_CLASS_PIN_QUERY);
  return wide && new URLSearchParams(search).has('focus');
}
