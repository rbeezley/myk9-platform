import { useState, useRef, useMemo, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useShowStore } from '@/store/showStore';
import { useReportData } from '@/hooks/queries/useReportData';
import { getReportById } from '@/lib/reports/reportRegistry';
import { ReportControlsBar } from './ReportControlsBar';
import { ReportPreview } from './ReportPreview';
import { printIframe } from './reportPreviewUtils';
import { ArmbandLabelsReport } from '@/components/reports/labels/ArmbandLabelsReport';

export default function ReportsPage() {
  const { selectedShowId, shows, selectShow } = useShowStore();
  const [reportType, setReportType] = useState('check-in-sheet');
  const [trialId, setTrialId] = useState<string>('all');
  const [classId, setClassId] = useState<string>('all');
  const [dogId, setDogId] = useState<string>('all');
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
      ((trials ?? []) as Array<Record<string, unknown>>).map(t => ({
        id: t.id as string,
        trial_number: Number(t.trial_number ?? 0),
        date: (t.date ?? '') as string,
      })),
    [trials]
  );

  const classOptions = useMemo(
    () =>
      ((classes ?? []) as Array<Record<string, unknown>>).map(c => ({
        id: c.id as string,
        element: (c.element ?? '') as string,
        level: (c.level ?? '') as string,
        section: (c.section ?? '') as string,
        trial_id: (c.trial_id ?? '') as string,
      })),
    [classes]
  );

  const { data: dogOptionsRaw } = useQuery({
    queryKey: ['entry-form-dog-options', selectedShowId],
    queryFn: async () => {
      if (!selectedShowId) return [];
      const { data: entryDogs } = await supabase
        .from('entries')
        .select('dog_id, armband, dog:dogs!inner(id, call_name)')
        .eq('show_id', selectedShowId)
        .is('deleted_at', null);

      if (!entryDogs?.length) return [];

      const dogIds = [...new Set(entryDogs.map(e => e.dog_id).filter(Boolean))] as string[];
      const { data: regs } = await supabase
        .from('dog_registrations')
        .select('dog_id, registered_name')
        .in('dog_id', dogIds);

      const regMap = new Map((regs ?? []).map(r => [r.dog_id, r.registered_name]));
      const seen = new Set<string>();

      return entryDogs
        .filter(e => {
          if (!e.dog_id || seen.has(e.dog_id)) return false;
          seen.add(e.dog_id);
          return true;
        })
        .map(e => ({
          id: e.dog_id!,
          callName: ((e.dog as Record<string, unknown>)?.call_name as string) ?? '',
          registeredName: regMap.get(e.dog_id!) ?? null,
          armband: e.armband != null ? Number(e.armband) : null,
        }))
        .sort((a, b) => (a.armband ?? 0) - (b.armband ?? 0));
    },
    enabled: !!selectedShowId && (report?.supportsDogFilter ?? false),
    staleTime: 5 * 60 * 1000,
  });

  const dogOptions = dogOptionsRaw ?? [];

  const handleReportTypeChange = (value: string) => {
    setReportType(value);
    const newReport = getReportById(value);
    setSortOrder(newReport?.defaultSort ?? 'run-order');
    setTrialId('all');
    setClassId('all');
    setDogId('all');
  };

  const handleTrialChange = (value: string) => {
    setTrialId(value);
    setDogId('all');
    if (value === 'all') {
      setClassId('all');
    }
  };

  const handleShowChange = (value: string) => {
    selectShow(value);
    setTrialId('all');
    setClassId('all');
    setDogId('all');
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
              <SelectValue placeholder="Select show">
                {selectedShow?.name ?? 'Select show'}
              </SelectValue>
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
        dogId={dogId}
        sortOrder={sortOrder}
        trials={trialOptions}
        classes={classOptions}
        dogs={dogOptions}
        onReportTypeChange={handleReportTypeChange}
        onTrialChange={handleTrialChange}
        onClassChange={setClassId}
        onDogChange={setDogId}
        onSortChange={setSortOrder}
        onPrint={handlePrint}
      />

      {/* Preview */}
      <div className="mt-6 flex justify-center">
        {reportType === 'armband-labels' ? (
          <div className="w-full">
            <ArmbandLabelsReport
              showId={selectedShowId}
              iframeRef={iframeRef}
            />
            <iframe
              ref={iframeRef}
              title="Label Print"
              style={{ display: 'none' }}
            />
          </div>
        ) : (
          <ReportPreview
            reportType={reportType}
            show={show}
            trials={trials as Parameters<typeof ReportPreview>[0]['trials']}
            classes={classes as Parameters<typeof ReportPreview>[0]['classes']}
            entries={entries as Parameters<typeof ReportPreview>[0]['entries']}
            trialId={trialId}
            classId={classId}
            dogId={dogId}
            sortOrder={sortOrder}
            isLoading={isLoading}
            isError={isError}
            iframeRef={iframeRef}
          />
        )}
      </div>
    </div>
  );
}
