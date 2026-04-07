import { useState, useRef, useMemo, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useShowStore } from '@/store/showStore';
import { useReportData } from '@/hooks/queries/useReportData';
import { getReportById } from '@/lib/reports/reportRegistry';
import { ReportControlsBar } from './ReportControlsBar';
import { ReportPreview } from './ReportPreview';
import { printIframe } from './reportPreviewUtils';

export default function ReportsPage() {
  const { selectedShowId, shows, selectShow } = useShowStore();
  const [reportType, setReportType] = useState('check-in-sheet');
  const [trialId, setTrialId] = useState<string>('all');
  const [classId, setClassId] = useState<string>('all');
  const report = getReportById(reportType);
  const [sortOrder, setSortOrder] = useState(report?.defaultSort ?? 'run-order');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;

  useEffect(() => {
    if (!selectedShowId && shows.length > 0) {
      selectShow(shows[0].id);
    }
  }, [selectedShowId, shows, selectShow]);

  const { show, trials, classes, entries, isLoading, isError } = useReportData({
    show: selectedShow,
    trialId,
    classId,
  });

  const trialOptions = useMemo(
    () =>
      (trials ?? []).map(t => ({
        id: t.id,
        trial_number: Number(t.trial_number ?? 0),
        date: t.date ?? '',
      })),
    [trials]
  );

  const classOptions = useMemo(
    () =>
      (classes ?? []).map(c => ({
        id: c.id,
        element: c.element ?? '',
        level: c.level ?? '',
        section: c.section ?? '',
        trial_id: c.trial_id ?? '',
      })),
    [classes]
  );

  const handleReportTypeChange = (value: string) => {
    setReportType(value);
    const newReport = getReportById(value);
    setSortOrder(newReport?.defaultSort ?? 'run-order');
    setTrialId('all');
    setClassId('all');
  };

  const handleTrialChange = (value: string) => {
    setTrialId(value);
    if (value === 'all') {
      setClassId('all');
    }
  };

  const handleShowChange = (value: string) => {
    selectShow(value);
    setTrialId('all');
    setClassId('all');
  };

  const handlePrint = () => {
    printIframe(iframeRef);
  };

  return (
    <div className="container mx-auto py-6 flex flex-col">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          {selectedShow && (
            <p className="text-sm text-muted-foreground mt-1">{selectedShow.name}</p>
          )}
        </div>
        {shows.length > 0 && (
          <Select value={selectedShowId} onValueChange={handleShowChange}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select show" />
            </SelectTrigger>
            <SelectContent>
              {shows.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Controls */}
      <ReportControlsBar
        reportType={reportType}
        trialId={trialId}
        classId={classId}
        sortOrder={sortOrder}
        trials={trialOptions}
        classes={classOptions}
        onReportTypeChange={handleReportTypeChange}
        onTrialChange={handleTrialChange}
        onClassChange={setClassId}
        onSortChange={setSortOrder}
        onPrint={handlePrint}
      />

      {/* Preview */}
      <div className="mt-6 flex justify-center">
        <ReportPreview
          reportType={reportType}
          show={show}
          trials={trials}
          classes={classes}
          entries={entries}
          trialId={trialId}
          classId={classId}
          sortOrder={sortOrder}
          isLoading={isLoading}
          isError={isError}
          iframeRef={iframeRef}
        />
      </div>
    </div>
  );
}
