import { useState } from 'react';
import type { ResultCardModel } from './resultCardModel';

interface ResultCardProps {
  model: ResultCardModel;
}

export function ResultCard({ model }: ResultCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-primary/20 bg-card text-card-foreground shadow-sm">
      <div className="bg-primary/10 px-4 py-3 text-center">
        <ResultPhoto model={model} />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <h2 className="text-2xl font-bold tracking-normal">{model.dogName}</h2>
          {model.armband ? (
            <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              Armband {model.armband}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{model.showName}</p>
      </div>
      <div className="space-y-3 px-4 py-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-md border border-success/30 bg-success/15 px-3 py-1.5 text-2xl font-bold text-success">
            {model.resultLabel}
          </span>
          {model.placementLabel ? (
            <span className="rounded-md border border-primary/20 bg-primary/10 px-3 py-1.5 text-xl font-bold text-primary">
              {model.placementLabel}
            </span>
          ) : null}
        </div>
        <div className="text-center">
          <p className="font-semibold">{model.className}</p>
          <p className="text-sm text-muted-foreground">{model.showDateLabel}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {model.timeLabel ? <ResultFact label="Time" value={model.timeLabel} /> : null}
          {model.faultsLabel ? <ResultFact label="Faults" value={model.faultsLabel} /> : null}
          {model.classNumber ? <ResultFact label="Class" value={model.classNumber} /> : null}
        </div>
      </div>
    </div>
  );
}

function ResultPhoto({ model }: ResultCardProps) {
  const [failed, setFailed] = useState(false);
  const initial = model.dogName.trim().charAt(0).toUpperCase() || 'Q';

  return (
    <div className="mx-auto mb-2 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-primary/15 text-3xl font-bold text-primary shadow-sm">
      {model.photoUrl && !failed ? (
        <img
          src={model.photoUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  );
}

function ResultFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
