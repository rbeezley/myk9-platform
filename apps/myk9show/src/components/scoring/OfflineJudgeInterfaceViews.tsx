/**
 * Sub-components for the OfflineJudgeInterface
 *
 * Extracted view components for Authentication, Setup, EntryList,
 * Review, Completed, and the StatusBar.
 */

import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Clock,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import type { ScoringFormat, BaseScore, ValidationResult } from '@/types/scoring-types';
import type { UnifiedEntryData } from '@/types/unified-entry-types';
import type {
  EntryWithStatus,
  JudgeCredentials,
  AuthFormState,
} from './OfflineJudgeInterface.types';

// Format-specific scoring components
import { ScentWorkScoresheet } from './ScentWorkScoresheet';
import { AgilityScoresheet } from './format-specific/AgilityScoresheet';
import { ObedienceScoresheet } from './format-specific/ObedienceScoresheet';
import { RallyScoresheet } from './format-specific/RallyScoresheet';

// ---------- StatusBar ----------

interface StatusBarProps {
  isOffline: boolean;
  isSyncing: boolean;
  syncStatus: 'synced' | 'pending' | 'error' | 'idle';
  progress: number;
  sessionActive: boolean;
  completedCount: number;
  totalCount: number;
  onForceSync: () => void;
  onEndSession: () => void;
}

