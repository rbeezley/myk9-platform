import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowTrials } from '@/hooks/queries/useShowTrials';
import { useQuery } from '@tanstack/react-query';
import { getSecretaryShows } from '@/services/database/queries/showQueries';

export const RunOrderTrialPicker: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [showId, setShowId] = useState<string>('');
  const [trialId, setTrialId] = useState<string>('');

  const { data: shows = [], isLoading: isLoadingShows } = useQuery({
    queryKey: ['runorder-picker-shows', user?.id],
    queryFn: async () => {
      const { data, error } = await getSecretaryShows(user?.id || '');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: trials = [], isLoading: isLoadingTrials } = useShowTrials(showId || null);

  const handleContinue = () => {
    if (trialId) navigate(`/secretary/run-order?trialId=${trialId}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select a trial</CardTitle>
        <CardDescription>
          Pick a show and trial to manage its run order, schedule, and personnel assignments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Show</label>
          <Select
            value={showId}
            onValueChange={value => {
              setShowId(value);
              setTrialId('');
            }}
            disabled={isLoadingShows}
          >
            <SelectTrigger>
              <SelectValue placeholder={isLoadingShows ? 'Loading…' : 'Select a show'} />
            </SelectTrigger>
            <SelectContent>
              {shows.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name ?? 'Unnamed show'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Trial</label>
          <Select value={trialId} onValueChange={setTrialId} disabled={!showId || isLoadingTrials}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !showId
                    ? 'Pick a show first'
                    : isLoadingTrials
                      ? 'Loading trials…'
                      : 'Select a trial'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {trials.map(t => {
                const id = String(t.id ?? '');
                const name = typeof t.name === 'string' ? t.name : `Trial ${t.trial_number ?? ''}`;
                const date = typeof t.date === 'string' ? t.date : 'No date';
                return (
                  <SelectItem key={id} value={id}>
                    {name} — {date}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleContinue} disabled={!trialId}>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
