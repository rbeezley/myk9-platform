import { View } from '@react-pdf/renderer';
import type { EntryBlankOwner } from '../types';
import { Field, SectionHead } from './pdfPrimitives';

/** Section iii. Owner & handler — labels match the design mock. */
export function OwnerHandlerSection({ owner }: { owner: EntryBlankOwner }) {
  return (
    <View>
      <SectionHead folio="iii." title="Owner & handler" />

      <View style={{ flexDirection: 'row' }}>
        <Field label="Owner name" value={owner.ownerName} width="50%" />
        <Field label="Handler (if different)" value={owner.handlerName} width="50%" />
      </View>
      <Field label="Mailing address" value={owner.mailingAddress} width="100%" />
      <View style={{ flexDirection: 'row' }}>
        <Field label="City" value={owner.city} width="50%" />
        <Field label="State" value={owner.state} width="17%" />
        <Field label="ZIP" value={owner.zip} width="33%" />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Field label="Phone" value={owner.telephone} width="33%" />
        <Field label="Email" value={owner.email} width="50%" />
        <Field
          label="Junior age"
          value={owner.juniorHandlerAge}
          hint="leave blank if N/A"
          width="17%"
        />
      </View>
    </View>
  );
}
