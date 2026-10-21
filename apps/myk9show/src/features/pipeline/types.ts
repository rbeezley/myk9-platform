/** Pipeline stage numbers (1-6) */
export type PipelineStage = 1 | 2 | 3 | 4 | 5 | 6;

export interface PipelineStageMeta {
  stage: PipelineStage;
  label: string;
  shortLabel: string;
  description: string;
}
