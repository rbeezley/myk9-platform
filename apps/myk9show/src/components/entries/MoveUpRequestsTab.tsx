/**
 * Class change list (the Move-ups list, renamed in MYK9-1978).
 *
 * Exhibitors ask for a class change from My Entries; each request lands here
 * with the class they asked for and why. Accept moves the entry to exactly that
 * class, in one tap with an Undo. Decline keeps its reason dialog. A request
 * with no stored class (a legacy, secretary-made move-up) is the one case that
 * still gets the class picker.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ListFilterBar, ListResultLine } from '@/components/list-toolkit';
import { toast } from 'sonner';
import { ArrowUpCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';
import {
  getPendingMoveUpRequests,
  getClassesWithCapacity,
  type ClassWithCapacity,
} from '@/services/database/day-of-operations';
import { getTrialsByShow } from '@/services/database/trials';
import {
  acceptClassChangeRequestReplicated,
  approveMoveUpRequestReplicated,
  denyMoveUpRequestReplicated,
} from '@/services/show-day/requestManagement';
import {
  classChangeReasonLabel,
  getClassChangeRequestDetails,
  getRequestedClassesByIds,
  type ClassChangeRequestDetails,
  type RequestedClassFacts,
} from '@/services/database/entries/classChangeRequests';
import { undoShowMapMoveUp } from '@/features/show-map/showMapActionMutations';
import { getMoveUpErrorMessage } from '@/services/replication/moveUpEntryRpc';
import { showUndoToast } from '@/lib/undoToast';
import { getTrialRegistry } from '@/features/registries';
import type { RegistryId } from '@/features/registries';
import {
  startableTrialFromRow,
  trialStartInstant,
  type StartableTrial,
} from '@/features/show-map/trialStartInstant';
import {
  enteredNote,
  lateRequestNote,
  minutesBeforeStart,
} from '@/features/show-map/classChangeLateness';
import { requestTrialLabels, trialFactsById, type TrialFacts } from './classChangeTrialLabels';
import { MOVE_UP_COPY } from '@/hooks/entryManagementErrorCopy';
import { ClassChangeRequestCard } from './ClassChangeRequestCard';
import { ClassChangeDeclineDialog } from './ClassChangeDeclineDialog';
import { MoveUpApproveDialog } from './MoveUpApproveDialog';

interface MoveUpRequest {
  id: string;
  class_id: string | null;
  trial_id: string | null;
  entry_status: string | null;
  jump_height: string | null;
  special_requests: string | null;
  created_at: string | null;
  updated_at: string | null;
  handler: string | null;
  armband: string | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
  } | null;
  class: {
    id: string;
    name: string;
    class_number: string | null;
    trial_id: string;
  } | null;
}

interface MoveUpRequestsTabProps {
  showId: string;
  onRefresh?: () => void;
}

/** Everything one load of the list reads, applied to state in one place. */
interface ListData {
  requests: MoveUpRequest[] | null;
  classes: ClassWithCapacity[] | null;
  trials: ReadonlyArray<Record<string, unknown>> | null;
  /** The stored class asked for, by entry id; null when it could not be read. */
  details: Record<string, ClassChangeRequestDetails> | null;
  /** Name and trial of each class asked for, read apart from capacity. */
  requestedClasses: Record<string, RequestedClassFacts>;
}

async function readListData(showId: string): Promise<ListData> {
  const [requestsResult, classesResult, trialsResult] = await Promise.all([
    getPendingMoveUpRequests(showId),
    getClassesWithCapacity(showId),
    getTrialsByShow(showId),
  ]);
  const requests = requestsResult.error ? null : (requestsResult.data as MoveUpRequest[]);

  let details: ListData['details'] = null;
  let requestedClasses: ListData['requestedClasses'] = {};
  if (requests) {
    try {
      details = await getClassChangeRequestDetails(requests.map(request => request.id));
      const targetIds = [
        ...new Set(Object.values(details).flatMap(d => (d.targetClassId ? [d.targetClassId] : []))),
      ];
      requestedClasses = await getRequestedClassesByIds(targetIds);
    } catch {
      details = null;
    }
  }
  return {
    requests,
    classes: classesResult.error ? null : classesResult.data,
    trials: trialsResult.error
      ? null
      : (trialsResult.data as ReadonlyArray<Record<string, unknown>>),
    details,
    requestedClasses,
  };
}

