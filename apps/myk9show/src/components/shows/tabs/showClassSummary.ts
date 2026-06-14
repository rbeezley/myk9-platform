export interface ShowClassSummaryClass {
  id?: string | number | null;
  name?: string | null;
  level?: string | null;
  element?: string | null;
  trialName?: string | null;
}

export interface ShowClassSummary {
  totalClasses: number;
  trialLabels: string[];
  elementLabels: string[];
  levelLabels: string[];
}

const compactLabels = (values: Array<string | null | undefined>): string[] =>
  Array.from(
    new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b));

export const summarizeShowClasses = (classes: ShowClassSummaryClass[]): ShowClassSummary => {
  const elementLabels = compactLabels(
    classes.map(showClass => showClass.element ?? showClass.name)
  );

  return {
    totalClasses: classes.length,
    trialLabels: compactLabels(classes.map(showClass => showClass.trialName)),
    elementLabels,
    levelLabels: compactLabels(classes.map(showClass => showClass.level)),
  };
};
