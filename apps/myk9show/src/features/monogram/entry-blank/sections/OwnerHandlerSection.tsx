import { View } from '@react-pdf/renderer';
import type { EntryBlankOwner } from '@/features/heritage/entry-blank/types';
import { Field, SectionHeader } from './pdfPrimitives';

export function OwnerHandlerSection({ owner }: { owner: EntryBlankOwner }) {
  return (
    <View>
      <SectionHeader numeral="iii" title="Owner & handler" />

      <View style={{ flexDirection: 'row' }}>
        <Field label="Owner's name (as on registration)" value={owner.ownerName} width="50%" />
        <Field label="Handler at this trial (if not owner)" value={owner.handlerName} width="50%" />
      </View>

      <Field label="Mailing address" value={owner.mailingAddress} width="100%" />

      <View style={{ flexDirection: 'row' }}>
        <Field label="City" value={owner.city} width="33%" />
        <Field label="State" value={owner.state} width="17%" />
        <Field label="ZIP" value={owner.zip} width="25%" />
        <Field label="Telephone" value={owner.telephone} width="25%" />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Field label="Email (for confirmation)" value={owner.email} width="66%" />
        <Field
          label="Junior handler? (age)"
          value={owner.juniorHandlerAge}
          hint="leave blank if not applicable"
          width="34%"
        />
      </View>
    </View>
  );
}
