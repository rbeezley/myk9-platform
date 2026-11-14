import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { getTrialRegistry } from '@/features/registries';
import { buildAKCScentWorkCertificationPagePdfBytes } from '@/features/organization-forms/akcScentWorkCertificationPage';
import { getOrganizationFormTemplateUrl } from '@/features/organization-forms/organizationFormTemplates';
import { buildOfficialPdfBytes } from '@/features/organization-forms/officialPdfDownload';
import { getOfficialPdfReportConfig } from '@/features/organization-forms/officialPdfReports';
import { renderReportToHtml } from '@/lib/reports/reportRenderer';
import { getReportById } from '@/lib/reports/reportRegistry';
import type { TrialOfficials, UKCTrialReportContext } from '@/lib/reports/types';
import {
  buildShowReportProps,
  buildTrialReportProps,
} from '@/pages/secretary/ReportsPage/reportDataMapping';
import { getReportRenderingMode } from '@/pages/secretary/ReportsPage/reportRenderingMode';
import { officialFormJudgeBlock } from '@/pages/secretary/ReportsPage/reportJudgeGate';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

import { mergeReportPdfs } from '../mergeReportPdfs';
import { afterShowReportsFor } from './afterShowReports';

export interface AfterShowInput {
  show: Show;
  trials: readonly DbTrial[];
  classes: readonly DbClass[];
  entries: readonly DbEntry[];
  trialId: string;
  officials: TrialOfficials | null;
  ukcTrialReportContext: UKCTrialReportContext | null;
  catalogProfilesReadComplete: boolean;
}

export interface AfterShowDocuments {
  /** The printed reports as one HTML document, or null when none could be built. */
  reportsHtml: string | null;
  reportNames: string[];
  /** The registry's forms, filled in, as one PDF, or null when none could be built. */
  formsPdf: Uint8Array | null;
  formNames: string[];
  /** Things left out and why. Never blocks: the rest still prints. */
  notes: string[];
}

const PAGE_BREAK = '<div style="break-before: page; page-break-before: always"></div>';

/**
 * The trial's after-show paperwork from the very report definitions the Reports page uses, so a
 * page here is the page Reports shows. Loaded on demand (react-dom/server and pdf-lib stay out of
 * the Show Desk bundle). A report that cannot be built is a note, not a failure.
 */
export async function buildAfterShowDocuments(input: AfterShowInput): Promise<AfterShowDocuments> {
  const trial = input.trials.find(item => item.id === input.trialId);
  const ids = afterShowReportsFor(trial ? getTrialRegistry(trial).id : null);
  const notes: string[] = [];
  const judgeBlock = (reportId: string) =>
    officialFormJudgeBlock(reportId, input.show, input.trials, input.classes, input.trialId, 'all');

  const markup: string[] = [];
  const reportNames: string[] = [];
  for (const reportId of ids.reports) {
    const report = getReportById(reportId);
    if (!report) continue;
    const blocked = judgeBlock(reportId);
    if (blocked) {
      notes.push(`${report.name} is left out. ${blocked}`);
      continue;
    }
    try {
      const props =
        getReportRenderingMode(report) === 'show'
          ? [
              buildShowReportProps({
                report,
                show: input.show,
                trials: [...input.trials],
                classes: [...input.classes],
                entries: [...input.entries],
                trialId: input.trialId,
                classId: 'all',
                dogId: 'all',
                sortOrder: report.defaultSort,
                ...(input.catalogProfilesReadComplete
                  ? {}
                  : { catalogProfilesReadComplete: false }),
              }),
            ]
          : buildTrialReportProps({
              show: input.show,
              trials: [...input.trials],
              classes: [...input.classes],
              entries: [...input.entries],
              scope: { kind: 'trial', showId: input.show.id, trialId: input.trialId },
              sortOrder: report.defaultSort,
              ...(report.excludesHeldEntries ? { omitHeldEntries: true } : {}),
              ...(input.officials ? { officials: input.officials } : {}),
            });
      markup.push(
        props.map(item => renderToStaticMarkup(createElement(report.component, item))).join('')
      );
      reportNames.push(report.name);
    } catch {
      notes.push(`${report.name} could not be built.`);
    }
  }

  const forms: Uint8Array[] = [];
  const formNames: string[] = [];
  for (const reportId of ids.forms) {
    const report = getReportById(reportId);
    if (!report) continue;
    const blocked = judgeBlock(reportId);
    if (blocked) {
      notes.push(`${report.name} is left out. ${blocked}`);
      continue;
    }
    try {
      const props = buildTrialReportProps({
        show: input.show,
        trials: [...input.trials],
        classes: [...input.classes],
        entries: [...input.entries],
        scope: { kind: 'trial', showId: input.show.id, trialId: input.trialId },
        sortOrder: report.defaultSort,
        ...(report.excludesHeldEntries ? { omitHeldEntries: true } : {}),
        ...(input.officials ? { officials: input.officials } : {}),
      })[0];
      if (!props) continue;
      const withContext = { ...props, ukcTrialReportContext: input.ukcTrialReportContext };
      if (reportId === 'judges-certification') {
        const response = await fetch(
          getOrganizationFormTemplateUrl('akc-scent-work-certification-page')
        );
        if (!response.ok) throw new Error('certification template');
        forms.push(
          await buildAKCScentWorkCertificationPagePdfBytes({
            props: withContext,
            templateBytes: new Uint8Array(await response.arrayBuffer()),
          })
        );
      } else {
        const config = getOfficialPdfReportConfig(reportId, withContext);
        if (!config) continue;
        forms.push(await buildOfficialPdfBytes(config, withContext));
      }
      formNames.push(report.name);
    } catch {
      notes.push(`${report.name} could not be built.`);
    }
  }

  return {
    reportsHtml: markup.length > 0 ? renderReportToHtml(markup.join(PAGE_BREAK)) : null,
    reportNames,
    formsPdf: forms.length > 0 ? await mergeReportPdfs(forms) : null,
    formNames,
    notes,
  };
}
