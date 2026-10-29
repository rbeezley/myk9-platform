import React from 'react';
import { ukcSetupSheet } from '@/features/registries';
import type { ReportProps } from '@/lib/reports/types';
import { SetupCheatSheet } from './setupCheatSheet/SetupCheatSheet';

export const UKCSetupCheatSheetReport: React.FC<ReportProps> = () => (
  <SetupCheatSheet sheet={ukcSetupSheet} />
);
