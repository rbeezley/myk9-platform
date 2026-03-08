import React, { useMemo } from 'react';
import { User } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { FilterableFieldGrid, type FieldDefinition } from '@/components/common/FilterableFieldGrid';
import type { UserFormData } from './userDetailsTypes';

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

interface ContactInformationCardProps {
  firstName: string;
  lastName: string;
  email: string;
  formData: UserFormData;
}

const ContactInformationCard: React.FC<ContactInformationCardProps> = ({
  firstName,
  lastName,
  email,
  formData,
}) => {
  const fields: FieldDefinition[] = useMemo(
    () => [
      { label: 'First Name', value: firstName },
      { label: 'Last Name', value: lastName },
      {
        label: 'Email',
        value: email,
        render: email ? (
          <a
            href={`mailto:${email}`}
            className="text-sm font-medium text-primary hover:text-primary/80
                       transition-colors duration-200 hover:underline truncate"
          >
            {email}
          </a>
        ) : undefined,
      },
      {
        label: 'Phone',
        value: formData.phone,
        render: formData.phone ? (
          <a
            href={`tel:${formData.phone.replace(/[^\d]/g, '')}`}
            className="text-sm font-medium text-primary hover:text-primary/80
                       transition-colors duration-200 hover:underline"
          >
            {formatPhoneNumber(formData.phone)}
          </a>
        ) : undefined,
      },
      { label: 'Street', value: formData.address },
      { label: 'City', value: formData.city },
      { label: 'State', value: formData.state },
      { label: 'Zip Code', value: formData.zipCode },
    ],
    [firstName, lastName, email, formData]
  );

  return (
    <Card
      className="group bg-gradient-to-br from-card/95 to-card/80 myk9-subtle-card-border
                     rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                     hover:shadow-xl hover:-translate-y-1 hover:border-primary/20"
    >
      <div
        className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] to-transparent
                      opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl"
      />

      <div className="relative space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
            <User className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Contact Information
          </h3>
        </div>

        <FilterableFieldGrid sectionKey="contact-info" fields={fields} columns={4} />
      </div>
    </Card>
  );
};

export default ContactInformationCard;
