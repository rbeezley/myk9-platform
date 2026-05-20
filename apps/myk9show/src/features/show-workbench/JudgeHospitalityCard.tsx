import { useEffect, useMemo, useState } from 'react';
import { Coffee, Droplets, Utensils } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  EMPTY_HOSPITALITY_ITEM,
  readJudgeHospitalityState,
  summarizeJudgeHospitality,
  writeJudgeHospitalityState,
  type JudgeHospitalityItem,
  type JudgeHospitalityJudge,
  type JudgeHospitalityState,
} from './judgeHospitality';

interface JudgeHospitalityCardProps {
  judges: JudgeHospitalityJudge[];
  showId: string;
}

function itemFor(state: JudgeHospitalityState, judgeId: string): JudgeHospitalityItem {
  return state[judgeId] ?? EMPTY_HOSPITALITY_ITEM;
}

export function JudgeHospitalityCard({ judges, showId }: JudgeHospitalityCardProps) {
  return <JudgeHospitalityCardContent key={showId} judges={judges} showId={showId} />;
}

function JudgeHospitalityCardContent({ judges, showId }: JudgeHospitalityCardProps) {
  const [state, setState] = useState<JudgeHospitalityState>(() =>
    readJudgeHospitalityState(showId, judges)
  );
  const summary = useMemo(() => summarizeJudgeHospitality(judges, state), [judges, state]);
  const reminders = summary.lunchPendingCount + summary.waterPendingCount;

  useEffect(() => {
    writeJudgeHospitalityState(showId, state);
  }, [showId, state]);

  function updateJudge(judgeId: string, patch: Partial<JudgeHospitalityItem>) {
    setState(current => {
      return {
        ...current,
        [judgeId]: {
          ...EMPTY_HOSPITALITY_ITEM,
          ...current[judgeId],
          ...patch,
        },
      };
    });
  }

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="judge-hospitality-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="judge-hospitality-title" className="text-base font-semibold">
            Judge hospitality
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Lunch orders, water, coffee, and small reminders for the judging team.
          </p>
        </div>
        <Badge variant={reminders > 0 ? 'secondary' : 'default'}>
          {judges.length === 0
            ? 'No judges'
            : reminders > 0
              ? `${reminders} reminders`
              : 'Handled'}
        </Badge>
      </div>

      {judges.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Add judges to the show before tracking lunch and drink reminders.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div role="group" aria-label="Judges tracked">
              <p className="text-xs font-medium uppercase text-muted-foreground">Judges</p>
              <p className="text-xl font-semibold">{summary.judgeCount}</p>
            </div>
            <div role="group" aria-label="Lunch orders captured">
              <p className="text-xs font-medium uppercase text-muted-foreground">Lunch orders</p>
              <p className="text-xl font-semibold">{summary.lunchOrderCount}</p>
            </div>
            <div role="group" aria-label="Water reminders remaining">
              <p className="text-xs font-medium uppercase text-muted-foreground">Water</p>
              <p className="text-xl font-semibold">{summary.waterPendingCount} left</p>
            </div>
            <div role="group" aria-label="Judges handled">
              <p className="text-xs font-medium uppercase text-muted-foreground">Handled</p>
              <p className="text-xl font-semibold">
                {summary.handledCount}/{summary.judgeCount}
              </p>
            </div>
          </div>

          <div className="mt-4 divide-y">
            {judges.map(judge => {
              const item = itemFor(state, judge.id);
              return (
                <div key={judge.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{judge.name}</p>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
                        <div className="space-y-2">
                          <Label htmlFor={`hospitality-lunch-${judge.id}`}>Lunch order</Label>
                          <Input
                            id={`hospitality-lunch-${judge.id}`}
                            value={item.lunchOrder}
                            onChange={event =>
                              updateJudge(judge.id, { lunchOrder: event.target.value })
                            }
                            placeholder="Turkey sandwich, no onion"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`hospitality-notes-${judge.id}`}>Notes</Label>
                          <Textarea
                            id={`hospitality-notes-${judge.id}`}
                            value={item.notes}
                            onChange={event => updateJudge(judge.id, { notes: event.target.value })}
                            rows={1}
                            placeholder="Coffee with cream"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 lg:w-72">
                      <div className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.waterDelivered}
                          aria-labelledby={`hospitality-water-${judge.id}`}
                          onCheckedChange={checked =>
                            updateJudge(judge.id, {
                              waterDelivered: checked === true,
                              waterDeclined: checked === true ? false : item.waterDeclined,
                            })
                          }
                        />
                        <Droplets className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span id={`hospitality-water-${judge.id}`}>
                          Water <span className="sr-only">delivered for {judge.name}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.waterDeclined}
                          aria-labelledby={`hospitality-water-declined-${judge.id}`}
                          onCheckedChange={checked =>
                            updateJudge(judge.id, {
                              waterDeclined: checked === true,
                              waterDelivered: checked === true ? false : item.waterDelivered,
                            })
                          }
                        />
                        <span id={`hospitality-water-declined-${judge.id}`}>
                          No water needed <span className="sr-only">for {judge.name}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.coffeeDelivered}
                          aria-labelledby={`hospitality-coffee-${judge.id}`}
                          onCheckedChange={checked =>
                            updateJudge(judge.id, { coffeeDelivered: checked === true })
                          }
                        />
                        <Coffee className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span id={`hospitality-coffee-${judge.id}`}>
                          Coffee <span className="sr-only">delivered for {judge.name}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.lunchDelivered}
                          aria-labelledby={`hospitality-lunch-delivered-${judge.id}`}
                          onCheckedChange={checked =>
                            updateJudge(judge.id, { lunchDelivered: checked === true })
                          }
                        />
                        <Utensils className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span id={`hospitality-lunch-delivered-${judge.id}`}>
                          Lunch delivered <span className="sr-only">for {judge.name}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
