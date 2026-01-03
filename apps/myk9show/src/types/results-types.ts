export interface PastResult {
  id: string;
  showName: string;
  date: string;
  judge: string;
  className: string;
  placement: string;
  notes?: string;
  points?: number;
  source?: 'myK9Show' | 'external';
}
