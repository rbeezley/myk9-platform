import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatDisplayDate } from '../utils';
import type { Dog } from '@/types/dog-types';

interface AboutCardProps {
  dog: Dog;
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | number | null | undefined;
  mono?: boolean | undefined;
}) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className={mono ? 'font-mono text-xs text-right' : 'font-medium text-right truncate'}>
        {String(value)}
      </span>
    </div>
  );
}

const AboutCard: React.FC<AboutCardProps> = ({ dog }) => {
  const [now] = useState(() => Date.now());
  const breeds =
    Array.from(
      new Set(
        (dog.registrations ?? [])
          .map(r => r.breed)
          .filter((b): b is string => !!b && b !== 'Unknown')
      )
    ).join(', ') || null;

  const sex = dog.gender ? dog.gender.charAt(0).toUpperCase() + dog.gender.slice(1) : null;

  const age = useMemo(() => {
    if (!dog.dateOfBirth) return null;
    const years = Math.floor(
      (now - new Date(dog.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
    );
    return years === 1 ? '1 yr old' : `${years} yrs old`;
  }, [dog.dateOfBirth, now]);

  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          About
        </span>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        <Row label="Breed" value={breeds} />
        <Row label="Sex" value={sex} />
        <Row label="Age" value={age} />
        <Row
          label="Date of birth"
          value={dog.dateOfBirth ? formatDisplayDate(dog.dateOfBirth) : null}
        />
        <Row label="Microchip" value={dog.microchipNumber} mono />
        <Row label="Height" value={dog.height != null ? `${dog.height}"` : null} />
        <Row label="Weight" value={dog.weight != null ? `${dog.weight} lbs` : null} />
        <Row label="Color" value={dog.color} />
      </CardContent>
    </Card>
  );
};

export default AboutCard;
