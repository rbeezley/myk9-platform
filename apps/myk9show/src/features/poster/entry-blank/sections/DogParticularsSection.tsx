import { View } from '@react-pdf/renderer';
import type { EntryBlankDog } from '@/features/heritage/entry-blank/types';
import { Field, SectionHeader } from './pdfPrimitives';

export function DogParticularsSection({ dog }: { dog: EntryBlankDog }) {
  return (
    <View>
      <SectionHeader number="01" title="Particulars of the dog" kicker="all fields required · print in ink" />

      <View style={{ flexDirection: 'row' }}>
        <Field label="Registered name" value={dog.registeredName} width="66%" />
        <Field label="Call name" value={dog.callName} width="34%" />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Field label="Breed / variety" value={dog.breed} width="33%" />
        <Field label="Sex" value={dog.sex} hint="M · F · S · N" width="17%" />
        <Field label="Date of birth" value={dog.dateOfBirth} width="25%" />
        <Field label="AKC reg. no." value={dog.registrationNumber} width="25%" />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Field label="Sire" value={dog.sire} variant="dotted" width="50%" />
        <Field label="Dam" value={dog.dam} variant="dotted" width="50%" />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Field label="Breeder" value={dog.breeder} variant="dotted" width="50%" />
        <Field label="Actual owner(s)" value={dog.actualOwners} variant="dotted" width="50%" />
      </View>
    </View>
  );
}
