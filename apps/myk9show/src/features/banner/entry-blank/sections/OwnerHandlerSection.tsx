import { View } from '@react-pdf/renderer';
import type { EntryBlankOwner } from '@/features/heritage/entry-blank/types';
import { Field, SectionHeader } from './pdfPrimitives';

export function OwnerHandlerSection({ owner, flag }: { owner: EntryBlankOwner; flag: string }) {
  return (
    <View>
      <SectionHeader number="03" title="Owner & handler" flag={flag} />

      <View style={{ flexDirection: 'row' }}>
        <Field label="Owner's name (as on registration)" value={owner.ownerName} width="50%" flag={flag} />
        <Field label="Handler at this trial (if not owner)" value={owner.handlerName} width="50%" flag={flag} />
      </View>

      <Field label="Mailing address" value={owner.mailingAddress} width="100%" flag={flag} />

      <View style={{ flexDirection: 'row' }}>
        <Field label="City" value={owner.city} width="33%" flag={flag} />
        <Field label="State" value={owner.state} width="17%" flag={flag} />
        <Field label="ZIP" value={owner.zip} width="25%" flag={flag} />
        <Field label="Telephone" value={owner.telephone} width="25%" flag={flag} />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Field label="Email (for confirmation)" value={owner.email} width="66%" flag={flag} />
        <Field
          label="Junior handler? (age)"
          value={owner.juniorHandlerAge}
          hint="leave blank if not applicable"
          width="34%"
          flag={flag}
        />
      </View>
    </View>
  );
}