export function StatusBar({
  isOffline,
  isSyncing,
  syncStatus,
  progress,
  sessionActive,
  completedCount,
  totalCount,
  onForceSync,
  onEndSession,
}: StatusBarProps) {
  return (
    <div className="bg-card dark:bg-warm-900 border-b border-gray-200 dark:border-warm-600 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Online/Offline Status */}
          <div className="flex items-center space-x-2">
            {isOffline ? (
              <WifiOff className="h-4 w-4 text-red-500" />
            ) : (
              <Wifi className="h-4 w-4 text-green-500" />
            )}
            <span className="text-sm font-medium">{isOffline ? 'Offline' : 'Online'}</span>
          </div>

          {/* Sync Status */}
          <div className="flex items-center space-x-2">
            {isSyncing ? (
              <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
            ) : (
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  syncStatus === 'synced' && 'bg-green-500',
                  syncStatus === 'pending' && 'bg-yellow-500',
                  syncStatus === 'error' && 'bg-red-500'
                )}
              />
            )}
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {syncStatus === 'synced' && 'Synced'}
              {syncStatus === 'pending' && 'Sync Pending'}
              {syncStatus === 'error' && 'Sync Error'}
            </span>
          </div>

          {/* Progress */}
          {sessionActive && (
            <div className="flex items-center space-x-2">
              <Progress value={progress} className="w-24" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {completedCount}/{totalCount}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {!isOffline && (
            <Button variant="outline" size="sm" onClick={onForceSync} disabled={isSyncing}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Sync
            </Button>
          )}
          {sessionActive && (
            <Button variant="outline" size="sm" onClick={onEndSession}>
              End Session
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- AuthenticationView ----------

interface AuthenticationViewProps {
  authForm: AuthFormState;
  selectedFormat: ScoringFormat;
  onAuthFormChange: (updater: (prev: AuthFormState) => AuthFormState) => void;
  onFormatChange: (format: ScoringFormat) => void;
  onAuthenticate: () => void;
}

export function AuthenticationView({
  authForm,
  selectedFormat,
  onAuthFormChange,
  onFormatChange,
  onAuthenticate,
}: AuthenticationViewProps) {
  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Judge Authentication</CardTitle>
        <CardDescription>Enter your credentials to start judging</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Judge ID</label>
          <input
            type="text"
            className="w-full mt-1 px-3 py-2 border rounded-md"
            value={authForm.judgeId}
            onChange={e => onAuthFormChange(prev => ({ ...prev, judgeId: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Judge Name</label>
          <input
            type="text"
            className="w-full mt-1 px-3 py-2 border rounded-md"
            value={authForm.judgeName}
            onChange={e => onAuthFormChange(prev => ({ ...prev, judgeName: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Format</label>
          <select
            className="w-full mt-1 px-3 py-2 border rounded-md"
            value={selectedFormat}
            onChange={e => onFormatChange(e.target.value as ScoringFormat)}
          >
            <option value="scent_work">Scent Work</option>
            <option value="agility">Agility</option>
            <option value="obedience">Obedience</option>
            <option value="rally">Rally</option>
            <option value="conformation">Conformation</option>
          </select>
        </div>
        <Button
          onClick={onAuthenticate}
          className="w-full"
          disabled={!authForm.judgeId || !authForm.judgeName}
        >
          Authenticate
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------- SetupView ----------

interface SetupViewProps {
  credentials: JudgeCredentials;
  selectedFormat: ScoringFormat;
  activeClassId: string | undefined;
  onStartSession: () => void;
}

export function SetupView({
  credentials,
  selectedFormat,
  activeClassId,
  onStartSession,
}: SetupViewProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Setup Judging Session</h1>
        <p className="text-muted-foreground mt-2">
          Configure your judging session for {selectedFormat.replace('_', ' ')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Judge Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-muted-foreground">Judge ID</span>
              <p className="font-medium">{credentials?.judgeId}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Judge Name</span>
              <p className="font-medium">{credentials?.judgeName}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Format</span>
              <p className="font-medium">{selectedFormat.replace('_', ' ')}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Class ID</span>
              <p className="font-medium">{activeClassId}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button onClick={onStartSession} size="lg">
          Start Judging Session
        </Button>
      </div>
    </div>
  );
}

// ---------- EntryListView ----------

interface EntryListViewProps {
  selectedFormat: ScoringFormat;
  activeClassId: string | undefined;
  credentials: JudgeCredentials;
  entryCount: number;
  progress: number;
  entriesWithStatus: EntryWithStatus[];
  onAdvanceWorkflow: () => void;
  onSelectEntry: (entryId: string) => void;
}

export function EntryListView({
  selectedFormat,
  activeClassId,
  credentials,
  entryCount,
  progress,
  entriesWithStatus,
  onAdvanceWorkflow,
  onSelectEntry,
}: EntryListViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {selectedFormat.replace('_', ' ')} - Class {activeClassId}
          </h1>
          <p className="text-muted-foreground">
            Judge: {credentials?.judgeName} | {entryCount} entries
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={onAdvanceWorkflow}>
            <ArrowRight className="h-4 w-4 mr-2" />
            Advance Workflow
          </Button>
        </div>
      </div>

      {/* Progress Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}% complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Entry Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {entriesWithStatus.map(entry => (
          <Card
            key={entry.id}
            className={cn(
              'cursor-pointer transition-all duration-200 hover:shadow-md',
              entry.isCurrent && 'ring-2 ring-primary',
              entry.isCompleted && 'bg-green-50 dark:bg-green-950'
            )}
            onClick={() => onSelectEntry(entry.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-lg font-bold">#{entry.armband}</div>
                <div>
                  {entry.isCompleted ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : entry.isCurrent ? (
                    <Clock className="h-5 w-5 text-blue-500" />
                  ) : (
                    <div className="h-5 w-5" />
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <p className="font-medium">{entry.dogName}</p>
                <p className="text-sm text-muted-foreground">{entry.handlerName}</p>
                <Badge
                  variant={
                    entry.isCompleted ? 'default' : entry.isCurrent ? 'secondary' : 'outline'
                  }
                >
                  {entry.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- CompletedView ----------

interface CompletedViewProps {
  onStartNew: () => void;
}

export function CompletedView({ onStartNew }: CompletedViewProps) {
  return (
    <div className="max-w-2xl mx-auto text-center space-y-6">
      <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
      <div>
        <h1 className="text-2xl font-bold">Session Completed</h1>
        <p className="text-muted-foreground mt-2">
          Judging session has been successfully completed.
        </p>
      </div>
      <Button onClick={onStartNew}>Start New Session</Button>
    </div>
  );
}

// ---------- ScoresheetRenderer ----------

interface ScoresheetRendererProps {
  selectedFormat: ScoringFormat;
  currentEntry: UnifiedEntryData | undefined;
  validationErrors: Array<{ field: string; message: string }>;
  onScoreSubmit: (score: BaseScore) => Promise<ValidationResult>;
  onCancel: () => void;
}

export function ScoresheetRenderer({
  selectedFormat,
  currentEntry,
  validationErrors,
  onScoreSubmit,
  onCancel,
}: ScoresheetRendererProps) {
  if (!currentEntry) return null;

  const filteredErrors = validationErrors.filter(err => {
    const error = err as unknown as { entryId?: string };
    return error.entryId === currentEntry.id;
  });
  const validationResult = {
    isValid: filteredErrors.length === 0,
    errors: filteredErrors.map(err => ({ ...err, code: 'VALIDATION_ERROR' })),
    warnings: [],
  };

  const scoresheetProps = {
    entry: currentEntry,
    onSave: async (result: unknown) => {
      const res = await onScoreSubmit(result as BaseScore);
      return res;
    },
    onCancel,
    validationErrors: validationResult,
  };

  switch (selectedFormat) {
    case 'scent_work':
      return <ScentWorkScoresheet {...scoresheetProps} />;
    case 'agility':
      return <AgilityScoresheet {...scoresheetProps} />;
    case 'obedience':
      return <ObedienceScoresheet {...scoresheetProps} />;
    case 'rally':
      return <RallyScoresheet {...scoresheetProps} />;
    default:
      return (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Scoresheet for format &quot;{selectedFormat}&quot; is not yet implemented.
          </AlertDescription>
        </Alert>
      );
  }
}
