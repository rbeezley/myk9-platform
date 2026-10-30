import React from 'react';
import { akcSetupSheet } from '@/features/registries';
import type { ReportProps } from '@/lib/reports/types';
import { SetupCheatSheet } from './setupCheatSheet/SetupCheatSheet';

export const AKCSetupCheatSheetReport: React.FC<ReportProps> = () => (
  <SetupCheatSheet sheet={akcSetupSheet} />
);
