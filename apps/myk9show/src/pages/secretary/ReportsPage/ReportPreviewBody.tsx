import type React from 'react';

import { ArmbandLabelsReport } from '@/components/reports/labels/ArmbandLabelsReport';
import { ResultLabelsReport } from '@/components/reports/labels/ResultLabelsReport';
import { LabelModeHeader } from '@/components/reports/labels/LabelModeChrome';
import type { ReportDataState } from '@/hooks/queries/useReportData';
import type { ReportScope } from '@/lib/reports/types';
import type { PaperworkDescriptor } from '@/features/show-map/cockpit/paperworkPrintState';

import { ReportPreview } from './ReportPreview';
import type { HostedReportData } from './useHostedReportData';

type PreviewProps = Parameters<typeof ReportPreview>[0];

export interface ReportPreviewBodyProps {
  reportType: string;
  showId: string | undefined;
  scope: ReportScope;
  show: PreviewProps['show'];
  trials: unknown;
  classes: unknown;
  entries: unknown;
  trialId: string;
  classId: string;
  dogId: string;
  sortOrder: string;
  isLoading: boolean;
  isError: boolean;
  dataState: ReportDataState;
  hosted: HostedReportData;
  catalogProfilesReadComplete: boolean;
  hasDownloadAction: boolean;
  downloadBlockedReason: string | undefined;
  onRetry: () => void;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onArmbandDescriptorChange?: (descriptor: PaperworkDescriptor | null) => void;
}

/**
 * The one place a report's preview frame is chosen and mounted. The Reports page and the Overview
 * print panel both render through it, so the paper a secretary previews beside the Overview is
 * the paper Reports would have printed.
 */
export function ReportPreviewBody(props: ReportPreviewBodyProps) {
  const { reportType, iframeRef } = props;
  if (reportType === 'armband-labels') {
    return (
      <div className="w-full">
        <LabelModeHeader
          title="Armband Labels"
          subtitle="Choose a label size, pick which armbands to print, then Print."
        />
        <ArmbandLabelsReport
          showId={props.showId}
          scope={props.scope}
          iframeRef={iframeRef}
          onDescriptorChange={props.onArmbandDescriptorChange ?? noopDescriptor}
        />
        <iframe ref={iframeRef} title="Label Print" style={{ display: 'none' }} />
      </div>
    );
  }
  if (reportType === 'result-labels') {
    return (
      <div className="w-full">
        <LabelModeHeader
          title="Result Labels"
          subtitle="Pick a trial and class, set the sort, then Print the result labels."
        />
        <ResultLabelsReport
          show={props.show}
          trials={props.trials as Parameters<typeof ResultLabelsReport>[0]['trials']}
          classes={props.classes as Parameters<typeof ResultLabelsReport>[0]['classes']}
          entries={props.entries as Parameters<typeof ResultLabelsReport>[0]['entries']}
          scope={props.scope}
          sortOrder={props.sortOrder}
          isLoading={props.isLoading}
          isUnavailable={props.dataState === 'unavailable'}
          isError={props.isError}
          iframeRef={iframeRef}
        />
        <iframe ref={iframeRef} title="Label Print" style={{ display: 'none' }} />
      </div>
    );
  }
  return (
    <div className="w-fit mx-auto">
      <ReportPreview
        reportType={reportType}
        show={props.show}
        trials={props.trials as PreviewProps['trials']}
        classes={props.classes as PreviewProps['classes']}
        entries={props.entries as PreviewProps['entries']}
        trialId={props.trialId}
        classId={props.classId}
        dogId={props.dogId}
        sortOrder={props.sortOrder}
        isLoading={props.isLoading}
        isError={props.isError}
        dataState={props.dataState}
        hosted={props.hosted}
        catalogProfilesReadComplete={props.catalogProfilesReadComplete}
        hasDownloadAction={props.hasDownloadAction}
        downloadBlockedReason={props.downloadBlockedReason}
        onRetry={props.onRetry}
        iframeRef={iframeRef}
      />
    </div>
  );
}

function noopDescriptor() {}