export const MoveUpRequestsTab: React.FC<MoveUpRequestsTabProps> = ({ showId, onRefresh }) => {
  const [requests, setRequests] = useState<MoveUpRequest[]>([]);
  const [classes, setClasses] = useState<ClassWithCapacity[]>([]);
  /** trial id to its day and number, so a request says which trial each class is in. */
  const [trialFacts, setTrialFacts] = useState<Record<string, TrialFacts>>({});
  // A show's trials always share one registry (scoping §7) — resolved once per
  // load so getAvailableMoveUpTargets recognizes UKC/ASCA-only levels.
  const [registryId, setRegistryId] = useState<RegistryId>('AKC');
  /** trial id to its start facts, for the "asked N minutes before start" note. */
  const [trialStarts, setTrialStarts] = useState<Record<string, StartableTrial>>({});
  const [details, setDetails] = useState<Record<string, ClassChangeRequestDetails>>({});
  const [requestedClasses, setRequestedClasses] = useState<ListData['requestedClasses']>({});
  /** The stored class asked for could not be read: Accept is off rather than guessing. */
  const [detailsError, setDetailsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The class-capacity read failed, so move-up TARGETS are unknown. */
  const [classesError, setClassesError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog state
  const [pickerRequest, setPickerRequest] = useState<MoveUpRequest | null>(null);
  const [declineRequest, setDeclineRequest] = useState<MoveUpRequest | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const apply = (data: ListData) => {
    if (data.requests) setRequests(data.requests);
    else setError(MOVE_UP_COPY.loadFailed);
    // The picker derives "which higher classes are available" from this list.
    // Leaving it empty on a failed read would assert "no higher class
    // available", a domain conclusion drawn from data that never loaded.
    setClassesError(data.classes === null);
    if (data.classes) setClasses(data.classes);
    if (data.trials) {
      setRegistryId(getTrialRegistry(data.trials[0]).id);
      setTrialFacts(trialFactsById(data.trials));
      setTrialStarts(
        Object.fromEntries(
          data.trials.map(row => {
            const trial = startableTrialFromRow(row);
            return [trial.id, trial];
          })
        )
      );
    }
    setDetailsError(data.requests !== null && data.details === null);
    setDetails(data.details ?? {});
    setRequestedClasses(data.requestedClasses);
  };

  // Load requests and classes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        apply(await readListData(showId));
      } catch (_err) {
        setError(MOVE_UP_COPY.loadFailed);
      } finally {
        setIsLoading(false);
      }
    };

    if (showId) {
      fetchData();
    }
  }, [showId]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      apply(await readListData(showId));
    } catch (_err) {
      setError(MOVE_UP_COPY.loadFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const afterChange = async () => {
    await loadData();
    onRefresh?.();
  };

  const dogLabel = (request: MoveUpRequest) =>
    request.dog?.call_name || request.dog?.name || 'Unknown Dog';

  /** One tap: the entry moves to exactly the class the exhibitor asked for. */
  const handleAccept = async (request: MoveUpRequest, targetClassId: string) => {
    setIsProcessing(true);
    try {
      // The exhibitor may have taken the request back, or asked for another class,
      // since this list loaded. Accept moves a dog, so it reads the stored class
      // again and refuses on any difference rather than move to a stale one.
      const fresh = (await getClassChangeRequestDetails([request.id]))[request.id];
      if (!fresh?.targetClassId) {
        toast.error(MOVE_UP_COPY.requestTakenBack);
        await afterChange();
        return;
      }
      if (fresh.targetClassId !== targetClassId) {
        toast.error(MOVE_UP_COPY.requestChanged);
        await afterChange();
        return;
      }
      const { data, error: acceptError } = await acceptClassChangeRequestReplicated(
        request.id,
        targetClassId
      );
      if (acceptError || !data) {
        toast.error(getMoveUpErrorMessage(acceptError, MOVE_UP_COPY.approveFailed));
        return;
      }
      showUndoToast({
        message: `Class change accepted: ${dogLabel(request)}${data.targetClassName ? ` to ${data.targetClassName}` : ''}`,
        onUndo: () => {
          undoShowMapMoveUp(data)
            .then(() => {
              toast.success('Class change undone');
              return afterChange();
            })
            .catch(undoError =>
              toast.error(getMoveUpErrorMessage(undoError, MOVE_UP_COPY.unfinished))
            );
        },
      });
      await afterChange();
    } catch (_err) {
      toast.error(MOVE_UP_COPY.unfinished);
    } finally {
      setIsProcessing(false);
    }
  };

  /** A request that names no class: the secretary picks one, as before. */
  const handlePickerApprove = async (targetClassId: string) => {
    if (!pickerRequest || !targetClassId) return;
    setIsProcessing(true);
    try {
      const { error: approveError } = await approveMoveUpRequestReplicated(
        pickerRequest.id,
        targetClassId
      );
      if (approveError) {
        const full = approveError.message?.includes('full');
        toast.error(full ? MOVE_UP_COPY.targetFull : MOVE_UP_COPY.approveFailed);
      } else {
        toast.success('Class change accepted');
        await afterChange();
      }
    } catch (_err) {
      toast.error(MOVE_UP_COPY.unfinished);
    } finally {
      setIsProcessing(false);
      setPickerRequest(null);
    }
  };

  const handleDecline = async () => {
    if (!declineRequest) return;
    setIsProcessing(true);
    try {
      const { error: denyError } = await denyMoveUpRequestReplicated(declineRequest.id, denyReason);
      if (denyError) {
        toast.error(MOVE_UP_COPY.denyFailed);
      } else {
        toast.success('Class change declined');
        await afterChange();
      }
    } catch (_err) {
      toast.error(MOVE_UP_COPY.unfinished);
    } finally {
      setIsProcessing(false);
      setDeclineRequest(null);
      setDenyReason('');
    }
  };

  const onAcceptClick = (request: MoveUpRequest) => {
    const targetClassId = details[request.id]?.targetClassId;
    if (targetClassId) void handleAccept(request, targetClassId);
    else setPickerRequest(request);
  };

  // Filter requests by search term
  const filteredRequests = requests.filter(request => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      (request.dog?.call_name ?? request.dog?.name)?.toLowerCase().includes(search) ||
      request.dog?.call_name?.toLowerCase().includes(search) ||
      request.handler?.toLowerCase().includes(search) ||
      request.class?.name?.toLowerCase().includes(search)
    );
  });

  if (isLoading) {
    // Section load = table skeleton (previews the class change table).
    // The inline "Processing…" button spinners below stay animate-spin.
    return (
      <div role="status" aria-label="Loading class changes" className="py-4">
        <TableSkeleton rows={6} columns={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ArrowUpCircle className="h-5 w-5" aria-hidden />
            Class changes{error ? '' : ` (${filteredRequests.length})`}
          </h2>
          <p className="text-sm text-muted-foreground">
            Exhibitors ask for a class change from My Entries. Accept moves the dog to the class
            they asked for.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Search — the list-toolkit's shared search field (MYK9-795), so this
          view reads and behaves the same as the registration-queue views. */}
      {requests.length > 0 && (
        <>
          <ListFilterBar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Search by dog, handler, or class..."
            fields={[]}
          />
          <ListResultLine
            shown={filteredRequests.length}
            total={requests.length}
            noun={['request', 'requests']}
            filtered={searchTerm !== ''}
            onShowAll={() => setSearchTerm('')}
          />
        </>
      )}

      {/*
        The empty state is gated on `!error`. When the read failed, the tab
        used to show the destructive Alert AND "There are no pending requests"
        at the same time -- two contradictory claims, of which the confident one
        was the wrong one. An unread list is not an empty list, so on failure
        the error card is the whole answer.
      */}
      {error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" aria-hidden />
            <p className="text-lg font-medium">Couldn&rsquo;t load class changes</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We don&rsquo;t know whether this show has any pending requests.
            </p>
            <Button className="mt-4" onClick={loadData}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : filteredRequests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ArrowUpCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium">No class changes waiting</p>
            <p className="text-sm text-muted-foreground">
              {searchTerm
                ? 'No requests match your search'
                : 'There are no class change requests for this show'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map(request => {
            const stored = details[request.id];
            const trialId = request.class?.trial_id ?? request.trial_id ?? '';
            const targetClass = stored?.targetClassId
              ? classes.find(cls => cls.id === stored.targetClassId)
              : undefined;
            const requested = stored?.targetClassId
              ? requestedClasses[stored.targetClassId]
              : undefined;
            // The requested trial comes from the class read, not capacity, so it
            // still shows when the capacity read fails.
            const targetTrialId = requested?.trialId ?? targetClass?.trial_id;
            // Lateness is measured against the trial the dog is asking to move into.
            // When that trial cannot be determined there is no note, never one
            // measured against the source trial.
            const startTrial = targetTrialId ? trialStarts[targetTrialId] : undefined;
            const trialLabels = requestTrialLabels(trialFacts, trialId, targetTrialId);
            const lateNote = lateRequestNote(
              minutesBeforeStart(stored?.requestedAt, trialStartInstant(startTrial))
            );
            return (
              <ClassChangeRequestCard
                key={request.id}
                request={{
                  id: request.id,
                  dogName: dogLabel(request),
                  registeredName:
                    request.dog?.name && request.dog.name !== request.dog.call_name
                      ? request.dog.name
                      : null,
                  armband: request.armband,
                  handler: request.handler,
                  fromClass: `${request.class?.class_number ? `#${request.class.class_number} ` : ''}${request.class?.name ?? ''}`,
                  trialLabel: trialLabels.fromTrial,
                  requestedTrialLabel: trialLabels.requestedTrial,
                  requestedClass: requested?.name ?? null,
                  reasonLabel: classChangeReasonLabel(stored?.reason),
                  askedAt: stored?.requestedAt ?? request.created_at,
                  lateNote,
                  enteredNote:
                    targetClass && !classesError
                      ? enteredNote(targetClass.accepted_count, targetClass.max_entries)
                      : null,
                }}
                acceptDisabledReason={detailsError ? MOVE_UP_COPY.targetUnreadable : null}
                isBusy={isProcessing}
                onAccept={() => onAcceptClick(request)}
                onDecline={() => {
                  setDeclineRequest(request);
                  setDenyReason('');
                }}
              />
            );
          })}
        </div>
      )}

      <MoveUpApproveDialog
        key={pickerRequest?.id ?? 'closed'}
        request={pickerRequest}
        classes={classes}
        classesError={classesError}
        registryId={registryId}
        isProcessing={isProcessing}
        onApprove={targetClassId => void handlePickerApprove(targetClassId)}
        onClose={() => setPickerRequest(null)}
      />

      <ClassChangeDeclineDialog
        open={declineRequest !== null}
        dogName={declineRequest ? dogLabel(declineRequest) : undefined}
        reason={denyReason}
        onReasonChange={setDenyReason}
        isProcessing={isProcessing}
        onConfirm={() => void handleDecline()}
        onClose={() => {
          setDeclineRequest(null);
          setDenyReason('');
        }}
      />
    </div>
  );
};

export default MoveUpRequestsTab;
