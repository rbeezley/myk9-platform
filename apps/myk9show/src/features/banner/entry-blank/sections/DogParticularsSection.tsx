import { View } from '@react-pdf/renderer';
import type { EntryBlankDog } from '@/features/heritage/entry-blank/types';
import { Field, SectionHeader } from './pdfPrimitives';

export function DogParticularsSection({ dog, flag }: { dog: EntryBlankDog; flag: string }) {
  return (
    <View>
      <SectionHeader number="01" title="The dog" flag={flag} />

      <View style={{ flexDirection: 'row' }}>
        <Field label="Registered name (in full)" value={dog.registeredName} width="66%" flag={flag} />
        <Field label="Call name" value={dog.callName} width="34%" flag={flag} />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Field label="Breed" value={dog.breed} width="33%" flag={flag} />
        <Field label="Variety / colour" value={dog.variety} width="33%" flag={flag} />
        <Field label="Sex" value={dog.sex} hint="M · F · S · N" width="34%" flag={flag} />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Field label="Date of birth" value={dog.dateOfBirth} width="33%" flag={flag} />
        <Field
          label="Place of birth"
          value={dog.placeOfBirth}
          hint="U.S.A. · Foreign"
          width="33%"
          flag={flag}
        />
        <Field label="A.K.C. registration number" value={dog.registrationNumber} width="34%" flag={flag} />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Field label="Sire" value={dog.sire} variant="dotted" width="50%" flag={flag} />
        <Field label="Dam" value={dog.dam} variant="dotted" width="50%" flag={flag} />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Field label="Breeder" value={dog.breeder} variant="dotted" width="50%" flag={flag} />
        <Field label="Actual owner(s)" value={dog.actualOwners} variant="dotted" width="50%" flag={flag} />
      </View>
    </View>
  );
}
