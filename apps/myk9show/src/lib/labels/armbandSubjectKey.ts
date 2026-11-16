import { compactFingerprint } from '@/lib/reports/paperworkFingerprint';

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

export interface ArmbandLabelContent extends ArmbandLabelIdentity {
  callName: string;
  handlerName: string;
}

/**
 * What a label prints, and so what its fingerprint is made of. Never the classes the dog is in:
 * moving a dog between classes does not change the paper (MYK9-2073).
 */
export const armbandLabelFacts = (label: ArmbandLabelContent) => ({
  dogId: label.dogId,
  armband: label.armband,
  calendarDay: label.calendarDay,
  callName: label.callName,
  handlerName: label.handlerName,
});

/** The fingerprint a print record stores for this label, and the one the card and panel compare. */
export const armbandLabelFingerprint = (label: ArmbandLabelContent): string =>
  compactFingerprint(armbandLabelFacts(label));
