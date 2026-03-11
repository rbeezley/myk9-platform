/**
 * Shared Scoresheet Components
 *
 * Props-based scoresheet components that can be used in any React app.
 * Each scoresheet receives entry data and callbacks via props.
 *
 * Two variants per sport:
 * - LiveScoresheet: Mobile-first, stopwatch, touch (for judges)
 * - EntryScoresheet: Keyboard-first, compact form (for secretaries)
 */

// AKC Scoresheets
export { AKCScentWorkLiveScoresheet } from './AKC/AKCScentWorkLiveScoresheet';
export { AKCScentWorkEntryScoresheet } from './AKC/AKCScentWorkEntryScoresheet';
export { AKCNationalsLiveScoresheet } from './AKC/AKCNationalsLiveScoresheet';
export { AKCNationalsEntryScoresheet } from './AKC/AKCNationalsEntryScoresheet';
export { AKCFastCatLiveScoresheet } from './AKC/AKCFastCatLiveScoresheet';
export { AKCFastCatEntryScoresheet } from './AKC/AKCFastCatEntryScoresheet';

// UKC Scoresheets
export { UKCNoseworkLiveScoresheet } from './UKC/UKCNoseworkLiveScoresheet';
export { UKCNoseworkEntryScoresheet } from './UKC/UKCNoseworkEntryScoresheet';
export { UKCRallyLiveScoresheet } from './UKC/UKCRallyLiveScoresheet';
export { UKCRallyEntryScoresheet } from './UKC/UKCRallyEntryScoresheet';
export { UKCObedienceLiveScoresheet } from './UKC/UKCObedienceLiveScoresheet';
export { UKCObedienceEntryScoresheet } from './UKC/UKCObedienceEntryScoresheet';

// ASCA Scoresheets
export { ASCAScentDetectionLiveScoresheet } from './ASCA/ASCAScentDetectionLiveScoresheet';
export { ASCAScentDetectionEntryScoresheet } from './ASCA/ASCAScentDetectionEntryScoresheet';
