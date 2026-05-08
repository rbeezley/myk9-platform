import { View } from '@react-pdf/renderer';
import type { EntryBlankDog } from '../types';
import { Field, SectionHeader } from './pdfPrimitives';

export function DogParticularsSection({ dog }: { dog: EntryBlankDog }) {
  return (
    <View>
      <SectionHeader numeral="§ I" title="Particulars of the Dog" />

      {/* Row 1: registered name (66%) + call name (33%) */}
      <View style={{ flexDirection: 'row' }}>
        <Field label="Registered name (in full)" value={dog.registeredName} width="66%" />
        <Field label="Call name" value={dog.callName} width="34%" />
      </View>

      {/* Row 2: breed · variety · sex */}
      <View style={{ flexDirection: 'row' }}>
        <Field label="Breed" value={dog.breed} width="33%" />
        <Field label="Variety / colour" value={dog.variety} width="33%" />
        <Field label="Sex" value={dog.sex} hint="M · F · S · N" width="34%" />
      </View>

      {/* Row 3: DOB · place of birth · AKC number */}
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

      {/* Row 4: sire (dotted) · dam (dotted) */}
      <View style={{ flexDirection: 'row' }}>
        <Field label="Sire" value={dog.sire} variant="dotted" width="50%" />
        <Field label="Dam" value={dog.dam} variant="dotted" width="50%" />
      </View>

      {/* Row 5: breeder (dotted) · actual owners (dotted) */}
      <View style={{ flexDirection: 'row' }}>
        <Field label="Breeder" value={dog.breeder} variant="dotted" width="50%" />
        <Field label="Actual owner(s)" value={dog.actualOwners} variant="dotted" width="50%" />
      </View>
    </View>
  );
}
