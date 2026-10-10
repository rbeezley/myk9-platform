import type { ScoresheetClassInfo } from '../types/scoreData';

/**
 * Header line under the scoresheet title: the class, then the judge
 * ("Container Novice · Judge Pat Lee"). MYK9-1086: the judge's name belongs
 * on the sheet the timer is holding.
 */
export function formatScoresheetSubtitle(classInfo: ScoresheetClassInfo): string {
  const level = classInfo.level && classInfo.level !== 'Unknown' ? classInfo.level : '';
  const className = [classInfo.element, level].filter(Boolean).join(' ');
  const judge = classInfo.judgeName?.trim();
  return judge ? `${className} · Judge ${judge}` : className;
}
