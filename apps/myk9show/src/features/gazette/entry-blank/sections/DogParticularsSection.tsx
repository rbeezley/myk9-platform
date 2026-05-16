import { View } from '@react-pdf/renderer';
import type { EntryBlankDog } from '../types';
import { Field, SectionHead } from './pdfPrimitives';

/**
 * Section i. Particulars of the dog — same field grid as Heritage's §I,
 * styled with Gazette's lowercase-roman folio + mono uppercase title.
 */
export function DogParticularsSection({ dog }: { dog: EntryBlankDog }) {
  return (
    <View>
      <SectionHead folio="i." title="Particulars of the dog" kicker="all fields required" />

      <View style={{ flexDirection: 'row' }}>
        <Field label="Registered name" value={dog.registeredName} width="66%" />
        <Field label="Call name" value={dog.callName} width="34%" />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Field label="Breed / variety" value={dog.breed} width="33%" />
        <Field label="Variety" value={dog.variety} width="33%" />
        <Field label="Sex" value={dog.sex} hint="M · F · S · N" width="34%" />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Field label="Date of birth" value={dog.dateOfBirth} width="33%" />
        <Field label="Place of birth" value={dog.placeOfBirth} width="33%" />
        <Field label="AKC reg. no." value={dog.registrationNumber} width="34%" />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Field label="Sire" value={dog.sire} width="50%" />
        <Field label="Dam" value={dog.dam} width="50%" />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Field label="Breeder" value={dog.breeder} width="50%" />
        <Field label="Actual owner(s)" value={dog.actualOwners} width="50%" />
      </View>
    </View>
  );
}
