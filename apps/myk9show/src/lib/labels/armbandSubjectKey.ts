/**
 * The one spelling of an armband label's identity: a dog on a day. The print record writer
 * (`buildArmbandPaperworkDescriptor`) and the "added since the last print" reader both use it,
 * so what was printed and what is looked up can never drift apart.
 */
interface ArmbandLabelIdentity {
  dogId: string;
  armband: number;
  calendarDay: string;
}

/** The dog's identity: the dog id, or the armband when the entry has no dog id. */
export const armbandDogKey = (label: Pick<ArmbandLabelIdentity, 'dogId' | 'armband'>): string =>
  label.dogId || `armband:${label.armband}`;

export const armbandLabelSubjectKey = (label: ArmbandLabelIdentity): string =>
  `dog-day:${armbandDogKey(label)}:${label.calendarDay}`;
