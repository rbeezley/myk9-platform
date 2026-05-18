export interface ScheduleSlipScriptInput {
  showName?: string | null | undefined;
  ring: string;
  delayMinutes: number;
  affectedClass: string;
  note?: string | undefined;
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function minutesLabel(minutes: number): string {
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function buildScheduleSlipScript(input: ScheduleSlipScriptInput): string {
  const showName = clean(input.showName);
  const ring = clean(input.ring) || 'this ring';
  const affectedClass = clean(input.affectedClass) || 'The affected class';
  const delayMinutes = Number.isFinite(input.delayMinutes)
    ? Math.max(1, Math.round(input.delayMinutes))
    : 30;
  const note = clean(input.note);

  const lines = [
    `Attention exhibitors${showName ? ` at ${showName}` : ''}: ${ring} is running about ${minutesLabel(delayMinutes)} behind.`,
    `${affectedClass} will start later than the posted schedule.`,
    'Please stay near the ring and listen for your class call. We will share another update if the schedule changes.',
  ];

  if (note) {
    lines.push(note);
  }

  lines.push('Thank you for your patience.');

  return lines.join(' ');
}
