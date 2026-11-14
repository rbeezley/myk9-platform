import { mergeReportPdfs } from '../mergeReportPdfs';
import type { ReviewJudge } from './judgeReview';
import { stampPacketFooter } from './packetFooter';
import {
  renderReviewCover,
  renderReviewPages,
  reviewRuleLine,
  reviewVerb,
} from './renderJudgeReviewPdf';

/**
 * A judge's review packet: the cover, then one results page per class page, in judging order,
 * with the packet footer on every page. Loaded on demand (pdf-lib stays out of the Show Desk).
 */
export async function buildJudgeReviewPdf(
  judge: ReviewJudge,
  showName: string,
  timeZone: string,
  printedAt: Date = new Date()
): Promise<Uint8Array> {
  const verb = reviewVerb(judge.registryId);
  const cover = renderReviewCover(judge, {
    showName,
    ruleLine: reviewRuleLine(judge.registryId),
    verb,
  });
  const merged = await mergeReportPdfs([cover, renderReviewPages(judge, verb)]);
  return stampPacketFooter(merged, judge.judgeName, printedAt, timeZone);
}
