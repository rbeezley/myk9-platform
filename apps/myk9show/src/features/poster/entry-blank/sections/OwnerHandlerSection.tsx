import { View } from '@react-pdf/renderer';
import type { EntryBlankOwner } from '@/features/heritage/entry-blank/types';
import { Field, SectionHeader } from './pdfPrimitives';

export function OwnerHandlerSection({ owner }: { owner: EntryBlankOwner }) {
  return (
    <View>
      <SectionHeader number="03" title="Owner & handler" />

      <View style={{ flexDirection: 'row' }}>
        <Field label="Owner name" value={owner.ownerName} width="50%" />
        <Field label="Handler (if different)" value={owner.handlerName} width="50%" />
      </View>

      <Field label="Mailing address" value={owner.mailingAddress} width="100%" />

      <View style={{ flexDirection: 'row' }}>
        <Field label="City" value={owner.city} width="40%" />
        <Field label="State" value={owner.state} width="15%" />
        <Field label="ZIP" value={owner.zip} width="20%" />
        <Field label="Phone" value={owner.telephone} width="25%" />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Field label="Email" value={owner.email} width="66%" />
        <Field
          label="Junior age"
          value={owner.juniorHandlerAge}
          hint="leave blank if N/A"
          width="34%"
        />
      </View>
    </View>
  );
}
