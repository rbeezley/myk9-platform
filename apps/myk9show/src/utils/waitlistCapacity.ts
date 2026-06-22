export interface MailInReserveInput {
  capacity: number;
  strategy: string | null;
  value: number | null;
  autoRelease?: boolean | null;
  releaseDate?: string | null;
  todayIso?: string;
}

export function calculateMailInReserved(input: MailInReserveInput): number {
  const todayIso = input.todayIso ?? new Date().toISOString().slice(0, 10);
  const releaseDateIso = input.releaseDate?.slice(0, 10);
  if (input.autoRelease && releaseDateIso && releaseDateIso <= todayIso) {
    return 0;
  }

  if (input.strategy === 'fixed') {
    return Math.max(0, input.value ?? 0);
  }

  if (input.strategy === 'percentage') {
    return Math.max(0, Math.floor((input.capacity * (input.value ?? 0)) / 100));
  }

  return 0;
}
