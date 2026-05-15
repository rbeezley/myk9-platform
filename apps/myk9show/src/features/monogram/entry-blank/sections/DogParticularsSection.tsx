import { View } from '@react-pdf/renderer';
import type { EntryBlankDog } from '@/features/heritage/entry-blank/types';
import { Field, SectionHeader } from './pdfPrimitives';

export function DogParticularsSection({ dog }: { dog: EntryBlankDog }) {
  return (
    <View>
      <SectionHeader numeral="i" title="Particulars of the dog" />

      <View style={{ flexDirection: 'row' }}>
        <Field label="Registered name (in full)" value={dog.registeredName} width="66%" />
        <Field label="Call name" value={dog.callName} width="34%" />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Field label="Breed" value={dog.breed} width="33%" />
        <Field label="Variety / colour" value={dog.variety} width="33%" />
        <Field label="Sex" value={dog.sex} hint="M · F · S · N" width="34%" />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Field label="Date of birth" value={dog.dateOfBirth} width="33%" />
        <Field
          label="Place of birth"
          value={dog.placeOfBirth}
          hint="U.S.A. · Foreign"
          width="33%"
        />
        <Field label="A.K.C. registration number" value={dog.registrationNumber} width="34%" />
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
