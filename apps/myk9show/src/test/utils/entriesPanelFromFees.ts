/**
 * Entries-panel groups built from a fee calculation's own breakdown, for tests
 * that render the panel as the payment step's total (MYK9-1822: the step itself
 * shows no total; the wizard's one total on screen is the entries panel's).
 */
import type { PanelDogGroup } from '@/components/shows/RegistrationWorkflow/EntriesPanel/EntriesPanel.helpers';
import type { FeeCalculationResult } from '@/components/shows/RegistrationWorkflow/PaymentStep/types';

export function panelGroupsFromFees(feeCalculation: FeeCalculationResult): PanelDogGroup[] {
  return feeCalculation.breakdown.map(item => ({
    dogId: item.dogId,
    dogName: item.dogName,
    lines: item.classes.map(cls => ({
      lineKey: `${item.dogId}:${cls.classId}`,
      classId: cls.classId,
      dayLabel: '',
      label: cls.className,
      feeCents: Math.round(cls.fee * 100),
    })),
  }));
}
