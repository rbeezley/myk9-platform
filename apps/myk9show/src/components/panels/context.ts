import { createContext } from 'react';
import { PanelContextValue } from './types';

export const PanelContext = createContext<PanelContextValue | undefined>(undefined);